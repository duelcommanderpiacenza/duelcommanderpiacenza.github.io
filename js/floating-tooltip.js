// The site's one hover tooltip (red pill): badges, the banned-commander
// icon and the "Top 8" pill (wired site-wide in js/layout.js), Matchups'
// headers, the Comandanti chart labels. A real element appended to <body>
// and positioned in JS, rather than a CSS ::after on the hovered element
// itself — most of these live inside a clipping ancestor (the Matchups
// matrix, the chart carousel are
// horizontally-scrolling, and per the CSS overflow spec overflow-x: auto
// forces overflow-y to clip too), so anything positioned relative to an
// element inside it gets cut off at the wrapper's own edge (CLAUDE.md
// gotchas #1/#2). Living outside that wrapper sidesteps it. One tooltip at
// a time, site-wide.

let tooltipEl = null;
let anchorEl = null;
let hideTimer = null;

// A player badge (js/ui.js badgeTooltipAttrs, data-badge-*): a small white
// card instead of the red pill — its icon, name, description and, for an
// automatic badge, "Come si ottiene ›" to its entry on badges.html. The
// one tooltip that can be clicked (see hideSoon).
function fillBadgeCard(tip, anchor) {
  const { badgeName, badgeDescription, badgeId } = anchor.dataset;
  tip.classList.add("badge-tip");
  const head = document.createElement("div");
  head.className = "badge-tip-head";
  // Its icon: the disc next to the name, or (the player card's own glass
  // disc) the glyph put in the site's disc.
  let disc = anchor.querySelector(".badge-disc")?.cloneNode(true);
  if (!disc) {
    disc = document.createElement("span");
    disc.className = "badge-disc";
    const glyph = anchor.querySelector(".pc-badge-glyph")?.cloneNode(true);
    if (glyph) {
      glyph.className = "badge-disc-glyph";
      disc.appendChild(glyph);
    }
  }
  disc.removeAttribute("style");
  const name = document.createElement("b");
  name.className = "badge-tip-name";
  name.textContent = badgeName;
  head.append(disc, name);
  tip.appendChild(head);
  if (badgeDescription) {
    const text = document.createElement("p");
    text.className = "badge-tip-text";
    text.textContent = badgeDescription;
    tip.appendChild(text);
  }
  if (badgeId) {
    const link = document.createElement("a");
    link.className = "badge-tip-link";
    link.href = `badges.html#badge-${encodeURIComponent(badgeId)}`;
    link.textContent = "Come si ottiene ›";
    tip.appendChild(link);
  }
}

export function showFloatingTooltip(anchor, text) {
  clearTimeout(hideTimer);
  if (anchor === anchorEl) return;
  hideFloatingTooltip();
  anchorEl = anchor;
  if (!text) return;

  const tip = document.createElement("div");
  tip.className = "floating-tooltip";
  if (anchor.dataset.badgeName) {
    fillBadgeCard(tip, anchor);
    // The pointer crossing from the badge onto the card keeps it open.
    tip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    tip.addEventListener("mouseleave", (e) => {
      if (!anchorEl?.contains(e.relatedTarget)) hideSoon();
    });
    // Pressing its link mustn't take the focus off the badge — the badge's
    // focusout would remove the card before the click lands.
    tip.addEventListener("mousedown", (e) => e.preventDefault());
  } else {
    tip.textContent = text;
  }
  document.body.appendChild(tip);
  tooltipEl = tip;

  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const margin = 8;
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  const left = Math.max(margin, Math.min(centeredLeft, window.innerWidth - tipRect.width - margin));
  // Opens upward — or, with no room above it (near the screen's top), under
  // the element, its arrow pointing up (.is-below).
  const above = anchorRect.top - tipRect.height - 10;
  const below = above < margin;
  const top = below ? anchorRect.bottom + 10 : above;
  tip.classList.toggle("is-below", below);

  // The arrow needs its own position, separate from the tooltip box's —
  // clamping the tooltip to stay on-screen can shift it away from
  // dead-center over the anchor, and the arrow should still point at the
  // anchor rather than staying fixed in the tooltip's own middle.
  const arrowMargin = 12;
  const arrowLeft = Math.max(
    arrowMargin,
    Math.min(anchorRect.left + anchorRect.width / 2 - left, tipRect.width - arrowMargin)
  );
  const arrow = document.createElement("span");
  arrow.className = "floating-tooltip-arrow";
  arrow.style.left = `${arrowLeft}px`;
  tip.appendChild(arrow);

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  // Two-step show (append, then add the class that triggers the CSS
  // transition on the next frame) — added and made visible in the same
  // frame wouldn't animate, the browser has nothing to transition from.
  requestAnimationFrame(() => tip.classList.add("is-visible"));
}

function hideFloatingTooltip() {
  clearTimeout(hideTimer);
  tooltipEl?.remove();
  tooltipEl = null;
  anchorEl = null;
}

// Leaving a badge's card (or its badge): a moment's delay, time for the
// pointer to cross the gap between them; any other tooltip goes at once.
function hideSoon() {
  if (!tooltipEl?.classList.contains("badge-tip")) return hideFloatingTooltip();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideFloatingTooltip, 200);
}

/**
 * Hover tooltips for every `selector` element inside `containerEl`, shown
 * with `textFor(el)`. Delegated on containerEl (stable, never replaced) in
 * the capture phase — mouseenter/mouseleave don't bubble — so it keeps
 * working as the matched elements underneath get re-rendered. If an
 * element has children (e.g. a truncation <span> inside a <th>),
 * mouseenter/mouseleave also fire separately for those as the cursor
 * crosses into them; the anchor check in showFloatingTooltip and the
 * relatedTarget check below keep that from re-triggering hide-then-show.
 * Scrolling (the container or the page) drops the tooltip rather than let
 * it drift away from the element it points at.
 * @param {HTMLElement} containerEl
 * @param {string} selector
 * @param {(el: HTMLElement) => string|null} textFor - null/"" = no tooltip for this one.
 */
export function attachHoverTooltips(containerEl, selector, textFor, { signal } = {}) {
  containerEl.addEventListener(
    "mouseenter",
    (e) => {
      const el = e.target.closest?.(selector);
      if (el) showFloatingTooltip(el, textFor(el));
    },
    true
  );
  containerEl.addEventListener(
    "mouseleave",
    (e) => {
      const el = e.target.closest?.(selector);
      if (!el || el !== anchorEl) return;
      if (e.relatedTarget && el.contains(e.relatedTarget)) return;
      hideSoon();
    },
    true
  );
  // Keyboard users too (the badges are tabindex="0", the "Top 8" pill is a
  // link): focusing shows it, moving focus away hides it. focusin/focusout
  // bubble, unlike focus/blur, so plain delegation works here.
  containerEl.addEventListener("focusin", (e) => {
    const el = e.target.closest?.(selector);
    if (el) showFloatingTooltip(el, textFor(el));
  });
  containerEl.addEventListener("focusout", (e) => {
    const el = e.target.closest?.(selector);
    if (el && el === anchorEl) hideFloatingTooltip();
  });
  // Touch screens (no hover): a tap shows it — the same full text — and a
  // tap anywhere else hides it (below).
  containerEl.addEventListener("click", (e) => {
    const touch = e.pointerType ? e.pointerType !== "mouse" : window.matchMedia("(hover: none)").matches;
    if (!touch) return;
    const el = e.target.closest?.(selector);
    if (el) showFloatingTooltip(el, textFor(el));
  });
  containerEl.addEventListener("scroll", hideFloatingTooltip, true);
  // `signal` (js/router.js mount): a page's own call stops with it.
  window.addEventListener("scroll", hideFloatingTooltip, { capture: true, signal });
}

// In-app navigation (js/router.js): no tooltip left over the next page.
document.addEventListener("app:navigate", () => hideFloatingTooltip());

// A tap (or click) anywhere but on the element it's for (or on a badge's
// card, its link) hides it — on touch screens there's no mouseleave to do
// it. Captured, so it runs before a tap's own handler shows the next one.
document.addEventListener(
  "click",
  (e) => {
    if (anchorEl && !anchorEl.contains(e.target) && !tooltipEl?.contains(e.target)) hideFloatingTooltip();
  },
  true
);

// textFor for a label cut off with an ellipsis: its full text only when it
// actually is cut off (a name that fits needs no tooltip).
export function fullTextIfTruncated(el) {
  return el.scrollWidth > el.clientWidth ? el.textContent.trim() : null;
}
