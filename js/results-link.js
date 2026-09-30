// An event's external links next to its name — event.html's title and the
// Bacheca's "Ultimi eventi" rows: its top decks on mtgtop8
// (events.results_url) and its decklists on Moxfield (events.decklists_url),
// both optional, set in the admin.
//
// - mtgtop8 only: the small red "🏆 Top 8" pill.
// - Both: one split pill, white left half with the Moxfield logo, red right
//   half "Top 8" (no trophy — the pill is wide enough already), each half
//   its own link.
// - Moxfield only: that white half alone, a round logo button.
// - Neither: nothing.
//
// Two shapes, because a Bacheca row is already one big <a> to the event
// page — and an <a> nested inside another <a> isn't just invalid, the HTML
// parser actively closes the outer link early, breaking the row's layout.
// There each link is a <span role="link"> instead, opened by the delegated
// handler below; event.html's title isn't inside a link, so it gets real <a>s.

import { escapeHtml, isHttpUrl } from "./ui.js";

const TOP8_LABEL = "Top deck su mtgtop8";
// Visible text on the pill itself — the icon alone didn't read as "results
// link" at a glance, and on touch devices the hover tooltip never shows.
const TOP8_TEXT = "Top8";
const MOXFIELD_LABEL = "Decklist su Moxfield";

const TROPHY_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"></path>' +
  '<path d="M17 6h3v1a3 3 0 0 1-3 3"></path>' +
  '<path d="M7 6H4v1a3 3 0 0 0 3 3"></path>' +
  '<path d="M12 14v4"></path>' +
  '<path d="M8 21h8"></path>' +
  "</svg>";

const MOXFIELD_LOGO = '<img src="moxfield.png" alt="" width="30" height="30">';

// Hover tooltip: data-tooltip, styled by the same CSS as .icon-badge's
// (player badges / banned icon) — not a native `title`, which can't be
// restyled and would pop up its own second tooltip on top of that one.
// The aria-label may differ from the tooltip: it starts with the pill's
// visible text ("Top 8"), so the accessible name contains what's on screen.
function linkTag(nested, url, className, label, tooltip, content) {
  const attrs = `class="${className}" aria-label="${label}" data-tooltip="${tooltip}"`;
  return nested
    ? `<span ${attrs} role="link" tabindex="0" data-ext-url="${escapeHtml(url)}">${content}</span>`
    : `<a ${attrs} href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
}

function render(nested, resultsUrl, decklistsUrl) {
  const hasTop8 = isHttpUrl(resultsUrl);
  const hasMoxfield = isHttpUrl(decklistsUrl);
  if (!hasMoxfield) {
    return hasTop8
      ? linkTag(nested, resultsUrl, "results-link", `${TOP8_TEXT}: ${TOP8_LABEL}`, TOP8_LABEL, `${TROPHY_SVG}<span>${TOP8_TEXT}</span>`)
      : "";
  }
  const moxfield = linkTag(nested, decklistsUrl, "results-link-seg results-link-seg-moxfield", MOXFIELD_LABEL, MOXFIELD_LABEL, MOXFIELD_LOGO);
  const top8 = hasTop8
    ? linkTag(nested, resultsUrl, "results-link-seg", `${TOP8_TEXT}: ${TOP8_LABEL}`, TOP8_LABEL, `<span>${TOP8_TEXT}</span>`)
    : "";
  return `<span class="results-link-group">${moxfield}${top8}</span>`;
}

export function resultsLink(resultsUrl, decklistsUrl) {
  return render(false, resultsUrl, decklistsUrl);
}

// For use inside an element that's already a link (see top of file).
export function nestedResultsLink(resultsUrl, decklistsUrl) {
  return render(true, resultsUrl, decklistsUrl);
}

// Capture phase on document, so it runs before the enclosing <a>'s own
// navigation — stopped here, so the only thing a click on the pill does is
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
