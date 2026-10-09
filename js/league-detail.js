import { Leagues, Events, fetchEventsResults } from "./db.js";
import { compareLeagueStandings, computeLeaguePoints } from "./leaderboard.js";
import { fetchPlayerBadgesRenderer } from "./player-badges.js";
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
import { initTitleFit } from "./page-title-fit.js";
import { historyPanelHtml, historyStatsHtml, historyPosHtml } from "./history-list.js";
import { createArtPainter } from "./player-card.js";
import { initFollowButton } from "./follow-button.js";

// How many leaderboard rows get the "top 8" highlight (styles.css .is-top8).
const LEAGUE_TOP_HIGHLIGHT = 8;

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

// Local-time YYYY-MM-DD, directly comparable with an event_date string.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "12 set 2026 – 30 nov 2026": first event's date to the last one's once the
// league is closed; "– oggi" while it's still running (the title's own
// "In corso" badge already says it's open, so this doesn't repeat it);
// "Inizia il 12 set 2026" when even the first event hasn't happened yet. ""
// when no event has a date yet — the subtitle is then hidden entirely.
function leagueDateRange(league, events) {
  const dates = events.map((ev) => ev.event_date).filter(Boolean).sort();
  if (dates.length === 0) return "";
  const start = formatDate(dates[0]);
  if (dates[0] > todayIso()) return `Inizia il ${start}`;
  if (league.is_open) return `${start} – oggi`;
  const end = formatDate(dates[dates.length - 1]);
  return start === end ? start : `${start} – ${end}`;
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
      // A tie that survives every tiebreaker is shown as a shared win
      // rather than settled alphabetically.
      const topPoints = standings[0].points;
      const winners = standings.filter((s) => compareLeagueStandings(s, standings[0]) === 0);
      tiles.push(
        wrappedTile("Vincitore", winners.map((s) => playerLabel(s.player)).join("<br>"), `${topPoints} punti`)
      );
    }
  }

  // One row per (tied) player, the winrate beside each name; the V-S-P only
  // for a single winner (tied players can share a winrate with different
  // records — see js/stats.js's computeLeagueWrapped).
  const bw = wrapped.bestWinrate;
  tiles.push(
    bw
      ? wrappedTile(
          "Miglior winrate",
          `<ul class="wrapped-rank-list">${bw.players
            .map(
              (p) => `<li>
                <span class="wrapped-rank-name">${playerLabel(p)}</span>
                <span class="wrapped-rank-value">${bw.winRate.toFixed(1)}%</span>
              </li>`
            )
            .join("")}</ul>`,
          bw.players.length === 1 ? `${bw.wins}-${bw.losses}-${bw.draws}` : ""
        )
      : wrappedTile("Miglior winrate", EMPTY_VALUE)
  );

  const ta = wrapped.topArchetype;
  tiles.push(
    ta
      ? wrappedTile("Archetipo più giocato", archetypeBadge(ta.archetype))
      : wrappedTile("Archetipo più giocato", EMPTY_VALUE)
  );

  tiles.push(
    wrapped.topCommanders.length > 0
      ? wrappedTile(
          "Comandanti più giocati",
          `<ul class="wrapped-rank-list">${wrapped.topCommanders
            .map(
              (c) => `<li>
                <span class="wrapped-rank-name">${commanderPairLabel(c.commander, c.partner)}</span>
                <span class="wrapped-rank-value">${c.entries}</span>
              </li>`
            )
            .join("")}</ul>`
        )
      : wrappedTile("Comandanti più giocati", EMPTY_VALUE)
  );

  return tiles.join("");
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("league-title");
  const statusEl = document.getElementById("league-status");
  const datesEl = document.getElementById("league-dates");
  const statsEl = document.getElementById("league-stats");
  const wrappedEl = document.getElementById("league-wrapped");
  const eventsEl = document.getElementById("league-events");
  const leaderboardSectionEl = document.getElementById("league-leaderboard-section");
  const leaderboardEl = document.getElementById("league-leaderboard");

  // The ★ on the hero's edge, for signed-in accounts (not awaited: it never
  // holds up the page).
  if (id) initFollowButton(titleEl, "league", id);

  if (!id) {
    titleEl.textContent = "Lega non trovata";
    hidePageLoading();
    return;
  }

  try {
    const league = await Leagues.get(id);
    titleEl.textContent = league.name;
    statusEl.innerHTML = leagueStatusBadge(league.is_open);
    statusEl.hidden = false;
    initTitleFit(titleEl);

    // A Topdeck series is just a bucket of events, with no points leaderboard.
    if (league.is_topdeck) leaderboardSectionEl.hidden = true;
    // Started now, awaited only right before the leaderboard renders, so it
    // loads alongside the league's events rather than after them.
    const badgesPromise = league.is_topdeck ? null : fetchPlayerBadgesRenderer();

    // A still-open (including future) event isn't published yet — it has no
    // entries/matches for RLS to even hand back, and would otherwise inflate
    // this league's own event count/grid before anything's actually happened.
    const allEvents = await Events.listByLeague(id);
    const events = allEvents.filter((ev) => !ev.is_open);

    // Date range under the title — from every event the league has, open
    // ones included (unlike everything else on this page).
    const dateRange = leagueDateRange(league, allEvents);
    datesEl.textContent = dateRange;
    datesEl.hidden = !dateRange;

    if (events.length === 0) {
      eventsEl.innerHTML = '<p class="page-empty">Nessun evento associato a questa lega.</p>';
      leaderboardEl.innerHTML = '<p class="page-empty">Nessun dato per la classifica.</p>';
      return;
    }

    eventsEl.innerHTML = `<div class="entity-grid">${events
      .map(
        (ev) => `
      <a class="entity-card" href="event.html?id=${ev.id}">
        <div class="entity-card-title">${escapeHtml(eventTitle(ev))}</div>
        ${ev.name ? `<div class="entity-card-meta">${formatDate(ev.event_date)}</div>` : ""}
      </a>`
      )
      .join("")}</div>`;

    const [eventsData, scheduledEvents] = await Promise.all([
      fetchEventsResults(events.map((ev) => ev.id)),
      Leagues.eventCount(id, allEvents.length),
    ]);

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
    // Full-attendance bonus only once the league is closed; the best-results
    // cap counts every event the league has, open ones included, even those
    // hidden from visitors (computeLeaguePoints, Leagues.eventCount).
    const standings = computeLeaguePoints(eventsData, {
      leagueClosed: !league.is_open,
      scheduledEvents,
    });
    const wrapped = computeLeagueWrapped(eventsData, standings);
    wrappedEl.innerHTML = renderWrapped(league, standings, wrapped, events.length);
    // Too few events means no highlight tiles at all — the grid stays hidden
    // rather than leave a gap below the numbers.
    wrappedEl.hidden = wrappedEl.innerHTML === "";
    // The hero's backdrop (styles.css .profile-hero-art): the league's most
    // played commander's art (the hero's own reds alone without one).
    createArtPainter(document.getElementById("league-hero-art"))(wrapped.topCommanders[0]?.commander?.name ?? null);

    if (league.is_topdeck) return;

    const badgesFor = await badgesPromise;
    // One sub-card per player (js/history-list.js), the whole card a link to
    // the player's page: position chip, name + badges, then Punti / V-S-P /
    // Winrate / Eventi. The top LEAGUE_TOP_HIGHLIGHT get a red edge and tint
    // (styles.css .history-item.is-top8).
    leaderboardEl.innerHTML =
      standings.length === 0
        ? '<p class="page-empty">Nessun dato per la classifica.</p>'
        : historyPanelHtml(
            standings
              .map((s, i) => {
                const inner = `
                <div class="history-lead">
                  ${historyPosHtml(i + 1)}
                  <div class="history-main">
                    <span class="history-title"><span class="history-name">${playerLabel(s.player, { link: false })}</span>${badgesFor(s.player)}</span>
                  </div>
                </div>
                ${historyStatsHtml([
                  { label: "Punti", value: s.points, main: true },
                  { label: "V-S-P", value: `${s.wins}-${s.losses}-${s.draws}` },
                  { label: "Winrate", value: s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%` },
                  { label: "Eventi", value: s.eventsPlayed },
                ])}`;
                const cls = `history-item history-ranked${i < LEAGUE_TOP_HIGHLIGHT ? " is-top8" : ""}`;
                return s.player?.id
                  ? `<a class="${cls}" href="player.html?id=${s.player.id}">${inner}</a>`
                  : `<article class="${cls}">${inner}</article>`;
              })
              .join(""),
            { scroll: false }
          );
  } catch (err) {
    showError(document.getElementById("league-content"), err);
  } finally {
    hidePageLoading();
  }
}

init();
