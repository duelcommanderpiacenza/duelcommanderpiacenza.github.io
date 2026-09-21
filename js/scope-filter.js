// Shared "filter by league / event" widget used by the Commanders and
// Archetypes pages. Wires two <select> elements together (choosing a league
// narrows the event list to that league's events) and reports back the
// current in-scope event ids whenever either one changes.

import { Leagues, Events } from "./db.js";
import { escapeHtml, eventTitle } from "./ui.js";

export async function initScopeFilter({ leagueSelect, eventSelect, onChange }) {
  const [leagues, events] = await Promise.all([Leagues.list(), Events.list()]);

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
        .map(
          (e) =>
            `<option value="${e.id}">${escapeHtml(eventTitle(e))}${
              e.league ? ` — ${escapeHtml(e.league.name)}` : ""
            }</option>`
        )
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
