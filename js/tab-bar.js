// Touch screens (html.nav-mobile): the floating tab bar at the bottom of
// the screen, in place of the old pill + list (styles.css "Tab bar") — a
// solid capsule with five sections always in view, each its icon over its
// name; the current one's icon in a red pill, filled, its name red (the
// hero's colour on hero pages: .site-nav.has-hero-accent) — Google's apps'
// way, since 2026-10-30 (it was a wide red chip with the name beside the
// icon). Changing section the new pill opens out and its icon does its own
// little animation. One tap to change section; tapping the current one
// scrolls back to the top.
//
// The same five sections as the computer's top bar: "Meta" stands for
// Comandanti, Matchups and Archetipi (and their detail pages —
// data-active-nav "meta"), which switch between each other with the
// segmented control at the top of those pages (.meta-tabs in
// commanders.html / matchups.html / archetypes.html).
//
// Built here into .site-nav (every page's nav markup unchanged); it slides
// away while scrolling down (js/nav-dropdown.js toggles
// .is-scrolled-away on .site-nav). No section lit on a page outside them
// (account, privacy).

import { haptic } from "./haptics.js";

const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// [key, label, href, icon, the body[data-active-nav] values it stands for]
const TABS = [
  ["home", "Bacheca", "index.html", svg('<path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path><path d="M10 21v-6h4v6"></path>'), ["current"]],
  ["events", "Leghe", "events.html", svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"></path><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"></path>'), ["events"]],
  ["meta", "Meta", "commanders.html", svg('<path d="M21 12A9 9 0 1 1 12 3v9Z"></path><path d="M15 3.5A9 9 0 0 1 20.5 9H15Z"></path>'), ["meta"]],
  ["players", "Giocatori", "players.html", svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>'), ["players"]],
  ["social", "Social", "social.html", svg('<circle cx="12" cy="12" r="9"></circle><path d="m10 8.5 5.5 3.5-5.5 3.5z"></path>'), ["social"]],
];

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function init() {
  if (!document.documentElement.classList.contains("nav-mobile")) return;
  const nav = document.querySelector(".site-nav");
  if (!nav || nav.querySelector(".tab-bar")) return;

  const bar = document.createElement("div");
  bar.className = "tab-bar";
  bar.innerHTML = TABS.map(
    ([key, label, href, icon]) =>
      `<a class="tab-bar-link" data-tab="${key}" href="${href}" aria-label="${label}"><span class="tab-bar-icon">${icon}</span><span class="tab-bar-name">${label}</span></a>`
  ).join("");
  nav.append(bar);
  nav.classList.add("has-tab-bar");

  const links = [...bar.querySelectorAll(".tab-bar-link")];

  // The section for the page on screen: lit.
  const sync = () => {
    const active = document.body.dataset.activeNav;
    const tab = TABS.find((t) => t[4].includes(active))?.[0] ?? null;
    for (const a of links) {
      const on = a.dataset.tab === tab;
      a.classList.toggle("is-current", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  };

  sync();
  // From now on a change of section animates (styles.css .tab-bar.is-ready:
  // the pill opening out, the icon's pop) — not this first paint.
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add("is-ready")));
  // In-app navigation and back / forward (js/router.js sets the next page's
  // data-active-nav on <body>).
  new MutationObserver(sync).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-active-nav"],
  });
  bar.addEventListener("click", (e) => {
    const link = e.target.closest(".tab-bar-link");
    if (!link) return;
    haptic();
    // The current section (its first page, not one of its other pages —
    // Matchups, a detail page — which leave for it as usual): back to the top.
    const file = (path) => (path.endsWith("/") ? `${path}index.html` : path);
    const here = file(new URL(link.href, location.href).pathname) === file(location.pathname);
    if (link.classList.contains("is-current") && here) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    }
  });
}

init();
