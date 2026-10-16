// Wires up the click-to-open/close behavior for the mobile-only nav
// dropdown trigger. The trigger button and its label are static HTML in
// every page (same as the page's own <h1> — present in the very first
// paint, not waiting on this deferred module), and the plain <a
// class="nav-link"> list is likewise real, untouched markup, only hidden
// by the synchronous html.nav-mobile class (set by the inline head
// script from navigator.maxTouchPoints — any touch device, not gated on
// width or on matchMedia's pointer/hover reporting, which some Android
// OEM browsers, Samsung Internet included, have a history of getting
// wrong on real touch phones). This file only adds the open/close
// interaction on top of both.

import { haptic } from "./haptics.js";

function isMobileNav() {
  return navigator.maxTouchPoints > 0;
}

// display: none (the base, closed state) can't be transitioned/animated on
// its own — opening plays nav-dropdown-panel-in via .is-open (styles.css)
// same as before, but closing used to just be an instant cut to display:
// none the moment .is-open came off. .is-closing keeps the panel actually
// rendered for exactly as long as the reverse animation
// (nav-dropdown-panel-out) takes, playing it, before finally letting it
// disappear — mirroring js/page-loading.js's own transitionend-then-remove
// pattern for the same "animate something on its way OUT" problem.
// The panel opens upward from the pill: capped to the room between the
// pill and the red header's bottom edge (or the screen's top, once the
// header has scrolled away), PANEL_GAP clear of it — scrolling inside
// (styles.css) when the list is taller than that.
const PANEL_GAP = 12;

function fitPanel(nav, trigger) {
  const inner = nav.querySelector(".site-nav-inner");
  if (!inner) return;
  const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
  const top = Math.max(headerBottom, 0) + PANEL_GAP;
  // The panel's own bottom sits 8px above the pill (styles.css).
  const bottom = trigger.getBoundingClientRect().top - 8;
  inner.style.maxHeight = `${Math.max(bottom - top, 120)}px`;
}

function openDropdown(nav, trigger) {
  haptic();
  fitPanel(nav, trigger);
  nav.classList.remove("is-closing");
  nav.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
}

// `instant`: an in-app navigation — no animation of its own; the page change
// fades the open panel out with the old page (js/router.js dispatches
// app:navigate inside the swap, after the old screen's snapshot; styles.css
// "Page transitions"), a retract would run over it.
function closeDropdown(nav, trigger, { instant = false } = {}) {
  if (instant) nav.classList.remove("is-closing");
  if (!nav.classList.contains("is-open")) return;
  nav.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
  if (instant) return;
  // Reduced motion: nothing to reverse out of, and animationend would
  // never fire to clear .is-closing again — skip straight to the (already
  // instant) closed state instead of hanging the panel open.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const inner = nav.querySelector(".site-nav-inner");
  if (!inner) return;
  nav.classList.add("is-closing");
  // The panel's own animation only — its links' (still running if it's
  // closed mid-opening) bubble up here too.
  const done = (e) => {
    if (e.target !== inner) return;
    inner.removeEventListener("animationend", done);
    nav.classList.remove("is-closing");
  };
  inner.addEventListener("animationend", done);
}

// The pill's last scroll position (its scroll-away logic in init).
let lastY = window.scrollY;

function init() {
  // Self-healing fallback for the inline head script's own check — normally
  // redundant (it already runs synchronously before first paint), but on a
  // reload under DevTools device emulation the browser's touch/hover
  // override can land a beat after that very first script executes,
  // making its one-time check read the pre-emulation (desktop) state. This
  // one runs later, giving the override more time to actually be in place.
  if (!document.documentElement.classList.contains("nav-mobile") && isMobileNav()) {
    document.documentElement.classList.add("nav-mobile");
  }

  const nav = document.querySelector(".site-nav");
  const trigger = nav?.querySelector(".nav-dropdown-trigger");
  if (!nav || !trigger) return;

  trigger.addEventListener("click", () => {
    if (nav.classList.contains("is-open")) closeDropdown(nav, trigger);
    else openDropdown(nav, trigger);
  });

  // Rotating the phone (or the browser's bars showing/hiding) changes the
  // room: refitted while open.
  window.addEventListener("resize", () => {
    if (nav.classList.contains("is-open")) fitPanel(nav, trigger);
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) closeDropdown(nav, trigger);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      closeDropdown(nav, trigger);
      trigger.focus();
    }
  });

  // In-app navigation (js/router.js): the panel closes, the pill shows.
  document.addEventListener("app:navigate", () => {
    closeDropdown(nav, trigger, { instant: true });
    nav.classList.remove("is-scrolled-away");
    lastY = 0;
  });

  // Back / forward put the page back where it was (js/router.js): the pill
  // stays shown — that position is the new starting point, not a scroll
  // down (the jump's own scroll event then sees no move).
  document.addEventListener("app:scroll-restored", () => {
    nav.classList.remove("is-scrolled-away");
    lastY = window.scrollY;
  });

  // Touch screens: the pill slides away while the page scrolls down and
  // comes back as soon as it scrolls up (styles.css .is-scrolled-away) —
  // always shown near the top, and never hidden while its panel is open.
  // Moves under SCROLL_SLACK px are ignored (a finger's jitter), checked
  // once per frame.
  const SCROLL_SLACK = 8;
  const SHOW_NEAR_TOP = 80;
  let queued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!document.documentElement.classList.contains("nav-mobile")) return;
        const y = window.scrollY;
        if (Math.abs(y - lastY) < SCROLL_SLACK) return;
        // Reaching the bottom while scrolling down hides it too, however
        // little the page scrolls (a short page — styles.css makes it a screen
        // tall, the footer just below — would otherwise keep it over the
        // footer).
        const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 2;
        const away = y > lastY && (y > SHOW_NEAR_TOP || atBottom) && !nav.classList.contains("is-open");
        nav.classList.toggle("is-scrolled-away", away);
        lastY = y;
      });
    },
    { passive: true }
  );
}

init();
