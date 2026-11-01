// Touch screens: a finger kept down on a chart and moved along it moves the
// point's detail box with it (user, 2026-11-01) — before, :hover alone showed
// it, so a finger had to lift and tap again for another point.
//
// Every chart drawn with the site's hover strips (.line-chart-hit: a point's
// guide, dots and tip, side by side across the plot — js/line-chart.js,
// js/evolution-page.js, js/compare-page.js) gets it here, once for the whole
// site: a touch on a strip marks it .is-scrub (the CSS shows its guide /
// dots / tip like :hover), and while the finger moves the strip under it
// (by x only, so the finger may wander above or below the plot) takes the
// mark. The plot gets .is-scrubbing meanwhile, which hides the strip the
// browser still thinks is :hover (a touch's hover sticks where it tapped).
// The mark stays after the finger lifts (like a tap did), until a touch
// elsewhere or a mouse moving over the page.
//
// A synthetic `pointerover` on each newly marked strip lets the pages' own
// tip-fitting handlers (keeping the tip inside its card) run as for a hover.
// The strips' `touch-action: pan-y` (styles.css) keeps the page scrolling
// up and down from a chart while a sideways move stays with the chart.

let plot = null; // the plot being scrubbed (the strips' parent)
let marked = null; // its marked strip
let pointerId = null; // the finger moving along it

function clear() {
  marked?.classList.remove("is-scrub");
  plot?.classList.remove("is-scrubbing");
  plot = null;
  marked = null;
}

function mark(hit) {
  if (hit === marked) return;
  marked?.classList.remove("is-scrub");
  marked = hit;
  hit.classList.add("is-scrub");
  hit.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
}

// The strip of `plot` under `x` (the first / last past the ends).
function hitAt(x) {
  const hits = [...plot.children].filter((el) => el.classList.contains("line-chart-hit"));
  if (!hits.length) return null;
  for (const hit of hits) {
    const r = hit.getBoundingClientRect();
    if (x >= r.left && x < r.right) return hit;
  }
  return x < hits[0].getBoundingClientRect().left ? hits[0] : hits.at(-1);
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType === "mouse") return;
    const hit = e.target.closest?.(".line-chart-hit");
    if (!hit) {
      clear();
      return;
    }
    if (hit.parentElement !== plot) {
      clear();
      plot = hit.parentElement;
      plot.classList.add("is-scrubbing");
    }
    pointerId = e.pointerId;
    mark(hit);
  },
  { passive: true, capture: true }
);

document.addEventListener(
  "pointermove",
  (e) => {
    if (e.pointerId !== pointerId || !plot?.isConnected) return;
    const hit = hitAt(e.clientX);
    if (hit) mark(hit);
  },
  { passive: true }
);

for (const type of ["pointerup", "pointercancel"]) {
  document.addEventListener(
    type,
    (e) => {
      if (e.pointerId === pointerId) pointerId = null;
    },
    { passive: true }
  );
}

// A mouse (a touch laptop's): back to plain hover.
document.addEventListener(
  "pointerover",
  (e) => {
    if (e.pointerType === "mouse" && plot) clear();
  },
  { passive: true }
);
