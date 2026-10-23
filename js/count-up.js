// The hero numbers counting up (imported by js/layout.js; no page needs to
// know about it, like js/me-highlight.js): a number drawn into a hero's
// stat tile (.profile-hero .stat-tile-value — player, commander, league,
// event, archetype and account pages) runs up from 0 to it, quickly — once:
// not again when the same tile shows the same number redrawn (event.html
// draws its tiles twice). Started once the page is shown (not under the
// loading splash). Whatever follows the number ("%", decimals) kept; text
// that isn't a number ("—") left alone. Nothing moves under reduced motion.

const DURATION = 800;
const NUMBER = /^(\d+)(?:([.,])(\d+))?(\s?%)?$/;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Per hero (a new one on every page view): "label=value" already counted.
const counted = new WeakMap();
// Tiles whose text is being changed by the count itself.
const running = new WeakSet();
const queue = new Set();

function countUp(el) {
  if (!el.isConnected || running.has(el)) return;
  const hero = el.closest(".profile-hero");
  const text = el.textContent.trim();
  const match = NUMBER.exec(text);
  if (!hero || !match) return;
  const label = el.parentElement?.querySelector(".stat-tile-label")?.textContent ?? "";
  let seen = counted.get(hero);
  if (!seen) counted.set(hero, (seen = new Set()));
  if (seen.has(`${label}=${text}`)) return;
  seen.add(`${label}=${text}`);

  const [, whole, separator = ".", fraction = "", suffix = ""] = match;
  const target = Number(`${whole}.${fraction || 0}`);
  if (reducedMotion.matches || target === 0) return;
  const format = (x) => {
    const s = x.toFixed(fraction.length);
    return `${separator === "," ? s.replace(".", ",") : s}${suffix}`;
  };
  // Its final width kept from the start, so nothing beside it moves.
  el.style.minWidth = `${el.getBoundingClientRect().width}px`;
  running.add(el);
  el.textContent = format(0);
  const start = performance.now();
  let done = false;
  // The real number back, for sure: also by a timer, in case the frames
  // stop (a tab sent to the background pauses them).
  const finish = () => {
    if (done) return;
    done = true;
    el.textContent = text;
    el.style.minWidth = "";
    // After the observer has seen this last change.
    queueMicrotask(() => running.delete(el));
  };
  setTimeout(finish, DURATION + 150);
  const step = (now) => {
    if (done) return;
    const t = Math.min(1, (now - start) / DURATION);
    if (t < 1 && el.isConnected) {
      el.textContent = format(target * (1 - (1 - t) ** 3));
      requestAnimationFrame(step);
    } else {
      finish();
    }
  };
  requestAnimationFrame(step);
}

function flush() {
  if (document.body.classList.contains("is-loading")) return;
  const els = [...queue];
  queue.clear();
  els.forEach(countUp);
}

// A changed node's tile (its text set), and — for an added one — the tiles
// inside it.
function collect(node, added) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el) return;
  const own = el.closest(".stat-tile-value");
  if (own) queue.add(own);
  if (added && el === node) for (const tile of el.querySelectorAll(".stat-tile-value")) queue.add(tile);
}

new MutationObserver((records) => {
  for (const r of records) {
    collect(r.target, false);
    for (const node of r.addedNodes) collect(node, true);
  }
  // Only heroes' tiles, and not the count's own changes.
  for (const el of queue) if (running.has(el) || !el.closest(".profile-hero")) queue.delete(el);
  if (queue.size) flush();
}).observe(document.body, { childList: true, characterData: true, subtree: true });

// The page shown (the loading splash gone): the tiles drawn under it.
new MutationObserver(flush).observe(document.body, { attributes: true, attributeFilter: ["class"] });
