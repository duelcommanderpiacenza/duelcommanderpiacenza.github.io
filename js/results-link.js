// An event's external links next to its name — event.html's title and
// Leghe & Eventi's tiles (the Bacheca's rows: behind "Liste", below): its decklists on Moxfield
// (events.decklists_url) and its top decks on mtgtop8 (events.results_url),
// both optional, set in the admin.
//
// Side by side in a .results-links wrapper: a round white button with the
// Moxfield logo, then a white pill with mtgtop8's wordmark (top8.png) —
// either one alone when the event only has that link, nothing with neither.
//
// Two shapes, because a Bacheca row is already one big <a> to the event
// page — and an <a> nested inside another <a> isn't just invalid, the HTML
// parser actively closes the outer link early, breaking the row's layout.
// There each link is a <span role="link"> instead, opened by the delegated
// handler below; event.html's title isn't inside a link, so it gets real <a>s.

import { escapeHtml, isHttpUrl } from "./ui.js";

const TOP8_LABEL = "Top deck su mtgtop8";
const MOXFIELD_LABEL = "Decklist su Moxfield";

// width/height = the files' own size, so the browser knows each logo's
// proportions before it loads (styles.css sets the displayed size).
const MOXFIELD_LOGO = '<img src="moxfield.png" alt="" width="192" height="192">';
const TOP8_LOGO = '<img src="top8.png" alt="" width="243" height="55">';

// Hover tooltip: data-tooltip, styled by the same CSS as .icon-badge's
// (player badges / banned icon) — not a native `title`, which can't be
// restyled and would pop up its own second tooltip on top of that one.
// The logos are images with empty alt, so the aria-label names the link.
function linkTag(nested, url, className, label, content) {
  const attrs = `class="results-link ${className}" aria-label="${label}" data-tooltip="${label}"`;
  return nested
    ? `<span ${attrs} role="link" tabindex="0" data-ext-url="${escapeHtml(url)}">${content}</span>`
    : `<a ${attrs} href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
}

function render(nested, resultsUrl, decklistsUrl) {
  const links = [
    isHttpUrl(decklistsUrl) ? linkTag(nested, decklistsUrl, "results-link-moxfield", MOXFIELD_LABEL, MOXFIELD_LOGO) : "",
    isHttpUrl(resultsUrl) ? linkTag(nested, resultsUrl, "results-link-top8", TOP8_LABEL, TOP8_LOGO) : "",
  ].join("");
  return links ? `<span class="results-links">${links}</span>` : "";
}

export function resultsLink(resultsUrl, decklistsUrl) {
  return render(false, resultsUrl, decklistsUrl);
}

// For use inside an element that's already a link (see top of file).
export function nestedResultsLink(resultsUrl, decklistsUrl) {
  return render(true, resultsUrl, decklistsUrl);
}

// Capture phase on document, so it runs before the enclosing <a>'s own
// navigation — stopped here, so the only thing a click on the button does is
// open the external site in a new tab.
function openNested(e) {
  const link = e.target.closest?.("[data-ext-url]");
  if (!link) return;
  if (e.type === "keydown" && e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  const url = link.dataset.extUrl;
  if (isHttpUrl(url)) window.open(url, "_blank", "noopener,noreferrer");
}

document.addEventListener("click", openNested, true);
document.addEventListener("keydown", openNested, true);

// --- "Liste": the links behind one button ------------------------------------
//
// The Bacheca's played events: one same "Liste" button on each (inside the
// row's own link, so a <span role="button">), opening a small menu of the
// links the event has — its decklists on Moxfield, its top decks on mtgtop8.
// The menu is appended to <body> (real <a>s there, nothing nested; no
// clipping ancestor) and positioned under the button, its right edge on
// the button's (above it when there's no room below).

const LIST_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line><line x1="9" y1="18" x2="20" y2="18"></line><circle cx="4.5" cy="6" r="1"></circle><circle cx="4.5" cy="12" r="1"></circle><circle cx="4.5" cy="18" r="1"></circle></svg>';

export function nestedResultsMenu(resultsUrl, decklistsUrl) {
  const moxfield = isHttpUrl(decklistsUrl) ? ` data-moxfield-url="${escapeHtml(decklistsUrl)}"` : "";
  const top8 = isHttpUrl(resultsUrl) ? ` data-top8-url="${escapeHtml(resultsUrl)}"` : "";
  if (!moxfield && !top8) return "";
  return `<span class="results-menu-btn" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false"${moxfield}${top8}>${LIST_ICON}Liste</span>`;
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
