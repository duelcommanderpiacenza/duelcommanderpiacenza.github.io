// Horizontally-scrolling rows that a mouse can drag, like a finger swipes
// them on touch (touch already scrolls natively, so only pointerType
// "mouse" is handled here). Two flavours:
//
// - enableDragScroll: a free-scrolling row (badges.html's "Attualmente"
//   holders, matchups.html's matrix). Also keeps a few classes on the row in sync, for its CSS:
//   is-scrollable (content wider than the row: grab cursor), fade-left /
//   fade-right (more content that way: edge fade).
// - enableSnapDrag: a scroll-snap carousel (js/chart-carousel.js's chart
//   rows, js/commander-carousel.js's album). The row follows the pointer
//   with scroll-snap switched off (the row gets .is-dragging, whose CSS
//   must set scroll-snap-type: none — snapping would fight every scrollLeft
//   set), then on release glides to the position the caller picks and only
//   turns snapping back on once it has arrived there (turning it on mid-way
//   would snap straight to the *nearest* position first).
//
// Both: .is-dragging while a drag is in progress, and a drag that started
// on a link or clickable card doesn't also click it on release — past a few
// px of movement the click that the browser fires afterwards is swallowed.
// Below that it's an ordinary click.

const DRAG_THRESHOLD_PX = 5;
// Snapping back on even if "scrollend" never fires (older browsers, or a
// glide that didn't need to move at all).
const SNAP_RESTORE_FALLBACK_MS = 800;

// The shared gesture: calls onStart() when a press becomes a drag,
// onMove(dx) on every move after that, onEnd(dx) on release.
function mouseDrag(el, { canStart = () => true, onStart = () => {}, onMove, onEnd = () => {} }) {
  let pointerId = null;
  let startX = 0;
  let dragging = false;

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !canStart()) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    dragging = false;
  });

  el.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      el.setPointerCapture(pointerId);
      el.classList.add("is-dragging");
      onStart();
    }
    onMove(dx);
  });

  function end(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return;
    onEnd(e.clientX - startX);
    // Reset only after the click that this same release is about to fire.
    setTimeout(() => {
      dragging = false;
    });
  }
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  el.addEventListener(
    "click",
    (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  // The browser's own link drag-and-drop (dragging a link's URL out) would
  // otherwise take over the gesture as soon as it starts on a link.
  el.addEventListener("dragstart", (e) => e.preventDefault());
}

export function enableDragScroll(el) {
  let startScroll = 0;

  function syncClasses() {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle("is-scrollable", max > 1);
    el.classList.toggle("fade-left", el.scrollLeft > 1);
    el.classList.toggle("fade-right", el.scrollLeft < max - 1);
  }

  mouseDrag(el, {
    canStart: () => el.classList.contains("is-scrollable"),
    onStart: () => (startScroll = el.scrollLeft),
    onMove: (dx) => (el.scrollLeft = startScroll - dx),
    onEnd: () => el.classList.remove("is-dragging"),
  });

  el.addEventListener("scroll", syncClasses, { passive: true });
  new ResizeObserver(syncClasses).observe(el);
  syncClasses();
}

/**
 * @param {HTMLElement} el - the scroll-snap row.
 * @param {object} options
 * @param {() => boolean} options.canDrag - whether there's anywhere to go.
 * @param {(forward: boolean) => number} options.targetLeft - the scrollLeft
 *   to glide to on release, from the current one; forward = the drag moved
 *   the content left (towards the next item).
 */
export function enableSnapDrag(el, { canDrag, targetLeft }) {
  let startScroll = 0;
  let target = 0;
  let restoreTimer = null;

  function restoreSnap() {
    clearTimeout(restoreTimer);
    el.removeEventListener("scrollend", onGlideEnd);
    el.classList.remove("is-dragging");
  }

  // A "scrollend" still pending from the drag's own last move can arrive
  // after the glide has started — only the one at the target counts.
  function onGlideEnd() {
    if (Math.abs(el.scrollLeft - target) <= 1) restoreSnap();
  }

  mouseDrag(el, {
    canStart: () => {
      if (!canDrag()) return false;
      restoreSnap(); // a new drag during the previous one's glide
      return true;
    },
    onStart: () => (startScroll = el.scrollLeft),
    onMove: (dx) => (el.scrollLeft = startScroll - dx),
    onEnd: () => {
      target = targetLeft(el.scrollLeft > startScroll);
      el.addEventListener("scrollend", onGlideEnd);
      restoreTimer = setTimeout(restoreSnap, SNAP_RESTORE_FALLBACK_MS);
      el.scrollTo({ left: target, behavior: "smooth" });
    },
  });
}
