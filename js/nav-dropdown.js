// Wires up the click-to-open/close behavior for the mobile-only nav
// dropdown trigger. The trigger button and its label are static HTML in
// every page (same as the page's own <h1> — present in the very first
// paint, not waiting on this deferred module), and the plain <a
// class="nav-link"> list is likewise real, untouched markup, only hidden
// by the synchronous html.nav-mobile class (set by the inline head
// script, based on matchMedia("... and (pointer: coarse) and (hover:
// none)") — a real touch device, not just a narrow window). This file
// only adds the open/close interaction on top of both.

const MOBILE_QUERY = "(max-width: 640px) and (pointer: coarse) and (hover: none)";

function isMobileNav() {
  // Some Android OEM browsers (Samsung Internet has a history of this)
  // misreport pointer/hover, matching neither branch of MOBILE_QUERY on an
  // actual touch phone — navigator.maxTouchPoints checks real touch
  // hardware directly instead, sidestepping the media-query engine
  // entirely. Same combined check as every page's own inline head script.
  return window.matchMedia(MOBILE_QUERY).matches || (window.innerWidth <= 640 && navigator.maxTouchPoints > 0);
}

function closeDropdown(nav) {
  nav.classList.remove("is-open");
  nav.querySelector(".nav-dropdown-trigger")?.setAttribute("aria-expanded", "false");
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
    const open = nav.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) closeDropdown(nav);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      closeDropdown(nav);
      trigger.focus();
    }
  });
}

init();
