import { Leagues, Events, EventEntries, Matches } from "./db.js";
import { computeLeaguePoints } from "./leaderboard.js";
import { computeLeagueSummary, computeLeagueWrapped } from "./stats.js";
import {
  escapeHtml,
  formatDate,
  eventTitle,
  leagueStatusBadge,
  playerLabel,
  commanderPairLabel,
  archetypeBadge,
  showError,
} from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

function wrappedTile(label, valueHtml, detail = "") {
  return `<div class="stat-tile wrapped-tile">
    <div class="stat-tile-label">${label}</div>
    <div class="wrapped-tile-value">${valueHtml}</div>
    ${detail ? `<div class="wrapped-tile-detail">${detail}</div>` : ""}
  </div>`;
}

const EMPTY_VALUE = '<span class="wrapped-tile-empty">—</span>';

// Highlights from a single event just repeat that event's own results —
// only worth showing across several.
const WRAPPED_MIN_EVENTS = 2;

function renderWrapped(league, standings, wrapped, eventCount) {
  if (eventCount < WRAPPED_MIN_EVENTS) return "";

  const tiles = [];

  // A Topdeck series has no points leaderboard, so no winner either.
  if (!league.is_topdeck) {
    if (league.is_open) {
      tiles.push(wrappedTile("Vincitore", '<span class="wrapped-tile-empty">Lega in corso</span>'));
    } else if (standings.length === 0) {
      tiles.push(wrappedTile("Vincitore", EMPTY_VALUE));
    } else {
      // League points have no tiebreaker, so a tie on top points is shown
      // as a shared win rather than settled alphabetically.
      const topPoints = standings[0].points;
      const winners = standings.filter((s) => s.points === topPoints);
      tiles.push(
        wrappedTile("Vincitore", winners.map((s) => playerLabel(s.player)).join("<br>"), `${topPoints} punti`)
      );
    }
  }

  const bw = wrapped.bestWinrate;
  tiles.push(
    bw
      ? wrappedTile(
          "Miglior winrate",
          bw.players.map(playerLabel).join("<br>"),
          bw.players.length === 1
            ? `${bw.winRate.toFixed(1)}% · ${bw.wins}-${bw.losses}-${bw.draws}`
            : `${bw.winRate.toFixed(1)}%`
        )
      : wrappedTile("Miglior winrate", EMPTY_VALUE)
  );

  const ta = wrapped.topArchetype;
  tiles.push(
    ta
      ? wrappedTile(
          "Archetipo più usato",
          archetypeBadge(ta.archetype),
          `${ta.entries} ${ta.entries === 1 ? "presenza" : "presenze"} · ${ta.wins} ${ta.wins === 1 ? "vittoria" : "vittorie"}`
        )
      : wrappedTile("Archetipo più usato", EMPTY_VALUE)
  );

  tiles.push(
    wrapped.topCommanders.length > 0
      ? wrappedTile(
          "Comandanti più usati",
          `<ol class="wrapped-rank-list">${wrapped.topCommanders
            .map(
              (c) => `<li>
                <span class="wrapped-rank-name">${commanderPairLabel(c.commander, c.partner)}</span>
                <span class="wrapped-rank-count">${c.entries}</span>
              </li>`
            )
            .join("")}</ol>`
        )
      : wrappedTile("Comandanti più usati", EMPTY_VALUE)
  );

  return tiles.join("");
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("league-title");
  const statsEl = document.getElementById("league-stats");
  const wrappedSectionEl = document.getElementById("league-wrapped-section");
  const wrappedEl = document.getElementById("league-wrapped");
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
      wrappedSectionEl.hidden = true;
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

    // Computed for Topdeck series too (no leaderboard shown for those) —
    // Wrapped's best-winrate tile reads its per-player records.
    const standings = computeLeaguePoints(eventsData);
    wrappedEl.innerHTML = renderWrapped(league, standings, computeLeagueWrapped(eventsData, standings), events.length);
    // Too few events means no highlight tiles at all — hide the empty grid
    // rather than leave a gap below the summary tiles.
    wrappedEl.hidden = wrappedEl.innerHTML === "";

    if (league.is_topdeck) return;

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
