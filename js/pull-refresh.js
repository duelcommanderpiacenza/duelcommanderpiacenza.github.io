// Pull to refresh, in the installed app only (display-mode: standalone —
// a browser tab has its own, or its reload button): pulled down from the
// very top of the page, a white disc with a red refresh arrow slides down
// from the top edge (styles.css .ptr), its red ring filling and the arrow
// turning as it goes; past THRESHOLD it's armed (a pop and a haptic tick,
// js/haptics.js) and letting go reloads the page's data in place
// (js/router.js refresh — no full reload), the disc spinning until the page
// is shown again. Pulled less, it just slides back.
//
// Not started over an open pop-up or the search, nor from inside something
// that scrolls on its own and isn't at its top (a list, a dialog's body),
// nor while the page is still loading; a sideways swipe (carousels, tabs)
// never turns into a pull.

import { refresh } from "./router.js";
import { haptic } from "./haptics.js";

// The disc's travel (after the pull's resistance, half the finger's) at
// which it's armed, and its furthest.
const THRESHOLD = 72;
const MAX_TRAVEL = 110;
// Never spinning longer than this, whatever the page does.
const MAX_WAIT_MS = 15000;

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

function blocked() {
  return Boolean(
    document.body.classList.contains("is-loading") ||
      document.querySelector("dialog[open]") ||
      document.querySelector(".site-search-box.is-open")
  );
}

// Inside an element that scrolls vertically and isn't at its top: that
// element's own scroll, not a pull.
function insideScrolled(target) {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
  }
  return false;
}

// Resolves once the page is shown (body.is-loading off), or after
// MAX_WAIT_MS.
function whenShown() {
  return new Promise((resolve) => {
    if (!document.body.classList.contains("is-loading")) return resolve();
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains("is-loading")) return;
      done();
    });
    const timer = setTimeout(done, MAX_WAIT_MS);
    function done() {
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    }
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  });
}

function init() {
  if (!document.documentElement.classList.contains("nav-mobile") || !standalone()) return;

  const ptr = document.createElement("div");
  ptr.className = "ptr";
  ptr.setAttribute("aria-hidden", "true");
  ptr.innerHTML =
    '<div class="ptr-disc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg></div>';
  document.body.append(ptr);

  const setTravel = (travel) => {
    ptr.style.setProperty("--ptr-y", `${travel}px`);
    ptr.style.setProperty("--ptr-p", String(Math.min(1, travel / THRESHOLD)));
  };

  let start = null; // { x, y } of a touch that may become a pull
  let pulling = false;
  let armed = false;
  let refreshing = false;

  const reset = () => {
    start = null;
    pulling = false;
    armed = false;
    ptr.classList.remove("is-pulling", "is-armed");
    setTravel(0);
  };

  document.addEventListener(
    "touchstart",
    (e) => {
      if (refreshing || e.touches.length !== 1 || window.scrollY > 0 || blocked() || insideScrolled(e.target)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!pulling) {
        // Up, or more sideways than down: not a pull, left alone.
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
          start = null;
          return;
        }
        if (dy < 8) return;
        pulling = true;
        ptr.classList.add("is-pulling");
      }
      // The page itself stays put (no rubber-band bounce under the disc).
      e.preventDefault();
      const travel = Math.min(MAX_TRAVEL, Math.max(0, (dy - 8) * 0.5));
      setTravel(travel);
      if (travel >= THRESHOLD && !armed) {
        armed = true;
        ptr.classList.add("is-armed");
        haptic();
      } else if (travel < THRESHOLD && armed) {
        armed = false;
        ptr.classList.remove("is-armed");
      }
    },
    { passive: false }
  );

  const release = async () => {
    if (!pulling) {
      start = null;
      return;
    }
    if (!armed) return reset();
    start = null;
    pulling = false;
    refreshing = true;
    ptr.classList.remove("is-pulling");
    ptr.classList.add("is-refreshing");
    setTravel(THRESHOLD);
    try {
      await refresh();
      await whenShown();
    } catch (err) {
      console.error(err);
    }
    refreshing = false;
    ptr.classList.remove("is-refreshing", "is-armed");
    setTravel(0);
  };
  document.addEventListener("touchend", release, { passive: true });
  document.addEventListener("touchcancel", () => !refreshing && reset(), { passive: true });
}

init();
