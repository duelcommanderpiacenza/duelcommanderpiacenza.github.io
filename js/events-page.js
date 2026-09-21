import { Events } from "./db.js";
import { escapeHtml, formatDate, eventTitle, leagueStatusBadge, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

async function init() {
  const listEl = document.getElementById("events-list");
  try {
    const events = await Events.list();
    if (events.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun evento inserito ancora.</p>';
      return;
    }

    // Grouped by league, in the order each league's most recent event first
    // appears (events.list() is already sorted by date desc), so the
    // currently-active league naturally floats to the top. Standalone events
    // (no league) are pulled into their own trailing section instead, so
    // they read as a distinct group rather than being interleaved by date.
    const leagueGroups = new Map();
    const standaloneEvents = [];
    for (const ev of events) {
      if (!ev.league) {
        standaloneEvents.push(ev);
        continue;
      }
      if (!leagueGroups.has(ev.league.id)) leagueGroups.set(ev.league.id, { league: ev.league, events: [] });
      leagueGroups.get(ev.league.id).events.push(ev);
    }

    function renderEventGrid(evs) {
      return `<div class="entity-grid">
          ${evs
            .map(
              (ev) => `
            <a class="entity-card" href="event.html?id=${ev.id}">
              ${ev.name ? `<div class="entity-card-meta">${formatDate(ev.event_date)}</div>` : ""}
              <div class="entity-card-title">${escapeHtml(eventTitle(ev))}</div>
            </a>`
            )
            .join("")}
        </div>`;
    }

    const leagueSections = Array.from(leagueGroups.values())
      .map(
        (g) => `
      <section class="league-group">
        <h2 class="league-group-title">
          <a href="league.html?id=${g.league.id}">${escapeHtml(g.league.name)}</a>
          ${leagueStatusBadge(g.league.is_open)}
        </h2>
        ${renderEventGrid(g.events)}
      </section>`
      )
      .join("");

    const standaloneSection =
      standaloneEvents.length === 0
        ? ""
        : `
      <section class="league-group">
        <h2 class="league-group-title">Eventi standalone</h2>
        ${renderEventGrid(standaloneEvents)}
      </section>`;

    listEl.innerHTML = leagueSections + standaloneSection;
  } catch (err) {
    showError(listEl, err);
  } finally {
    hidePageLoading();
  }
}

init();
