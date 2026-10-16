// Touch screens (html.nav-mobile): the nav at the bottom of the screen —
// the tab bar (js/tab-bar.js, built inside .site-nav) — slides away while
// the page scrolls down and comes back as soon as it scrolls up (styles.css
// .site-nav.is-scrolled-away). (The file's name is from the old pill + list
// this replaced.) Also makes sure html.nav-mobile is set: the inline head
// script sets it from navigator.maxTouchPoints — any touch device, not
// gated on width or on matchMedia's pointer/hover reporting, which some
// Android OEM browsers, Samsung Internet included, have a history of
// getting wrong on real touch phones.

function isMobileNav() {
  return navigator.maxTouchPoints > 0;
}

// The bar's last scroll position (its scroll-away logic in init).
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
  if (!nav) return;

  // In-app navigation (js/router.js): the bar shows.
  document.addEventListener("app:navigate", () => {
    nav.classList.remove("is-scrolled-away");
    lastY = 0;
  });

  // Back / forward put the page back where it was (js/router.js): the bar
  // stays shown — that position is the new starting point, not a scroll
  // down (the jump's own scroll event then sees no move).
  document.addEventListener("app:scroll-restored", () => {
    nav.classList.remove("is-scrolled-away");
    lastY = window.scrollY;
  });

  // The bar slides away while the page scrolls down and comes back as soon
  // as it scrolls up — always shown near the top. Moves under SCROLL_SLACK
  // px are ignored (a finger's jitter), checked once per frame.
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
        const away = y > lastY && (y > SHOW_NEAR_TOP || atBottom);
        nav.classList.toggle("is-scrolled-away", away);
        lastY = y;
      });
    },
    { passive: true }
  );
}

init();
