import { Events, EventEntries, Matches } from "./db.js";
import { computeEventLeaderboard, isBye } from "./leaderboard.js";
import {
  escapeHtml,
  formatDate,
  eventTitle,
  playerLabel,
  commanderPairLabel,
  archetypeBadge,
  colorIdentityPips,
  showError,
} from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

function matchResultScore(m) {
  return `${m.player1_wins}-${m.player2_wins}-${m.draws}`;
}

function renderMatchesByRound(matches) {
  if (matches.length === 0) return '<p class="page-empty">Nessuna partita registrata.</p>';

  const byRound = new Map();
  for (const m of matches) {
    const round = m.round ?? 1;
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round).push(m);
  }

  return Array.from(byRound.keys())
    .sort((a, b) => a - b)
    .map(
      (round) => `
      <h3 style="margin:18px 0 10px;font-size:1.05rem;">Turno ${round}</h3>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Giocatore 1</th><th>Giocatore 2</th><th>Risultato</th></tr></thead>
        <tbody>
          ${byRound
            .get(round)
            .map(
              (m) => `
            <tr>
              <td>${playerLabel(m.player1)}</td>
              <td>${isBye(m) ? "Bye" : playerLabel(m.player2)}</td>
              <td>${isBye(m) ? "Bye" : matchResultScore(m)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table></div>`
    )
    .join("");
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("event-title");
  const metaEl = document.getElementById("event-meta");
  const entriesEl = document.getElementById("event-entries");
  const matchesEl = document.getElementById("event-matches");
  const leaderboardEl = document.getElementById("event-leaderboard");

  if (!id) {
    titleEl.textContent = "Evento non trovato";
    hidePageLoading();
    return;
  }

  try {
    const [event, entries, matches] = await Promise.all([
      Events.get(id),
      EventEntries.listByEvent(id),
      Matches.listByEvent(id),
    ]);

    titleEl.textContent = eventTitle(event);
    metaEl.innerHTML = `${formatDate(event.event_date)}${
      event.league
        ? ` &middot; Lega: <a href="league.html?id=${event.league.id}">${escapeHtml(event.league.name)}</a>`
        : ""
    }`;

    entriesEl.innerHTML =
      entries.length === 0
        ? '<p class="page-empty">Nessun iscritto registrato.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Giocatore</th><th>Commander</th><th>Identit&agrave; di colore</th><th>Archetipo</th></tr></thead>
            <tbody>
              ${entries
                .map(
                  (e) => `
                <tr>
                  <td>${playerLabel(e.player)}</td>
                  <td>${commanderPairLabel(e.commander, e.partner_commander)}</td>
                  <td>${colorIdentityPips(
                    (e.commander?.color_identity ?? "") + (e.partner_commander?.color_identity ?? "")
                  )}</td>
                  <td>${archetypeBadge(e.archetype)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`;

    matchesEl.innerHTML = renderMatchesByRound(matches);

    const standings = computeEventLeaderboard(matches, entries);
    leaderboardEl.innerHTML =
      standings.length === 0
        ? '<p class="page-empty">Nessun dato per la classifica.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>#</th><th>Giocatore</th><th>Punti</th><th>V</th><th>S</th><th>P</th><th>Winrate</th></tr></thead>
            <tbody>
              ${standings
                .map(
                  (s, i) => `
                <tr>
                  <td class="rank-cell">${i + 1}</td>
                  <td>${playerLabel(s.player)}</td>
                  <td><strong>${s.points}</strong></td>
                  <td>${s.wins}</td>
                  <td>${s.losses}</td>
                  <td>${s.draws}</td>
                  <td>${s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%`}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`;
  } catch (err) {
    showError(document.getElementById("event-content"), err);
  } finally {
    hidePageLoading();
  }
}

init();
