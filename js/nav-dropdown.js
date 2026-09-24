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
function openDropdown(nav, trigger) {
  nav.classList.remove("is-closing");
  nav.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
}

function closeDropdown(nav, trigger) {
  if (!nav.classList.contains("is-open")) return;
  nav.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
  // Reduced motion: nothing to reverse out of, and animationend would
  // never fire to clear .is-closing again — skip straight to the (already
  // instant) closed state instead of hanging the panel open.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const inner = nav.querySelector(".site-nav-inner");
  if (!inner) return;
  nav.classList.add("is-closing");
  inner.addEventListener("animationend", () => nav.classList.remove("is-closing"), { once: true });
}

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

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) closeDropdown(nav, trigger);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      closeDropdown(nav, trigger);
      trigger.focus();
    }
  });
}

init();
