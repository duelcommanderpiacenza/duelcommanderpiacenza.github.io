// Comandanti / Matchups / Archetipi (the "Meta" section): on a computer the
// filters' round button moves from the title's line onto the sub-tabs' one
// (.meta-row, at its right end — the title line keeps "Meta" alone); touch
// screens keep it on the title's line, the sub-tabs' row a sticky segmented
// control of its own width. Called by each of the three pages' mount, before
// initFilterToggle (the button keeps its id and listeners). Until it's moved
// the button isn't shown there (styles.css), so it never jumps.

export function initMetaTabs() {
  if (document.documentElement.classList.contains("nav-mobile")) return;
  const main = document.querySelector("main");
  const row = main?.querySelector(":scope > .meta-row");
  const button = main?.querySelector(":scope > .page-heading .filter-toggle-btn");
  if (row && button) row.append(button);
}
