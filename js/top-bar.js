// A computer's one top bar (styles.css "One top bar"; touch screens have
// their own header + nav pill, nothing here runs there). The search there
// is always a round button: a click on it focuses the field, which opens
// the search (js/site-search.js) and widens it over the tabs (styles.css).
// Tabs that don't fit the bar scroll sideways — no scrollbar, edge fades,
// dragged with the mouse (js/drag-scroll.js) — the current one kept in
// view.

import { enableDragScroll } from "./drag-scroll.js";

function init() {
  if (document.documentElement.classList.contains("nav-mobile")) return;
  const row = document.querySelector(".site-nav-inner");
  const field = document.querySelector(".site-header:not(.site-header--admin) .site-search-field");
  const input = document.getElementById("site-search-input");
  if (!row) return;

  // The current tab in view when the row scrolls (after an in-app
  // navigation changes it, or the back pill takes room before it).
  function revealActive() {
    const link = row.querySelector(`.nav-link[data-nav="${document.body.dataset.activeNav}"]`);
    if (!link || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: link.offsetLeft - (row.clientWidth - link.offsetWidth) / 2 });
  }

  new MutationObserver(revealActive).observe(document.body, { attributes: true, attributeFilter: ["data-active-nav"] });
  new MutationObserver(revealActive).observe(row, { childList: true });
  revealActive();

  enableDragScroll(row);

  if (field && input) {
    field.addEventListener("click", () => input.focus());
    // Escape closes the search (js/site-search.js): the field lets go of
    // the focus too, rather than staying focused inside the closed circle.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") input.blur();
    });
  }
}

init();
