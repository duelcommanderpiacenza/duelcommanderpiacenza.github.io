import { Leagues, Events, EventEntries, Matches } from "./db.js";
import { computeLeaguePoints } from "./leaderboard.js";
import { computeLeagueSummary } from "./stats.js";
import { escapeHtml, formatDate, eventTitle, leagueStatusBadge, playerLabel, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("league-title");
  const statsEl = document.getElementById("league-stats");
  const eventsEl = document.getElementById("league-events");
  const leaderboardSectionEl = document.getElementById("league-leaderboard-section");
  const leaderboardEl = document.getElementById("league-leaderboard");

  if (!id) {
    titleEl.textContent = "Lega non trovata";
    hidePageLoading();
    return;
  }

  try {
    const league = await Leagues.get(id);
    titleEl.innerHTML = `${escapeHtml(league.name)} ${leagueStatusBadge(league.is_open)}`;

    // A Topdeck series is just a bucket of events, with no points leaderboard.
    if (league.is_topdeck) leaderboardSectionEl.hidden = true;

    // A still-open (including future) event isn't published yet — it has no
    // entries/matches for RLS to even hand back, and would otherwise inflate
    // this league's own event count/grid before anything's actually happened.
    const events = (await Events.listByLeague(id)).filter((ev) => !ev.is_open);

    if (events.length === 0) {
      statsEl.innerHTML = "";
      eventsEl.innerHTML = '<p class="page-empty">Nessun evento associato a questa lega.</p>';
      leaderboardEl.innerHTML = '<p class="page-empty">Nessun dato per la classifica.</p>';
      return;
    }

    eventsEl.innerHTML = `<div class="entity-grid">${events
      .map(
        (ev) => `
      <a class="entity-card" href="event.html?id=${ev.id}">
        ${ev.name ? `<div class="entity-card-meta">${formatDate(ev.event_date)}</div>` : ""}
        <div class="entity-card-title">${escapeHtml(eventTitle(ev))}</div>
      </a>`
      )
      .join("")}</div>`;

    const eventsData = await Promise.all(
      events.map(async (ev) => {
        const [entries, matches] = await Promise.all([
          EventEntries.listByEvent(ev.id),
          Matches.listByEvent(ev.id),
        ]);
        return { entries, matches };
      })
    );

    const summary = computeLeagueSummary(eventsData);
    statsEl.innerHTML = [
      ["Eventi", summary.events],
      ["Giocatori", summary.uniquePlayers],
      ["Presenza media", summary.avgPlayersPerEvent.toFixed(1)],
      ["Partite giocate", summary.totalMatches],
    ]
      .map(
        ([label, value]) =>
          `<div class="stat-tile"><div class="stat-tile-label">${label}</div><div class="stat-tile-value">${value}</div></div>`
      )
      .join("");

    if (league.is_topdeck) return;

    const standings = computeLeaguePoints(eventsData);

    leaderboardEl.innerHTML =
      standings.length === 0
        ? '<p class="page-empty">Nessun dato per la classifica.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>#</th><th>Giocatore</th><th>Punti</th><th>V-S-P</th><th>Winrate</th><th>Eventi giocati</th><th>Presenza completa</th></tr></thead>
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
                  <td>${s.fullAttendance ? "✓ +5 PUNTI" : "—"}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`;
  } catch (err) {
    showError(document.getElementById("league-content"), err);
  } finally {
    hidePageLoading();
  }
}

init();
