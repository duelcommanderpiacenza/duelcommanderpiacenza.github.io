// One filter for the whole Meta section (Comandanti / Matchups /
// Archetipi): the Lega / Evento / Dal set on one page is already applied on
// the other two. Kept for the browsing session (sessionStorage
// "metaFilters" — closing the app goes back to the default, the last
// DEFAULT_DATE_FROM_YEARS years). Comandanti's colour filter stays its own.

const KEY = "metaFilters";

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
