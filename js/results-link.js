// An event's external links: its decklists on Moxfield
// (events.decklists_url) and its top decks on mtgtop8 (events.results_url),
// both optional, set in the admin — behind one "Liste" button (below), on
// the Bacheca's and league.html's rows, Leghe & Eventi's latest-event tiles
// and event.html's title.

import { escapeHtml, isHttpUrl } from "./ui.js";

// width/height = the files' own size, so the browser knows each logo's
// proportions before it loads (styles.css sets the displayed size).
const MOXFIELD_LOGO = '<img src="moxfield.png" alt="" width="192" height="192">';
const TOP8_LOGO = '<img src="top8.png" alt="" width="243" height="55">';

// --- "Liste": the links behind one button ------------------------------------
//
// The Bacheca's and league.html's played events, Leghe & Eventi's latest
// events and event.html's title: one same "Liste" button on each (a row's /
// tile's inside its own link, so a <span role="button">), opening a small
// menu of the
// links the event has — its decklists on Moxfield, its top decks on mtgtop8.
// The menu is appended to <body> (real <a>s there, nothing nested; no
// clipping ancestor) and positioned under the button, its right edge on
// the button's (above it when there's no room below).

// Two cards, one behind the other (decklists) — not the list icon of the
// Bacheca's "Classifica completa" beside it.
const DECKS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="12" height="16" rx="2"></rect><path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2"></path></svg>';

export function nestedResultsMenu(resultsUrl, decklistsUrl) {
  const moxfield = isHttpUrl(decklistsUrl) ? ` data-moxfield-url="${escapeHtml(decklistsUrl)}"` : "";
  const top8 = isHttpUrl(resultsUrl) ? ` data-top8-url="${escapeHtml(resultsUrl)}"` : "";
  if (!moxfield && !top8) return "";
  return `<span class="results-menu-btn" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false"${moxfield}${top8}>${DECKS_ICON}Liste</span>`;
}

let menuEl = null;
let menuBtn = null;

function closeMenu() {
  menuEl?.remove();
  menuBtn?.setAttribute("aria-expanded", "false");
  menuEl = null;
  menuBtn = null;
}

function menuItem(url, className, logo, label) {
  return `<a class="results-menu-item ${className}" role="menuitem" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span class="results-menu-logo">${logo}</span>${label}</a>`;
}

function openMenu(btn) {
  closeMenu();
  const { moxfieldUrl, top8Url } = btn.dataset;
  const menu = document.createElement("div");
  menu.className = "results-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = [
    isHttpUrl(moxfieldUrl) ? menuItem(moxfieldUrl, "is-moxfield", MOXFIELD_LOGO, "Moxfield") : "",
    isHttpUrl(top8Url) ? menuItem(top8Url, "is-top8", TOP8_LOGO, "MTGTop8") : "",
  ].join("");
  document.body.appendChild(menu);
  menuEl = menu;
  menuBtn = btn;
  btn.setAttribute("aria-expanded", "true");

  const r = btn.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const margin = 8;
  const left = Math.max(margin, Math.min(r.right - m.width, window.innerWidth - m.width - margin));
  const below = r.bottom + 6;
  const top = below + m.height > window.innerHeight - margin ? r.top - 6 - m.height : below;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.classList.toggle("is-above", top < r.top);
  requestAnimationFrame(() => menu.classList.add("is-open"));
}

// Captured, before the row's own link: the button only opens / closes its
// menu; a click anywhere else closes it (a link in it opens in a new tab).
document.addEventListener(
  "click",
  (e) => {
    const btn = e.target.closest?.(".results-menu-btn");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      if (btn === menuBtn) closeMenu();
      else openMenu(btn);
      return;
    }
    if (menuEl && menuEl.contains(e.target)) {
      setTimeout(closeMenu);
      return;
    }
    closeMenu();
  },
  true
);

document.addEventListener(
  "keydown",
  (e) => {
    const btn = e.target.closest?.(".results-menu-btn");
    if (btn && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      openMenu(btn);
      menuEl?.querySelector("a")?.focus();
    } else if (e.key === "Escape" && menuEl) {
      const back = menuBtn;
      closeMenu();
      back?.focus();
    }
  },
  true
);

window.addEventListener("scroll", closeMenu, { capture: true, passive: true });
window.addEventListener("resize", closeMenu);
document.addEventListener("app:navigate", closeMenu);
