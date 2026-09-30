// player.html's "Album comandanti": a card carousel instead of a table —
// one commander's card (Scryfall image) at a time, its neighbours peeking
// in on either side turned away as if on a drum (applyDepth), with the
// current one's stats (times played, winrate, first and last played) under
// it on phones and
// beside it on desktop (styles.css .cmd-carousel). The track is a native
// scroll-snap row, so touch swipes and trackpads already land on whole
// cards; ‹ › arrows (hidden on touch devices, like js/chart-carousel.js's),
// the arrow keys, and clicking a peeking card move it too.

import { escapeHtml, commanderPairWithColors, formatDate } from "./ui.js";
import { winRatePct } from "./winrate.js";

// Scryfall's collection endpoint takes up to this many cards per request —
// one request for a whole player's commanders instead of one each (and
// Scryfall asks clients to keep to ~10 requests a second).
const SCRYFALL_BATCH = 75;

// Lowercased card name -> front image URL ("normal" size, same as
// commander.html's card). Keyed by both the full name and each face's own,
// since a double-faced commander may be stored under its front face's name
// ("A") while Scryfall's full name is "A // B". Only the front face is ever
// used. Never rejects — a missing image just leaves the card's placeholder.
async function fetchCardImages(names) {
  const images = new Map();
  for (let i = 0; i < names.length; i += SCRYFALL_BATCH) {
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identifiers: names.slice(i, i + SCRYFALL_BATCH).map((name) => ({ name })) }),
      });
      if (!res.ok) continue;
      for (const card of (await res.json()).data ?? []) {
        const url = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
        if (!url) continue;
        for (const name of [card.name, ...(card.card_faces ?? []).map((f) => f.name)]) {
          images.set(name.toLowerCase(), url);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
  return images;
}

const ARROW_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
const ARROW_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';

/**
 * @param {HTMLElement} el
 * @param {Array<{key: string, commander: object, partner: object|null, timesPlayed: number,
 *   firstPlayed: string|null, lastPlayed: string|null}>} items
 *   in display order. A commander + partner pair shows the primary's card.
 * @returns {{ setRecords: (records: Map<string, {wins: number, draws: number, losses: number}>) => void }}
 *   the Winrate tile's match record per item key, handed over once the
 *   player's matches have loaded (after the carousel is already showing) —
 *   "…" until then.
 */
export function renderCommanderCarousel(el, items) {
  if (items.length === 0) {
    el.innerHTML = '<p class="page-empty">Nessun dato registrato per questo giocatore.</p>';
    return { setRecords() {} };
  }
  let records = null;

  el.innerHTML = `<div class="cmd-carousel">
    <div class="cmd-carousel-main">
      <div class="cmd-carousel-track" tabindex="0" role="region" aria-label="Album comandanti">
        ${items
          .map(
            (c, i) => `<div class="cmd-carousel-slide is-loading" data-index="${i}">
              <span class="cmd-carousel-fallback">${escapeHtml(c.commander.name)}</span>
            </div>`
          )
          .join("")}
      </div>
      <div class="cmd-carousel-nav">
        <button type="button" class="chart-carousel-arrow" data-dir="-1" aria-label="Commander precedente">${ARROW_PREV}</button>
        <div class="chart-carousel-dots cmd-carousel-dots" aria-hidden="true"></div>
        <button type="button" class="chart-carousel-arrow" data-dir="1" aria-label="Commander successivo">${ARROW_NEXT}</button>
      </div>
    </div>
    <div class="cmd-carousel-stats" aria-live="polite">
      <div class="cmd-carousel-name"></div>
      <div class="cmd-carousel-tiles">
        <div class="stat-tile">
          <div class="stat-tile-label">Volte giocato</div>
          <div class="stat-tile-value cmd-carousel-stat-value" data-stat="times"></div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-label">Winrate</div>
          <div class="stat-tile-value cmd-carousel-stat-value" data-stat="winrate"></div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-label">Prima partita</div>
          <div class="stat-tile-value cmd-carousel-stat-value" data-stat="first"></div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-label">Ultima partita</div>
          <div class="stat-tile-value cmd-carousel-stat-value" data-stat="last"></div>
        </div>
      </div>
    </div>
  </div>`;

  const track = el.querySelector(".cmd-carousel-track");
  const slides = [...track.children];
  const dotsEl = el.querySelector(".cmd-carousel-dots");
  const nameEl = el.querySelector(".cmd-carousel-name");
  const timesEl = el.querySelector('[data-stat="times"]');
  const lastEl = el.querySelector('[data-stat="last"]');
  const firstEl = el.querySelector('[data-stat="first"]');
  const winrateEl = el.querySelector('[data-stat="winrate"]');
  const prevBtn = el.querySelector('[data-dir="-1"]');
  const nextBtn = el.querySelector('[data-dir="1"]');
  let active = -1;

  // The slide whose center is nearest the track's — offsetLeft ignores the
  // scale() on the non-active ones, so this doesn't shift as they animate.
  function nearestIndex() {
    return Math.max(0, Math.min(items.length - 1, Math.round((track.scrollLeft + halfWidth - centers[0]) / step)));
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    slides.forEach((s, j) => s.classList.toggle("is-active", j === i));
    const c = items[i];
    nameEl.innerHTML = commanderPairWithColors(c.commander, c.partner);
    timesEl.textContent = c.timesPlayed;
    lastEl.innerHTML = formatDate(c.lastPlayed);
    firstEl.innerHTML = formatDate(c.firstPlayed);
    renderWinrate();
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === items.length - 1;
    renderDots(i);
  }

  // Match-basis winrate (js/winrate.js). "—" for a commander with no match
  // played (e.g. dropped before round 1).
  function renderWinrate() {
    if (!records) {
      winrateEl.textContent = "…";
      return;
    }
    const r = records.get(items[active].key);
    const rate = r ? winRatePct(r.wins, r.wins + r.draws + r.losses) : null;
    winrateEl.textContent = rate === null ? "—" : `${rate}%`;
  }

  // Not one dot per card (there can be dozens): a window of up to 3 — the
  // current card's (red) and its neighbours' (lighter). On the first/last
  // card, which only have one neighbour, the red dot moves to that end
  // ("• ○ ○" / "○ ○ •").
  function renderDots(i) {
    const count = Math.min(3, items.length);
    const start = Math.max(0, Math.min(i - 1, items.length - count));
    dotsEl.innerHTML = Array.from(
      { length: count },
      (_, k) => `<span class="chart-carousel-dot${start + k === i ? " is-active" : ""}"></span>`
    ).join("");
  }

  // The cylinder look: each card turns away and shrinks the further it is
  // from the center (in card steps, capped at 2 — past that it's off-screen
  // anyway), recomputed every scroll frame so it follows the finger rather
  // than jumping between states. rotateY(+) turns a right-hand card's
  // outer (right) edge away from the viewer, rotateY(-) a left-hand one's,
  // like the sides of a drum.
  // Card centers and step, measured once (and again on resize) rather than
  // read back from the layout on every scroll frame — only scrollLeft is
  // read per frame, keeping the drag smooth.
  let centers = [];
  let step = 1;
  let halfWidth = 0;
  function measure() {
    centers = slides.map((s) => s.offsetLeft + s.offsetWidth / 2);
    // A lone card has no neighbour to measure the step from — its own width
    // stands in (a tiny fallback like 1px would blow a sub-pixel offset from
    // the center up into "2 cards away" and turn it sideways).
    step = (slides.length > 1 ? centers[1] - centers[0] : slides[0].offsetWidth) || 1;
    halfWidth = track.clientWidth / 2;
  }

  function applyDepth() {
    const center = track.scrollLeft + halfWidth;
    slides.forEach((s, i) => {
      const offset = Math.max(-2, Math.min(2, (centers[i] - center) / step));
      const dist = Math.abs(offset);
      s.style.transform = `perspective(1000px) rotateY(${offset * 26}deg) scale(${1 - dist * 0.1})`;
      // Mild — the track's edge fade (styles.css mask) already dims them.
      s.style.opacity = String(1 - Math.min(dist, 1) * 0.2);
    });
  }

  function go(i) {
    track.scrollTo({ left: centers[Math.max(0, Math.min(items.length - 1, i))] - halfWidth, behavior: "smooth" });
  }

  let frame = 0;
  track.addEventListener(
    "scroll",
    () => {
      // At most one update per frame, however many scroll events arrive.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyDepth();
        setActive(nearestIndex());
      });
    },
    { passive: true }
  );
  // Card width changes at the 880px breakpoint (and with the viewport on
  // phones) — the depth goes by card steps, so recompute.
  new ResizeObserver(() => (measure(), applyDepth())).observe(track);
  track.addEventListener("click", (e) => {
    const slide = e.target.closest(".cmd-carousel-slide");
    if (slide && !slide.classList.contains("is-active")) go(Number(slide.dataset.index));
  });
  track.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    go(active + (e.key === "ArrowRight" ? 1 : -1));
  });
  prevBtn.addEventListener("click", () => go(active - 1));
  nextBtn.addEventListener("click", () => go(active + 1));
  measure();
  setActive(0);
  applyDepth();

  fetchCardImages([...new Set(items.map((c) => c.commander.name))]).then((images) => {
    slides.forEach((slide, i) => {
      const url = images.get(items[i].commander.name.toLowerCase());
      if (!url) return slide.classList.remove("is-loading");
      const img = new Image();
      img.alt = items[i].commander.name;
      img.className = "cmd-carousel-img";
      img.draggable = false;
      img.onload = () => slide.classList.replace("is-loading", "has-image");
      img.onerror = () => (img.remove(), slide.classList.remove("is-loading"));
      img.src = url;
      slide.append(img);
    });
  });

  return {
    setRecords(map) {
      records = map;
      renderWinrate();
    },
  };
}
