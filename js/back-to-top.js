// A round white "back to the top" button (styles.css .back-to-top), fixed in
// the bottom-right corner — on touch screens just above the floating nav
// pill — shown only once the page is scrolled down past SHOW_AFTER px.
// Used by the long list pages (Comandanti, Giocatori, an archetype's page).

const SHOW_AFTER = 400;

const ARROW_UP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"></path></svg>';

// `signal` (js/router.js mount): the button and its listeners go with the
// page that asked for them.
export function initBackToTop({ signal } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "back-to-top";
  button.setAttribute("aria-label", "Torna all'inizio");
  button.title = "Torna all'inizio";
  button.innerHTML = ARROW_UP;
  document.body.appendChild(button);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
    button.blur();
  });

  // Once the footer scrolls into view, the button rides up with it (styles.css
  // --back-to-top-lift) instead of sitting on the footer's theme switch in
  // the same corner — on touch screens too, where it sits beside the nav
  // pill.
  const footer = document.querySelector("footer");

  // At most one check per frame, however many scroll events arrive. While
  // hidden it's also out of the tab order (styles.css visibility).
  let frame = 0;
  const update = () => {
    frame = 0;
    button.classList.toggle("is-visible", window.scrollY > SHOW_AFTER);
    const footerTop = footer?.getBoundingClientRect().top ?? Infinity;
    const lift = Math.max(0, window.innerHeight - footerTop);
    button.style.setProperty("--back-to-top-lift", `${Math.round(lift)}px`);
  };
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", queue, { passive: true, signal });
  window.addEventListener("resize", queue, { signal });
  signal?.addEventListener("abort", () => button.remove(), { once: true });
  update();
}
