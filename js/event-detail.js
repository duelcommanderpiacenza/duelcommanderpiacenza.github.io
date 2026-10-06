import { Events, EventEntries, Matches } from "./db.js";
import { computeEventLeaderboard, matchRoundOutcome, isBye, isDrop } from "./leaderboard.js";
import {
  escapeHtml,
  formatDate,
  eventTitle,
  playerLabel,
  commanderPairWithColors,
  archetypeBadge,
  showError,
} from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { resultsLink } from "./results-link.js";
import { initTitleFit } from "./page-title-fit.js";
import { historyPanelHtml, historyStatsHtml, historyPosHtml } from "./history-list.js";

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

function matchResultScore(m) {
  return `${m.player1_wins}-${m.player2_wins}-${m.draws}`;
}

const NO_LINK = { link: false };

// A player sub-card's title: the name, unlinked (the whole card links to the
// player's page); .history-name is where js/me-highlight.js puts "Tu".
function playerTitleHtml(player) {
  return `<span class="history-title"><span class="history-name">${playerLabel(player, NO_LINK)}</span></span>`;
}

// A sub-card linking to the player's page (a plain one without a player).
function playerCard(player, className, innerHtml) {
  return player?.id
    ? `<a class="history-item ${className}" href="player.html?id=${player.id}">${innerHtml}</a>`
    : `<article class="history-item ${className}">${innerHtml}</article>`;
}

// Partite: per round, a grid of small match cards — Giocatore 1 · score ·
// Giocatore 2, the winner in bold. Not links themselves (a match has two
// players): the names are, each to its player.
function matchCardHtml(m) {
  const special = isBye(m) ? "Bye" : isDrop(m) ? "Drop" : null;
  const outcome = special ? null : matchRoundOutcome(m);
  const side = (player, wins) =>
    `<span class="event-match-player${wins ? " is-winner" : ""}">${playerLabel(player)}</span>`;
  return `
          <article class="history-item event-match">
            ${side(m.player1, special === "Bye" || outcome === "player1")}
            <span class="event-match-score${special ? " is-special" : ""}">${special ?? matchResultScore(m)}</span>
            ${special ? '<span class="event-match-player history-muted">—</span>' : side(m.player2, outcome === "player2")}
          </article>`;
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
      ${historyPanelHtml(byRound.get(round).map(matchCardHtml).join(""), { scroll: false, className: "event-match-grid" })}`
    )
    .join("");
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("event-title");
  const metaEl = document.getElementById("event-meta");
  const resultsEl = document.getElementById("event-results");
  const entriesEl = document.getElementById("event-entries");
  const entriesCountEl = document.getElementById("event-entries-count");
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
    const resultsHtml = resultsLink(event.results_url, event.decklists_url);
    resultsEl.innerHTML = resultsHtml;
    resultsEl.hidden = !resultsHtml;
    initTitleFit(titleEl);
    metaEl.innerHTML = `${formatDate(event.event_date)}${
      event.league
        ? ` &middot; Lega: <a href="league.html?id=${event.league.id}">${escapeHtml(event.league.name)}</a>`
        : ""
    }`;

    // Nothing with no entries: the empty message below already says so.
    entriesCountEl.textContent =
      entries.length === 0 ? "" : `${entries.length} ${entries.length === 1 ? "partecipante" : "partecipanti"}`;
    // Giocatori: one sub-card per entry, linking to the player — the name,
    // the deck below, the archetype on the right. Alphabetical by player
    // name (a sorted copy — `entries` itself also feeds the standings below).
    entriesEl.innerHTML =
      entries.length === 0
        ? '<p class="page-empty">Nessun iscritto registrato.</p>'
        : historyPanelHtml(
            [...entries]
              .sort((a, b) => (a.player?.name ?? "").localeCompare(b.player?.name ?? "", "it"))
              .map((e) =>
                playerCard(
                  e.player,
                  "history-split",
                  `<div class="history-main">
                    ${playerTitleHtml(e.player)}
                    <span class="history-deck">${commanderPairWithColors(e.commander, e.partner_commander, NO_LINK)}</span>
                  </div>
                  ${archetypeBadge(e.archetype)}`
                )
              )
              .join(""),
            { scroll: false }
          );

    matchesEl.innerHTML = renderMatchesByRound(matches);

    const standings = computeEventLeaderboard(matches, entries);
    // Classifica: one sub-card per player, linking to them — position chip
    // and name, then Punti / V-S-P / Winrate.
    leaderboardEl.innerHTML =
      standings.length === 0
        ? '<p class="page-empty">Nessun dato per la classifica.</p>'
        : historyPanelHtml(
            standings
              .map((s, i) =>
                playerCard(
                  s.player,
                  "history-ranked",
                  `<div class="history-lead">
                    ${historyPosHtml(i + 1)}
                    <div class="history-main">${playerTitleHtml(s.player)}</div>
                  </div>
                  ${historyStatsHtml([
                    { label: "Punti", value: s.points, main: true },
                    { label: "V-S-P", value: `${s.wins}-${s.losses}-${s.draws}` },
                    { label: "Winrate", value: s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%` },
                  ])}`
                )
              )
              .join(""),
            { scroll: false }
          );
  } catch (err) {
    showError(document.getElementById("event-content"), err);
  } finally {
    hidePageLoading();
  }
}

init();
