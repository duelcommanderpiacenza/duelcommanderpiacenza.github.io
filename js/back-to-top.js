// A round white "back to the top" button (styles.css .back-to-top), fixed in
// the bottom-right corner — on touch screens just above the floating nav
// pill — shown only once the page is scrolled down past SHOW_AFTER px.
// Used by the long list pages (Comandanti, Giocatori).

const SHOW_AFTER = 400;

const ARROW_UP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"></path></svg>';

export function initBackToTop() {
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

  // At most one check per frame, however many scroll events arrive. While
  // hidden it's also out of the tab order (styles.css visibility).
  let frame = 0;
  const update = () => {
    frame = 0;
    button.classList.toggle("is-visible", window.scrollY > SHOW_AFTER);
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!frame) frame = requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();
}
