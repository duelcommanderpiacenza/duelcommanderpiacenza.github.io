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
