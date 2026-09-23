// Shared "filter by league / event" widget used by the Commanders and
// Archetypes pages. Wires two <select> elements together (choosing a league
// narrows the event list to that league's events) and reports back the
// current in-scope event ids whenever either one changes.

import { Leagues, Events } from "./db.js";
import { escapeHtml, eventTitle } from "./ui.js";

export async function initScopeFilter({ leagueSelect, eventSelect, onChange }) {
  const [leagues, allEvents] = await Promise.all([Leagues.list(), Events.list()]);
  // A still-open (including future) event has no stats to filter by yet —
  // offering it here would just be a selectable option that always shows
  // an empty result.
  const events = allEvents.filter((e) => !e.is_open);

  leagueSelect.innerHTML =
    '<option value="">Tutte le leghe</option>' +
    leagues.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join("");

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

  populateEvents();
  onChange(currentEventIds());
}
