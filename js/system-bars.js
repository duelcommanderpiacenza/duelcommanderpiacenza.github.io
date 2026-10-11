// The phone's system bar colour (the status bar at the top — where the front
// camera is — when the site is installed as an app, or the browser's own bar):
// the page's <meta name="theme-color">, kept matching what's right under the
// (transparent, on phones) header, so the bar blends into the page as if it
// were see-through:
//  - a page with a hero (its art running up behind the header): a dark shade
//    of the hero's colour (--hero-bar, js/player-card.js applyHeroTone), or
//    a near-black before it's known;
//  - any other page: the page's own background, light or dark;
//  - wider than a phone (the red header bar): the brand red.
// Kept in step with the theme, the header's colour, the window's width, and
// js/router.js's in-app navigation (refreshSystemBars after each swap).

const PHONE = window.matchMedia("(max-width: 640px)");

const PAGE_LIGHT = "#fff9f7";
const PAGE_DARK = "#1b1315";
const HERO_DEFAULT = "#140c0e";
const BRAND = "#dc181c";

function heroUnderHeader() {
  return Boolean(document.querySelector(".page-main .profile-hero")) && !document.querySelector(".profile-claim:not([hidden])");
}

function barColor() {
  if (!PHONE.matches) return BRAND;
  if (heroUnderHeader()) {
    const header = document.querySelector(".site-header");
    const tone = header ? getComputedStyle(header).getPropertyValue("--hero-bar").trim() : "";
    return tone || HERO_DEFAULT;
  }
  return document.documentElement.dataset.theme === "dark" ? PAGE_DARK : PAGE_LIGHT;
}

export function refreshSystemBars() {
  const color = barColor();
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    if (meta.getAttribute("content") !== color) meta.setAttribute("content", color);
  }
}

new MutationObserver(refreshSystemBars).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
const header = document.querySelector(".site-header");
if (header) new MutationObserver(refreshSystemBars).observe(header, { attributes: true, attributeFilter: ["class", "style"] });
PHONE.addEventListener("change", refreshSystemBars);
refreshSystemBars();
