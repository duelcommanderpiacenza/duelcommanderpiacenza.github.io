import { Leagues, Events, EventEntries, Matches } from "./db.js";
import { computeLeagueSummary } from "./stats.js";
import { computeLeaguePoints } from "./leaderboard.js";
import { escapeHtml, playerLabel, showError } from "./ui.js";

async function init() {
  const el = document.getElementById("current-league-content");

  try {
    const league = await Leagues.getOpen();
    if (!league) {
      el.innerHTML =
        '<p class="page-empty">Nessuna lega attualmente in corso. Dai un\'occhiata alle <a href="leagues.html">leghe passate</a>.</p>';
      return;
    }

    // RLS shows only closed events to anonymous visitors, so this already
    // reflects just the published (closed) events of the current league.
    const events = await Events.listByLeague(league.id);
    const eventsData = await Promise.all(
      events.map(async (ev) => {
        const [entries, matches] = await Promise.all([EventEntries.listByEvent(ev.id), Matches.listByEvent(ev.id)]);
        return { entries, matches };
      })
    );

    const summary = computeLeagueSummary(eventsData);
    const standings = computeLeaguePoints(eventsData);

    el.innerHTML = `
      <a class="entity-card" href="league.html?id=${league.id}" style="display:block;margin-bottom:20px;max-width:360px;">
        <div class="entity-card-meta">Lega in corso</div>
        <div class="entity-card-title" style="font-size:1.4rem;">${escapeHtml(league.name)}</div>
      </a>

      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-tile-label">Eventi</div><div class="stat-tile-value">${summary.events}</div></div>
        <div class="stat-tile"><div class="stat-tile-label">Giocatori</div><div class="stat-tile-value">${summary.uniquePlayers}</div></div>
        <div class="stat-tile"><div class="stat-tile-label">Presenza media</div><div class="stat-tile-value">${summary.avgPlayersPerEvent.toFixed(1)}</div></div>
        <div class="stat-tile"><div class="stat-tile-label">Partite giocate</div><div class="stat-tile-value">${summary.totalMatches}</div></div>
      </div>

      ${
        standings.length === 0
          ? '<p class="page-empty">Non ci sono ancora dati per la classifica.</p>'
          : `
        <h2 style="margin-top:28px;">Classifica</h2>
        <div class="data-table-wrap"><table class="data-table">
          <thead><tr><th>#</th><th>Giocatore</th><th>Punti</th><th>V-S-P</th><th>Winrate</th><th>Eventi giocati</th></tr></thead>
          <tbody>
            ${standings
              .map(
                (s, i) => `
              <tr>
                <td class="rank-cell">${i + 1}</td>
                <td>${playerLabel(s.player)}</td>
                <td><strong>${s.points}</strong></td>
                <td>${s.wins}-${s.losses}-${s.draws}</td>
                <td>${s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%`}</td>
                <td>${s.eventsPlayed}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table></div>`
      }
    `;
  } catch (err) {
    showError(el, err);
  }
}

init();
