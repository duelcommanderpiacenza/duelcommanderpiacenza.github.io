import { Leagues, Events } from "./db.js";
import { escapeHtml, leagueStatusBadge, showError } from "./ui.js";

async function init() {
  const listEl = document.getElementById("leagues-list");
  try {
    const [leagues, events] = await Promise.all([Leagues.list(), Events.list()]);

    const eventCountByLeague = new Map();
    for (const ev of events) {
      eventCountByLeague.set(ev.league_id, (eventCountByLeague.get(ev.league_id) ?? 0) + 1);
    }

    listEl.innerHTML =
      leagues.length === 0
        ? '<p class="page-empty">Nessuna lega inserita ancora.</p>'
        : leagues
            .map((l) => {
              const count = eventCountByLeague.get(l.id) ?? 0;
              return `
        <a class="entity-card" href="league.html?id=${l.id}">
          <div class="entity-card-title">${escapeHtml(l.name)}</div>
          <div class="entity-card-meta">${count} evento${count === 1 ? "" : "i"}</div>
          ${leagueStatusBadge(l.is_open)}
        </a>`;
            })
            .join("");
  } catch (err) {
    showError(listEl, err);
  }
}

init();
