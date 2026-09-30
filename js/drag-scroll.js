// A horizontally-scrolling row that a mouse can drag, like a finger swipes
// it on touch (touch already scrolls natively, so only pointerType "mouse"
// is handled here). Used by badges.html's "Attualmente" holder rows.
//
// Also keeps a few classes on the row in sync, for its CSS:
// - is-scrollable: the content is wider than the row (grab cursor).
// - fade-left / fade-right: there's more content that way (edge fade).
// - is-dragging: a mouse drag is in progress (grabbing cursor, no selection).
//
// A drag that started on a link must not also follow it on release: past a
// few px of movement the click that the browser fires afterwards is
// swallowed. Below that it's an ordinary click.

const DRAG_THRESHOLD_PX = 5;

export function enableDragScroll(el) {
  let startX = 0;
  let startScroll = 0;
  let pointerId = null;
  let dragging = false;

  function syncClasses() {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle("is-scrollable", max > 1);
    el.classList.toggle("fade-left", el.scrollLeft > 1);
    el.classList.toggle("fade-right", el.scrollLeft < max - 1);
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (!el.classList.contains("is-scrollable")) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startScroll = el.scrollLeft;
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
    }
    el.scrollLeft = startScroll - dx;
  });

  function endDrag(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return;
    el.classList.remove("is-dragging");
    // Reset only after the click that this same release is about to fire.
    setTimeout(() => {
      dragging = false;
    });
  }
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

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

  el.addEventListener("scroll", syncClasses, { passive: true });
  new ResizeObserver(syncClasses).observe(el);
  syncClasses();
}
