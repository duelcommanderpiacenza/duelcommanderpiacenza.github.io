// The site's one hover tooltip (red pill): badges, the banned-commander
// icon and the "Top 8" pill (wired site-wide in js/layout.js), Matchups'
// headers, the Comandanti chart labels. A real element appended to <body>
// and positioned in JS, rather than a CSS ::after on the hovered element
// itself — most of these live inside a clipping ancestor (every
// .data-table-wrap, the Matchups matrix, the chart carousel are
// horizontally-scrolling, and per the CSS overflow spec overflow-x: auto
// forces overflow-y to clip too), so anything positioned relative to an
// element inside it gets cut off at the wrapper's own edge (CLAUDE.md
// gotchas #1/#2). Living outside that wrapper sidesteps it. One tooltip at
// a time, site-wide.

let tooltipEl = null;
let anchorEl = null;

export function showFloatingTooltip(anchor, text) {
  if (anchor === anchorEl) return;
  hideFloatingTooltip();
  anchorEl = anchor;
  if (!text) return;

  const tip = document.createElement("div");
  tip.className = "floating-tooltip";
  tip.textContent = text;
  document.body.appendChild(tip);
  tooltipEl = tip;

  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const margin = 8;
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  const left = Math.max(margin, Math.min(centeredLeft, window.innerWidth - tipRect.width - margin));
  // Always opens upward, same as the badge tooltip it mirrors.
  const top = anchorRect.top - tipRect.height - 10;

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

export function hideFloatingTooltip() {
  tooltipEl?.remove();
  tooltipEl = null;
  anchorEl = null;
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
export function attachHoverTooltips(containerEl, selector, textFor) {
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
      hideFloatingTooltip();
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
  containerEl.addEventListener("scroll", hideFloatingTooltip, true);
  window.addEventListener("scroll", hideFloatingTooltip, true);
}

// textFor for a label cut off with an ellipsis: its full text only when it
// actually is cut off (a name that fits needs no tooltip).
export function fullTextIfTruncated(el) {
  return el.scrollWidth > el.clientWidth ? el.textContent.trim() : null;
}
