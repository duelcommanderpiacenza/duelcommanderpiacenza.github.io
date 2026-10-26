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
import { hidePageLoading, sectionLoadingHtml, statTilesLoadingHtml } from "./page-loading.js";
import { nestedResultsMenu } from "./results-link.js";
import { openEventRecap } from "./event-recap.js";
import { initTitleFit } from "./page-title-fit.js";
import { historyPanelHtml, historyStatsHtml, historyPosHtml } from "./history-list.js";
import { createArtPainter } from "./player-card.js";
import { initTabs } from "./tabs.js";
import { renderMetaCharts } from "./meta-charts.js";

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

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
export async function mount({ signal = new AbortController().signal } = {}) {
  const id = getId();
  const titleEl = document.getElementById("event-title");
  const metaEl = document.getElementById("event-meta");
  const resultsEl = document.getElementById("event-results");
  const entriesEl = document.getElementById("event-entries");
  const matchesEl = document.getElementById("event-matches");
  const leaderboardEl = document.getElementById("event-leaderboard");
  const statsEl = document.getElementById("event-stats");
  const metaChartsEl = document.getElementById("event-meta-charts");

  // Giocatori / Classifica / Partite / Meta: one panel at a time, Giocatori first.
  initTabs(document.querySelector(".event-tabs"));

  if (!id) {
    titleEl.textContent = "Evento non trovato";
    hidePageLoading(signal);
    return;
  }

  try {
    // All three at once; the page is shown once the event and its entries
    // are in (Giocatori, the first tab, and Meta need nothing else) — the
    // matches (Classifica, Partite, the hero's art and its Turni / Partite)
    // shimmer until they're in too, unless they're already there by then.
    // The no-op catch only marks the matches request as handled, should
    // another fail first; awaiting it below still throws.
    const matchesRequest = Matches.listByEvent(id);
    let matchesReady = false;
    matchesRequest.then(() => (matchesReady = true), () => {});
    const [event, entries] = await Promise.all([Events.get(id), EventEntries.listByEvent(id)]);
    if (signal.aborted) return;

    titleEl.textContent = eventTitle(event);
    document.title = `${eventTitle(event)} - Duel Commander Piacenza`;
    // A shared recap link (js/event-recap.js "Condividi il recap"):
    // event.html?id=…&recap=1 opens the event's recap straight away.
    if (!event.is_open && new URLSearchParams(location.search).get("recap") === "1") openEventRecap(id);
    const resultsHtml = nestedResultsMenu(event.results_url, event.decklists_url);
    resultsEl.innerHTML = resultsHtml;
    resultsEl.hidden = !resultsHtml;
    // The hero's buttons: "Recap" for a played event with entrants, "Liste"
    // beside it (above).
    const recapBtn = document.getElementById("event-recap");
    recapBtn.hidden = event.is_open || entries.length === 0;
    recapBtn.onclick = () => openEventRecap(id);
    document.getElementById("event-actions").hidden = recapBtn.hidden && resultsEl.hidden;
    initTitleFit(titleEl, { signal });
    metaEl.innerHTML = `${formatDate(event.event_date)}${
      event.league
        ? ` &middot; <a href="league.html?id=${event.league.id}">${escapeHtml(event.league.name)}</a>`
        : ""
    }`;

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

    renderMetaCharts(metaChartsEl, document.getElementById("event-meta-card"), entries);

    const decks = new Set(entries.filter((e) => e.commander_id).map((e) => `${e.commander_id}_${e.partner_commander_id ?? ""}`));
    if (!matchesReady) {
      statsEl.innerHTML = statTilesLoadingHtml(["Giocatori", "Turni", "Partite", "Comandanti"]);
      const [playersTile, , , decksTile] = statsEl.querySelectorAll(".stat-tile-value");
      playersTile.textContent = entries.length;
      decksTile.textContent = decks.size;
      leaderboardEl.innerHTML = sectionLoadingHtml(6);
      matchesEl.innerHTML = sectionLoadingHtml(4);
      hidePageLoading(signal);
    }

    const matches = await matchesRequest;
    if (signal.aborted) return;
    matchesEl.innerHTML = renderMatchesByRound(matches);
    const standings = computeEventLeaderboard(matches, entries);

    // The hero: the numbers, and the winner's (first in the standings)
    // commander as the backdrop — else the most played one (none: the
    // hero's own reds).
    const winner = standings[0]?.player ?? null;
    const winnerEntry = winner ? entries.find((e) => e.player_id === winner.id) : null;
    const realMatches = matches.filter((m) => !isBye(m) && !isDrop(m));
    const rounds = new Set(matches.map((m) => m.round ?? 1)).size;
    statsEl.innerHTML = [
      ["Giocatori", entries.length],
      ["Turni", rounds],
      ["Partite", realMatches.length],
      ["Comandanti", decks.size],
    ]
      .map(
        ([label, value]) =>
          `<div class="stat-tile"><div class="stat-tile-label">${label}</div><div class="stat-tile-value">${value}</div></div>`
      )
      .join("");
    const usage = new Map();
    for (const e of entries) if (e.commander?.name) usage.set(e.commander.name, (usage.get(e.commander.name) ?? 0) + 1);
    const mostPlayed = [...usage].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    createArtPainter(document.getElementById("event-hero-art"))(winnerEntry?.commander?.name ?? mostPlayed);
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
    hidePageLoading(signal);
  }
}
