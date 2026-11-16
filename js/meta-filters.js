// One filter for the whole Meta section (Comandanti / Matchups /
// Archetipi / Evoluzione): the Lega / Evento / Dal set on one page is
// already applied on the others (the Dove bar, js/where-filter.js, is
// shared too, and with Giocatori / Confronto). Kept for the browsing
// session (sessionStorage "metaFilters" — closing the app goes back to the
// default, the last DEFAULT_DATE_FROM_YEARS years). Comandanti's colour
// filter stays its own. Giocatori / Confronto share theirs the same way,
// under their own key (PLAYERS_FILTERS_KEY).

import { fetchClosedResultsSince, fetchEventsResults } from "./db.js";

const KEY = "metaFilters";
export const PLAYERS_FILTERS_KEY = "playersFilters";

// Moving from one Meta page to another (in-app navigation): the filters'
// button already shown stays shown while the next page loads (styles.css
// html.meta-filter-kept) — only the first arrival in the section fades it
// in. Checked as the swap starts, the page being left still on screen.
document.addEventListener("app:navigate", () => {
  document.documentElement.classList.toggle("meta-filter-kept", Boolean(document.querySelector("main .meta-head .filter-toggle-btn")));
});

// { league, event, dateFrom } as last set, or null (nothing set yet this
// session — the page's defaults then). dateFrom "" = the whole history.
export function savedMetaFilters(key = KEY) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

// Remembers the three fields whenever one changes — read a beat later, once
// the page's own listeners have run (choosing a league resets the event).
export function rememberMetaFilters({ leagueSelect, eventSelect, dateFromInput }, key = KEY) {
  const save = () =>
    setTimeout(() => {
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({ league: leagueSelect.value, event: eventSelect.value, dateFrom: dateFromInput.value })
        );
      } catch {
        // Private mode / storage off: each page keeps its own.
      }
    }, 0);
  for (const el of [leagueSelect, eventSelect, dateFromInput]) el.addEventListener("change", save);
}

// --- The results, in the page's first round ----------------------------------
//
// A Meta page needs its events' entries + matches, and which events those
// are depends on the filters — normally a second round after the events
// and leagues. With no league or event picked (the default), the scope is
// "every closed event from Dal on": the database can filter that itself
// (db.js fetchClosedResultsSince), so it's started with the page's first
// requests. Any later scope within it (a league, an event, a later Dal) is
// then served from the same rows, without a request; one reaching earlier
// than that Dal is fetched as before.

// Started at mount, before the first await. null when a league or event is
// picked to start with (that scope is small: fetched as before).
// `commanders`: the entries' commanders too (fetchEventsResults'), the rows
// always slim — the same options as the page's metaResults calls. Online
// events' too, whatever the Dove choice (js/where-filter.js): the scope's
// event ids pick the rows, so switching it needs no request.
export function prefetchMetaResults(savedFilters, dateFrom, { commanders = false } = {}) {
  if (savedFilters?.league || savedFilters?.event) return null;
  const from = dateFrom || null;
  const request = fetchClosedResultsSince(from, { commanders, withOnline: true });
  // Marked as handled: a failure only means falling back (below).
  request.catch((err) => console.error(err));
  return { from, request };
}

// `eventIds`' results ([{ entries, matches }], fetchEventsResults' shape):
// from the prefetched rows when every event is within them — closed (the
// scope filter offers no other) and on or after their Dal — else fetched
// (slim, `commanders` as given). `eventDateById`: the page's event dates.
export async function metaResults(prefetch, eventIds, eventDateById, { commanders = false } = {}) {
  const covered = (id) => !prefetch.from || (eventDateById.get(id) ?? "") >= prefetch.from;
  if (prefetch && eventIds.every(covered)) {
    try {
      const { entriesByEvent, matchesByEvent } = await prefetch.request;
      return eventIds.map((id) => ({ entries: entriesByEvent.get(id) ?? [], matches: matchesByEvent.get(id) ?? [] }));
    } catch {
      // Failed (already logged): fetched the usual way.
    }
  }
  return fetchEventsResults(eventIds, { slim: true, commanders });
}
