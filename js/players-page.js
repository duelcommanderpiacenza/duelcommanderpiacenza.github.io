import { Players, Events, Leagues, fetchEventsResults } from "./db.js";
import { matchRoundOutcome, isBye, isDrop } from "./leaderboard.js";
import { initScopeFilter } from "./scope-filter.js";
import { fetchTopAutoBadgesByPlayer, playerBadgesHtml } from "./player-badges.js";
import { escapeHtml, showError, softFail, isoDateYearsAgo, DEFAULT_DATE_FROM_YEARS } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initFilterToggle } from "./filter-toggle.js";
import { historyPanelHtml, historyStatsHtml, winrateTrendHtml, latestPresence } from "./history-list.js";
import { initBackToTop } from "./back-to-top.js";

// One sub-card per player (js/history-list.js), the whole card a link to
// the player's page: name + badges (on touch screens the badges at the
// row's right end, on the name's first line — styles.css
// .players-row-title), the numbers on the right.
function renderRow(r) {
  return `
    <a class="history-item history-ranked" href="player.html?id=${r.id}">
      <div class="history-main">
        <span class="history-title players-row-title"><span class="history-name">${r.nameHtml}</span><span class="players-row-badges">${r.badgesHtml}</span></span>
      </div>
      ${historyStatsHtml([
        { label: "Eventi", value: r.eventsPlayed },
        { label: "Winrate", value: `${r.rate}${winrateTrendHtml(r.winRate, r.winRateBefore, r.inLatest)}`, main: true, trend: true },
      ])}
    </a>`;
}

// Entries + matches of every event in scope, batched (js/db.js) rather than
// two requests per event — "Tutte le leghe" spans the whole history. Slim:
// the records are counted by player id alone (names come from Players.list).
function fetchEventsData(eventIds) {
  return fetchEventsResults(eventIds, { slim: true });
}

// Each player's match record (wins / draws / losses) over `eventsData`: a
// bye a win, a drop nothing at all.
function playerRecords(eventsData) {
  const recordByPlayer = new Map();
  function ensureRecord(id) {
    if (!recordByPlayer.has(id)) {
      recordByPlayer.set(id, { wins: 0, draws: 0, losses: 0 });
    }
    return recordByPlayer.get(id);
  }
  for (const { matches } of eventsData) {
    for (const m of matches) {
      // A drop isn't a win, a loss, or a match played — it never
      // touches either player's record.
      if (isDrop(m)) continue;
      const r1 = ensureRecord(m.player1_id);
      if (isBye(m)) {
        // A bye has no player2 to also credit/debit — a plain win for
        // player1, nothing further to process for this match.
        r1.wins += 1;
        continue;
      }
      const r2 = ensureRecord(m.player2_id);
      const outcome = matchRoundOutcome(m);
      if (outcome === "player1") {
        r1.wins += 1;
        r2.losses += 1;
      } else if (outcome === "player2") {
        r2.wins += 1;
        r1.losses += 1;
      } else {
        r1.draws += 1;
        r2.draws += 1;
      }
    }
  }
  return recordByPlayer;
}

// Highest value first; a null winRate (no games played) always sorts last
// rather than tying with an actual 0%.
// "Ordina per": the numbers each card shows (since 2026-10-30 — Vittorie,
// not on the cards, dropped).
const SORTERS = {
  events: (a, b) => b.eventsPlayed - a.eventsPlayed,
  winrate: (a, b) => (b.winRate ?? -1) - (a.winRate ?? -1),
};

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
export async function mount({ signal = new AbortController().signal } = {}) {
  const listEl = document.getElementById("players-list");
  const searchInput = document.getElementById("players-search");
  const leagueSelect = document.getElementById("players-league-filter");
  const eventSelect = document.getElementById("players-event-filter");
  const dateFromInput = document.getElementById("players-date-from");
  const sortSelect = document.getElementById("players-sort");
  // A long list: a round button back to the top once scrolled down.
  initBackToTop({ signal });

  let allPlayers = [];
  let eventDateById = new Map();
  let lastScopeEventIds = [];
  let lastRows = [];
  // Auto-badge rules are absolute ("the current league", "the last 3
  // months"), not scoped to whatever this page's own filters are set to —
  // read once, globally, rather than re-fetched on every filter change.
  let autoBadgesByPlayer = new Map();
  // The filters' leagues and events (js/scope-filter.js), loaded with the rest.
  let allLeagues = [];
  let allEvents = [];

  // Everything before the stats in one round: the players, the events
  // (dates; the filters' list too), the leagues and the automatic badges.
  try {
    const [players, events, leagues, autoBadges] = await Promise.all([
      Players.list(),
      Events.list(),
      Leagues.list(),
      // Not fatal if this fails — the page still works with just the
      // manually assigned badges.
      softFail(fetchTopAutoBadgesByPlayer(), new Map()),
    ]);
    if (signal.aborted) return;
    if (players.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun giocatore inserito ancora.</p>';
      hidePageLoading(signal);
      return;
    }
    allPlayers = players;
    allLeagues = leagues;
    allEvents = events;
    autoBadgesByPlayer = autoBadges;
    eventDateById = new Map(events.map((e) => [e.id, e.event_date]));
  } catch (err) {
    showError(listEl, err);
    hidePageLoading(signal);
    return;
  }

  // The date filter narrows whichever event ids the league/event scope
  // filter last reported, rather than replacing it — the two combine.
  function effectiveEventIds() {
    const from = dateFromInput.value;
    if (!from) return lastScopeEventIds;
    return lastScopeEventIds.filter((id) => {
      const d = eventDateById.get(id);
      return d && d >= from;
    });
  }

  // The search box only re-filters the already-computed rows (no new
  // network/stat work), so it can react live on every keystroke. Players
  // with no events in the current scope are always dropped, filtered or
  // not — an empty "—" row isn't useful either way.
  function renderList(animate = true) {
    const term = searchInput.value.trim().toLowerCase();
    const base = lastRows.filter((r) => r.eventsPlayed > 0);
    // Players with data in the filters' scope (Lega/Evento/Dal), in the
    // search box's placeholder (like Comandanti's) — the search doesn't
    // change it, it only looks within them.
    searchInput.placeholder = `Cerca tra ${base.length} ${base.length === 1 ? "giocatore" : "giocatori"}…`;
    const filtered = term ? base.filter((r) => r.searchText.includes(term)) : base;
    const sorter = SORTERS[sortSelect.value] ?? SORTERS.events;
    const visible = [...filtered].sort((a, b) => sorter(a, b) || a.nameHtml.localeCompare(b.nameHtml));
    listEl.innerHTML =
      visible.length === 0
        ? `<p class="page-empty">${term ? "Nessun giocatore corrisponde alla ricerca." : "Nessun giocatore ha ancora dati registrati."}</p>`
        : historyPanelHtml(visible.map(renderRow).join(""), { animate, scroll: false });
  }

  async function render(eventIds) {
    listEl.innerHTML = '<p class="page-loading">Caricamento...</p>';
    try {
      const eventsData = await fetchEventsData(eventIds);

      const entriesByPlayer = new Map();
      for (const { entries } of eventsData) {
        for (const e of entries) {
          if (!entriesByPlayer.has(e.player_id)) entriesByPlayer.set(e.player_id, []);
          entriesByPlayer.get(e.player_id).push(e);
        }
      }

      const recordByPlayer = playerRecords(eventsData);
      // The trend arrow: the winrate before the player's own latest event in
      // scope — the whole record minus that event's.
      const latestOf = latestPresence(eventIds, eventsData, eventDateById, (d) => d.entries.map((e) => e.player_id));
      const recordsPerEvent = eventsData.map((d) => playerRecords([d]));
      const rateOf = (record) => {
        const played = record ? record.wins + record.draws + record.losses : 0;
        return played > 0 ? (record.wins / played) * 100 : null;
      };
      const rateBefore = (id) => {
        const i = latestOf.get(id);
        const all = recordByPlayer.get(id);
        if (i === undefined || !all) return null;
        const ev = recordsPerEvent[i].get(id) ?? { wins: 0, draws: 0, losses: 0 };
        return rateOf({ wins: all.wins - ev.wins, draws: all.draws - ev.draws, losses: all.losses - ev.losses });
      };

      lastRows = allPlayers.map((p) => {
        const playerEntries = entriesByPlayer.get(p.id) ?? [];
        const eventsPlayed = new Set(playerEntries.map((e) => e.event_id)).size;
        const record = recordByPlayer.get(p.id) ?? { wins: 0, draws: 0, losses: 0 };
        const played = record.wins + record.draws + record.losses;
        const winRate = played > 0 ? (record.wins / played) * 100 : null;
        return {
          id: p.id,
          searchText: `${p.name} ${p.handle ?? ""}`.toLowerCase(),
          nameHtml: p.handle ? `${escapeHtml(p.name)} (${escapeHtml(p.handle)})` : escapeHtml(p.name),
          badgesHtml: playerBadgesHtml(p, autoBadgesByPlayer),
          eventsPlayed,
          wins: record.wins,
          draws: record.draws,
          losses: record.losses,
          winRate,
          winRateBefore: rateBefore(p.id),
          inLatest: latestOf.has(p.id),
          rate: winRate === null ? "—" : `${winRate.toFixed(1)}%`,
        };
      });

      renderList();
    } catch (err) {
      showError(listEl, err);
    } finally {
      hidePageLoading(signal);
    }
  }

  // Default "Dal": the last DEFAULT_DATE_FROM_YEARS years (js/ui.js) — set before the
  // first load, so that load already fetches only that window.
  dateFromInput.value = isoDateYearsAgo(DEFAULT_DATE_FROM_YEARS);
  initFilterToggle("players-filter-toggle", "players-filter-panel");

  searchInput.addEventListener("input", () => renderList(false));
  sortSelect.addEventListener("change", () => renderList());
  dateFromInput.addEventListener("change", () => render(effectiveEventIds()));

  initScopeFilter({
    leagueSelect,
    eventSelect,
    leagues: allLeagues,
    events: allEvents,
    onChange: (eventIds) => {
      lastScopeEventIds = eventIds;
      render(effectiveEventIds());
    },
  });
}
