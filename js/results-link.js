// Small red "🏆 Top 8" pill next to an event's name — event.html's title and
// the Bacheca's "Ultimi eventi" rows — linking to the event's top decks on
// mtgtop8 (events.results_url, set in the admin). Renders nothing for an
// event without one.
//
// Two shapes, because a Bacheca row is already one big <a> to the event
// page — and an <a> nested inside another <a> isn't just invalid, the HTML
// parser actively closes the outer link early, breaking the row's layout.
// There it's a <span role="link"> instead, opened by the delegated handler
// below; event.html's title isn't inside a link, so it gets a real <a>.

import { escapeHtml, isHttpUrl } from "./ui.js";

const LABEL = "Top deck su mtgtop8";
// Visible text on the pill itself — the icon alone didn't read as "results
// link" at a glance, and on touch devices the hover tooltip never shows.
const PILL_TEXT = "Top 8";

const TROPHY_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"></path>' +
  '<path d="M17 6h3v1a3 3 0 0 1-3 3"></path>' +
  '<path d="M7 6H4v1a3 3 0 0 0 3 3"></path>' +
  '<path d="M12 14v4"></path>' +
  '<path d="M8 21h8"></path>' +
  "</svg>";

const PILL_CONTENT = `${TROPHY_SVG}<span>${PILL_TEXT}</span>`;

// Hover tooltip: data-tooltip, styled by the same CSS as .icon-badge's
// (player badges / banned icon) — not a native `title`, which can't be
// restyled and would pop up its own second tooltip on top of that one.
export function resultsLink(url) {
  if (!isHttpUrl(url)) return "";
  return `<a class="results-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${PILL_TEXT}: ${LABEL}" data-tooltip="${LABEL}">${PILL_CONTENT}</a>`;
}

// For use inside an element that's already a link (see top of file).
export function nestedResultsLink(url) {
  if (!isHttpUrl(url)) return "";
  return `<span class="results-link" role="link" tabindex="0" data-results-url="${escapeHtml(url)}" aria-label="${PILL_TEXT}: ${LABEL}" data-tooltip="${LABEL}">${PILL_CONTENT}</span>`;
}

// Capture phase on document, so it runs before the enclosing <a>'s own
// navigation — stopped here, so the only thing a click on the pill does is
// open mtgtop8 in a new tab.
function openNested(e) {
  const pill = e.target.closest?.("[data-results-url]");
  if (!pill) return;
  if (e.type === "keydown" && e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  const url = pill.dataset.resultsUrl;
  if (isHttpUrl(url)) window.open(url, "_blank", "noopener,noreferrer");
}

document.addEventListener("click", openNested, true);
document.addEventListener("keydown", openNested, true);
