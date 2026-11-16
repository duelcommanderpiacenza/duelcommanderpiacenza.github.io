// Shared "filter by league / event" widget used by the Commanders,
// Archetypes and Players pages (and commander.html). Wires two <select>
// elements together (choosing a league narrows the event list to that
// league's events) and reports back the current in-scope event ids whenever
// either one changes.

import { Leagues, Events } from "./db.js";
import { escapeHtml, eventTitle } from "./ui.js";
import { inWhere } from "./where-filter.js";

// `initial` ({ league, event }, optional — the Meta section's shared filter,
// js/meta-filters.js): picked to start with, when still offered.
// `leagues` / `events` (optional): Leagues.list() / Events.list() already
// loaded by the page — fetched together with its own first requests, so
// its data isn't waiting on a second round just for the filter (and the
// events not downloaded twice). Fetched here when not given.
// `where` (optional — js/where-filter.js's Dal vivo / Online / Tutto): only
// the leagues and events played that way are offered and reported (the
// page then loads its lists `withOnline`); a change redraws both lists,
// keeping the league / event picked when still offered, and reports the
// new scope.
export async function initScopeFilter({
  leagueSelect,
  eventSelect,
  onChange,
  initial = null,
  leagues: loadedLeagues = null,
  events: loadedEvents = null,
  where = null,
}) {
  const [allLeagues, allEvents] = await Promise.all([loadedLeagues ?? Leagues.list(), loadedEvents ?? Events.list()]);
  const inScope = (row) => !where || inWhere(where.value, row);
  // A still-open (including future) event has no stats to filter by yet —
  // offering it here would just be a selectable option that always shows
  // an empty result.
  let events = [];

  function populateLeagues() {
    events = allEvents.filter((e) => !e.is_open && inScope(e));
    leagueSelect.innerHTML =
      '<option value="">Tutte le leghe</option>' +
      allLeagues
        .filter(inScope)
        .map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`)
        .join("");
  }

  function eventsInLeague(leagueId) {
    return leagueId ? events.filter((e) => e.league_id === leagueId) : events;
  }

  function populateEvents() {
    const scoped = eventsInLeague(leagueSelect.value);
    eventSelect.innerHTML =
      '<option value="">Tutti gli eventi</option>' +
      scoped
        .map((e) => {
          const name = eventTitle(e);
          // data-label/data-sublabel are what js/custom-select.js's popup
          // actually renders (event name bold, league name on its own
          // smaller/muted line below — same convention as e.g. the
          // homepage's own event rows) — the option's own text content
          // stays the plain combined string either way, for the native
          // <select> (no-JS fallback, screen readers).
          return `<option value="${e.id}" data-label="${escapeHtml(name)}"${
            e.league ? ` data-sublabel="${escapeHtml(e.league.name)}"` : ""
          }>${escapeHtml(name)}${e.league ? ` — ${escapeHtml(e.league.name)}` : ""}</option>`;
        })
        .join("");
  }

  function currentEventIds() {
    if (eventSelect.value) return [eventSelect.value];
    return eventsInLeague(leagueSelect.value).map((e) => e.id);
  }

  leagueSelect.addEventListener("change", () => {
    populateEvents();
    onChange(currentEventIds());
  });
  eventSelect.addEventListener("change", () => onChange(currentEventIds()));

  const offered = (select, value) => value && [...select.options].some((o) => o.value === value);
  function pick({ league, event }) {
    populateLeagues();
    if (offered(leagueSelect, league)) leagueSelect.value = league;
    populateEvents();
    if (offered(eventSelect, event)) eventSelect.value = event;
  }
  // The filters button's "set" dot (js/filter-toggle.js) re-reads the panel.
  const refreshButton = () => leagueSelect.closest(".filter-panel")?.dispatchEvent(new Event("change"));

  pick(initial ?? {});
  if (initial) refreshButton();
  onChange(currentEventIds());

  where?.onChange(() => {
    pick({ league: leagueSelect.value, event: eventSelect.value });
    refreshButton();
    onChange(currentEventIds());
  });
}
