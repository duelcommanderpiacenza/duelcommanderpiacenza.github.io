// The hero pages on touch screens (styles.css "The hero pages on touch
// screens"): the hero scrolls at half speed while the content's sheet
// (.hero-sheet) scrolls at full speed, so the sheet slides up over it — a
// parallax done by CSS (a scroll-driven animation on .profile-hero.is-parallax).
// This only switches it on — for a hero that fits on the screen (a taller one,
// the profile in edit mode, would get its bottom covered before it's seen) —
// and gives the CSS the hero's height (--hero-h: the scroll over which it
// runs). Imported by js/layout.js; no page needs to know about it.

const touch = document.documentElement.classList.contains("app-header");
let hero = null;

function measure() {
  if (!hero) return;
  const height = hero.offsetHeight;
  hero.style.setProperty("--hero-h", `${height}px`);
  hero.classList.toggle("is-parallax", height <= window.innerHeight);
}

const sizes = new ResizeObserver(measure);

function track() {
  const found = document.querySelector(".hero-sheet")?.previousElementSibling;
  const next = found?.matches(".profile-hero") ? found : found?.querySelector(".profile-hero") ?? null;
  if (next === hero) return measure();
  if (hero) sizes.unobserve(hero);
  hero = next;
  if (hero) sizes.observe(hero);
  measure();
}

if (touch) {
  // On load, and after each in-app navigation (the router swaps <main>,
  // then announces it).
  track();
  document.addEventListener("app:scroll-restored", track);
  new MutationObserver(track).observe(document.body, { childList: true });
  document.addEventListener("app:navigate", () => requestAnimationFrame(() => requestAnimationFrame(track)));
  window.addEventListener("resize", measure, { passive: true });
}
