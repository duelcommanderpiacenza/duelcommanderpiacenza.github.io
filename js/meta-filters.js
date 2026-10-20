// One filter for the whole Meta section (Comandanti / Matchups /
// Archetipi): the Lega / Evento / Dal set on one page is already applied on
// the other two. Kept for the browsing session (sessionStorage
// "metaFilters" — closing the app goes back to the default, the last
// DEFAULT_DATE_FROM_YEARS years). Comandanti's colour filter stays its own.

const KEY = "metaFilters";

// Moving from one Meta page to another (in-app navigation): the filters'
// button already shown stays shown while the next page loads (styles.css
// html.meta-filter-kept) — only the first arrival in the section fades it
// in. Checked as the swap starts, the page being left still on screen.
document.addEventListener("app:navigate", () => {
  document.documentElement.classList.toggle("meta-filter-kept", Boolean(document.querySelector("main .meta-head .filter-toggle-btn")));
});

// { league, event, dateFrom } as last set, or null (nothing set yet this
// session — the page's defaults then). dateFrom "" = the whole history.
export function savedMetaFilters() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

// Remembers the three fields whenever one changes — read a beat later, once
// the page's own listeners have run (choosing a league resets the event).
export function rememberMetaFilters({ leagueSelect, eventSelect, dateFromInput }) {
  const save = () =>
    setTimeout(() => {
      try {
        sessionStorage.setItem(
          KEY,
          JSON.stringify({ league: leagueSelect.value, event: eventSelect.value, dateFrom: dateFromInput.value })
        );
      } catch {
        // Private mode / storage off: each page keeps its own.
      }
    }, 0);
  for (const el of [leagueSelect, eventSelect, dateFromInput]) el.addEventListener("change", save);
}
