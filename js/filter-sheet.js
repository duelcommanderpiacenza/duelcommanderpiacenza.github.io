// Comandanti and Giocatori, every screen (since 2026-11-25 — option G3 of
// a mockup, user: touch screens first, then computers the same; Matchups /
// Archetipi / Evoluzione / Confronto keep the switcher's funnel and the
// Dove bar): the search line holds the sort, then a 🔍 and the filters'
// button (static markup in the page — css/5 "The search line").
// - The 🔍 opens the search field in the sort's and its own place
//   (.is-searching — the filters' button stays), a ✕ inside its right end
//   clearing and closing it; an empty field closes again once left. A field with text stays open, so a filtered list is never
//   unexplained.
// - The filters' button opens a bottom sheet (a computer: a pop-up under
//   the button, closing on scroll or a click outside) holding the page's **own**
//   Dove bar (js/where-filter.js) and filter panel (js/filter-toggle.js,
//   js/scope-filter.js) — moved into it here, after the page has wired
//   them, so they keep working as before (saved choice, shared filters,
//   the "set" state). The button mirrors the switcher funnel's "set" state
//   (.has-active-filters → .is-set: the funnel red, as the funnel was) — no
//   mark of Dove's choice on it (user).
// The sheet lives in <body> (a fixed layer above the tab bar, out of
// <main>'s stacking) and is removed when the page is left (`signal`).

export function initFilterSheet({ page, signal }) {
  const touch = document.documentElement.classList.contains("nav-mobile");
  const main = document.querySelector(`main[data-page="${page}"]`);
  const line = main?.querySelector(".filter-toggle-line");
  const input = document.getElementById(`${page}-search`);
  const openSearch = document.getElementById(`${page}-search-open`);
  const closeSearch = document.getElementById(`${page}-search-close`);
  const filtersBtn = document.getElementById(`${page}-filters-open`);
  const funnel = document.getElementById(`${page}-filter-toggle`);
  const panel = document.getElementById(`${page}-filter-panel`);
  const where = main.querySelector(".meta-head .where-filter");
  if (!line || !input || !filtersBtn || !panel) return;

  // --- The search ----------------------------------------------------------
  const setSearching = (on) => {
    line.classList.toggle("is-searching", on);
    openSearch.setAttribute("aria-expanded", String(on));
  };
  openSearch.addEventListener("click", () => {
    setSearching(true);
    input.focus();
  });
  closeSearch.addEventListener("click", () => {
    if (input.value) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setSearching(false);
    openSearch.focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearch.click();
  });
  // Left empty: closed again (after a tick, so a tap on the ✕ still lands).
  input.addEventListener("blur", () => setTimeout(() => !input.value && document.activeElement !== input && setSearching(false), 150));
  if (input.value) setSearching(true);

  // --- The sheet -------------------------------------------------------------
  const sheet = document.createElement("div");
  sheet.className = "filter-sheet";
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="filter-sheet-backdrop"></div>
    <div class="filter-sheet-card" role="dialog" aria-modal="true" aria-labelledby="${page}-filter-sheet-title" tabindex="-1">
      <div class="filter-sheet-grip" aria-hidden="true"></div>
      <h2 class="filter-sheet-title" id="${page}-filter-sheet-title">Filtri</h2>
      <div class="filter-sheet-where"><span class="filter-sheet-label">Dove</span></div>
      <div class="filter-sheet-fields"></div>
      <button type="button" class="filter-sheet-done">Fatto</button>
    </div>`;
  const card = sheet.querySelector(".filter-sheet-card");
  if (where) sheet.querySelector(".filter-sheet-where").append(where);
  sheet.querySelector(".filter-sheet-fields").append(panel);
  document.body.append(sheet);

  // Focus into the sheet on opening; back to the button only when closed
  // from the keyboard (a tap would leave its focus ring showing).
  const setOpen = (on, { fromKey = false } = {}) => {
    // A computer: under the button, right edges lined up.
    if (on && !touch) {
      const r = filtersBtn.getBoundingClientRect();
      card.style.setProperty("--pop-top", `${Math.round(r.bottom + 8)}px`);
      card.style.setProperty("--pop-right", `${Math.round(document.documentElement.clientWidth - r.right)}px`);
    }
    sheet.hidden = !on;
    document.documentElement.classList.toggle("filter-sheet-open", on);
    filtersBtn.setAttribute("aria-expanded", String(on));
    if (on) card.focus({ preventScroll: true });
    else if (fromKey) filtersBtn.focus({ preventScroll: true });
    else document.activeElement?.blur();
  };
  filtersBtn.addEventListener("click", () => setOpen(true));
  sheet.querySelector(".filter-sheet-backdrop").addEventListener("click", () => setOpen(false));
  sheet.querySelector(".filter-sheet-done").addEventListener("click", (e) => setOpen(false, { fromKey: e.detail === 0 }));
  sheet.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented) setOpen(false, { fromKey: true });
  });
  // A computer: the pop-up would drift off its button — scrolling or
  // resizing closes it.
  if (!touch) {
    const closeIfOpen = () => !sheet.hidden && setOpen(false);
    window.addEventListener("scroll", closeIfOpen, { passive: true, signal });
    window.addEventListener("resize", closeIfOpen, { signal });
  }

  // --- The button's state -----------------------------------------------------
  function paint() {
    const set = Boolean(funnel?.classList.contains("has-active-filters"));
    filtersBtn.classList.toggle("is-set", set);
    filtersBtn.setAttribute("aria-label", set ? "Filtri (attivi)" : "Filtri");
  }
  const observer = new MutationObserver(paint);
  if (funnel) observer.observe(funnel, { attributes: true, attributeFilter: ["class"] });
  paint();

  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      sheet.remove();
      document.documentElement.classList.remove("filter-sheet-open");
    },
    { once: true }
  );
}
