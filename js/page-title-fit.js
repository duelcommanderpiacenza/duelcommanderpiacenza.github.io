// Page-title fitting: a long <h1> shrunk to fit one line instead of
// wrapping — a detail hero's name at every width, any other title on phones
// (≤640px). (Anything beside a title is a sibling of the <h1>, not inside
// it — only the name itself is ever fitted.)

const MOBILE_MAX_WIDTH = 640;
const MIN_FONT_SIZE = 17;

// Shrinks the title's font-size (down to a 17px floor) when it doesn't fit
// the width actually left for it on a phone (viewport minus the back button
// and its gap) — flex-wrap on .page-heading already lets it wrap rather than
// overflow, but a name reads better shrunk to fit one line than broken
// across two. Measures the text's own natural (unwrapped) width against the
// space actually available and scales the font down to match, rather than
// picking one fixed smaller mobile size — a short name stays at full size,
// only a genuinely long one shrinks, and only exactly as much as it needs
// to. Desktop is untouched (plenty of width there) and a name still too
// long even at the floor size is left to wrap, same as before.
// A hero's name (.profile-hero-name: player, commander, league, event,
// archetype) is fitted at every width, on its line (.detail-hero-title-row).
export function fitTitleToOneLine(titleEl) {
  titleEl.style.fontSize = "";
  if (window.innerWidth > MOBILE_MAX_WIDTH && !titleEl.classList.contains("profile-hero-name")) return;
  const baseFontSize = parseFloat(getComputedStyle(titleEl).fontSize);
  const availableWidth = titleEl.clientWidth;
  // Forcing nowrap for a moment reveals the text's true single-line width
  // (scrollWidth) — reset right after, so this doesn't leave the title
  // permanently overflowing its box before the shrink is applied.
  titleEl.style.whiteSpace = "nowrap";
  const naturalWidth = titleEl.scrollWidth;
  titleEl.style.whiteSpace = "";
  if (naturalWidth <= availableWidth) return;
  titleEl.style.fontSize = `${Math.max(MIN_FONT_SIZE, Math.floor((baseFontSize * availableWidth) / naturalWidth))}px`;
}

// Fits the title now and again on every resize/rotation.
// `signal` (js/router.js mount): stops with the page.
export function initTitleFit(titleEl, { signal } = {}) {
  const fit = () => fitTitleToOneLine(titleEl);
  fit();
  window.addEventListener("resize", fit, { signal });
}
