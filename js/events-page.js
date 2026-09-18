import { Events } from "./db.js";
import { escapeHtml, formatDate, leagueStatusBadge, showError } from "./ui.js";

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
    // currently-active league naturally floats to the top.
    const groups = new Map();
    for (const ev of events) {
      const key = ev.league?.id ?? "none";
      if (!groups.has(key)) groups.set(key, { league: ev.league, events: [] });
      groups.get(key).events.push(ev);
    }

    listEl.innerHTML = Array.from(groups.values())
      .map(
        (g) => `
      <section class="league-group">
        <h2 class="league-group-title">
          ${g.league ? `<a href="league.html?id=${g.league.id}">${escapeHtml(g.league.name)}</a>` : "Senza lega"}
          ${g.league ? leagueStatusBadge(g.league.is_open) : ""}
        </h2>
        <div class="entity-grid">
          ${g.events
            .map(
              (ev) => `
            <a class="entity-card" href="event.html?id=${ev.id}">
              <div class="entity-card-meta">${formatDate(ev.event_date)}</div>
              <div class="entity-card-title">${escapeHtml(ev.name)}</div>
            </a>`
            )
            .join("")}
        </div>
      </section>`
      )
      .join("");
  } catch (err) {
    showError(listEl, err);
  }
}

init();
