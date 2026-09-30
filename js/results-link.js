// An event's external links next to its name — event.html's title and the
// Bacheca's "Ultimi eventi" rows: its decklists on Moxfield
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
