import { Leagues, Events, EventEntries, Matches } from "./db.js";
import { computeLeagueSummary } from "./stats.js";
import { computeLeaguePoints } from "./leaderboard.js";
import { escapeHtml, eventTitle, formatDate, playerLabel, showError } from "./ui.js";

// Fetches this league's (published) events and computes both the summary
// stat tiles and, for a real league, the points standings. A Topdeck series
// has no points leaderboard, so `standings` is skipped for it.
async function loadLeagueFeature(league) {
  const events = await Events.listByLeague(league.id);
  const eventsData = await Promise.all(
    events.map(async (ev) => {
      const [entries, matches] = await Promise.all([EventEntries.listByEvent(ev.id), Matches.listByEvent(ev.id)]);
      return { entries, matches };
    })
  );

  const summary = computeLeagueSummary(eventsData);
  const standings = league.is_topdeck ? [] : computeLeaguePoints(eventsData);
  return { summary, standings };
}

function renderLeagueFeature(league, metaLabel, { summary, standings }) {
  return `
    <a class="entity-card" href="league.html?id=${league.id}" style="display:block;margin-bottom:20px;max-width:360px;">
      <div class="entity-card-meta">${metaLabel}</div>
      <div class="entity-card-title" style="font-size:1.4rem;">${escapeHtml(league.name)}</div>
    </a>

    <div class="stat-grid">
      <div class="stat-tile"><div class="stat-tile-label">Eventi</div><div class="stat-tile-value">${summary.events}</div></div>
      <div class="stat-tile"><div class="stat-tile-label">Giocatori</div><div class="stat-tile-value">${summary.uniquePlayers}</div></div>
      <div class="stat-tile"><div class="stat-tile-label">Presenza media</div><div class="stat-tile-value">${summary.avgPlayersPerEvent.toFixed(1)}</div></div>
      <div class="stat-tile"><div class="stat-tile-label">Partite giocate</div><div class="stat-tile-value">${summary.totalMatches}</div></div>
    </div>

    ${
      league.is_topdeck
        ? ""
        : standings.length === 0
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
}

// Nothing is currently in progress — point the visitor at the most recent
// leagues/Topdecks and standalone events instead of a dead end.
async function renderSuggestions(el) {
  const [leagues, standaloneEvents] = await Promise.all([Leagues.list(), Events.listStandalone()]);
  const recentLeagues = leagues.slice(0, 3);
  const recentStandalone = standaloneEvents.slice(0, 3);

  el.innerHTML = `
    <p class="page-empty">Nessuna lega o Topdeck attualmente in corso.</p>

    ${
      recentLeagues.length === 0
        ? ""
        : `
      <h2 style="margin-top:8px;">Ultime leghe</h2>
      <div class="entity-grid">
        ${recentLeagues
          .map(
            (l) => `
          <a class="entity-card" href="league.html?id=${l.id}">
            <div class="entity-card-title">${escapeHtml(l.name)}</div>
          </a>`
          )
          .join("")}
      </div>`
    }

    ${
      recentStandalone.length === 0
        ? ""
        : `
      <h2 style="margin-top:28px;">Ultimi eventi standalone</h2>
      <div class="entity-grid">
        ${recentStandalone
          .map(
            (ev) => `
          <a class="entity-card" href="event.html?id=${ev.id}">
            ${ev.name ? `<div class="entity-card-meta">${formatDate(ev.event_date)}</div>` : ""}
            <div class="entity-card-title">${escapeHtml(eventTitle(ev))}</div>
          </a>`
          )
          .join("")}
      </div>`
    }

    <p style="margin-top:28px;">Dai un'occhiata a tutte le <a href="leagues.html">leghe passate</a>.</p>
  `;
}

async function init() {
  const el = document.getElementById("current-league-content");

  try {
    const league = await Leagues.getOpen();
    if (league) {
      el.innerHTML = renderLeagueFeature(league, "Lega in corso", await loadLeagueFeature(league));
      return;
    }

    const topdeck = await Leagues.getOpenTopdeck();
    if (topdeck) {
      el.innerHTML = renderLeagueFeature(topdeck, "Topdeck in corso", await loadLeagueFeature(topdeck));
      return;
    }

    await renderSuggestions(el);
  } catch (err) {
    showError(el, err);
  }
}

init();
