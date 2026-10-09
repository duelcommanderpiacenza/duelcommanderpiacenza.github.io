// A full-page splash shown while a page's own data is still loading —
// static markup duplicated on every public page (same reasoning as the
// header/nav in js/layout.js: present at first paint, not injected, so
// there's no pop-in). Idempotent and safe to call repeatedly (e.g. once
// per render on a page that re-renders on every filter change) — only the
// first call actually does anything, every call after that is a no-op
// since the element is already gone.
export function hidePageLoading() {
  // Content built behind the splash while loading has its entrance
  // animations paused at their first frame (body.is-loading * in
  // styles.css) — removing the class here, at the same moment the splash
  // itself starts fading, releases every one of them together instead of
  // each having already silently finished off-screen.
  document.body.classList.remove("is-loading");

  const el = document.getElementById("page-loading-overlay");
  if (!el) return;
  el.classList.add("is-hidden");
  el.addEventListener("transitionend", () => el.remove(), { once: true });
}

// A safety net for the splash, started on every page by js/layout.js (not
// by the page's own script — that one failing to load is one of the ways a
// page could otherwise sit on "Caricamento..." for good): still loading
// after SLOW_LOADING_MS (a request that never answers, a stuck connection
// after the computer slept), or an error while loading — the splash says so
// and offers to reload. Both also leave a note in the console, to tell which
// it was.
const SLOW_LOADING_MS = 12000;

export function watchPageLoading() {
  const el = document.getElementById("page-loading-overlay");
  if (!el) return;
  const stillLoading = () => document.body.classList.contains("is-loading") && el.isConnected;

  function offerReload(message) {
    if (!stillLoading() || el.classList.contains("is-stuck")) return;
    el.classList.add("is-stuck");
    const text = el.querySelector("p");
    if (text) text.textContent = message;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary";
    button.textContent = "Ricarica la pagina";
    button.addEventListener("click", () => window.location.reload());
    el.append(button);
  }

  const timer = setTimeout(() => {
    if (!stillLoading()) return;
    console.warn(`Page still loading after ${SLOW_LOADING_MS / 1000}s`);
    offerReload("Il caricamento sta richiedendo più del solito.");
  }, SLOW_LOADING_MS);

  const onError = (event) => {
    if (!stillLoading()) return;
    console.warn("Error while the page was loading:", event.error ?? event.reason ?? event);
    offerReload("Qualcosa non è andato durante il caricamento.");
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onError);

  // Loaded: nothing left to watch.
  new MutationObserver((_records, observer) => {
    if (stillLoading()) return;
    clearTimeout(timer);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onError);
    observer.disconnect();
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
