// Touch screens (html.nav-mobile): the nav at the bottom of the screen is
// the tab bar (js/tab-bar.js, built inside .site-nav) — fixed and always
// shown (since 2026-10-30; it used to slide away while scrolling down, the
// logic that lived here). (The file's name is from the old pill + list
// this replaced.) What's left: making sure html.nav-mobile is set — the
// inline head script sets it from navigator.maxTouchPoints — any touch
// device, not gated on width or on matchMedia's pointer/hover reporting,
// which some Android OEM browsers, Samsung Internet included, have a
// history of getting wrong on real touch phones.

function isMobileNav() {
  return navigator.maxTouchPoints > 0;
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
}

init();
