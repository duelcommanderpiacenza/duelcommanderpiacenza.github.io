import { Players, Events, EventEntries, Matches } from "./db.js";
import { matchRoundOutcome, isBye } from "./leaderboard.js";
import { initScopeFilter } from "./scope-filter.js";
import { computeAutoBadgeAssignments } from "./auto-badges.js";
import { escapeHtml, commanderPairLabel, colorIdentityPips, showError } from "./ui.js";

// Keyed by the commander+partner pair, not just the primary commander, so
// "Thrasios / Tymna" and "Thrasios / Vial Smasher" count as different decks.
function mostUsedCommander(entries) {
  const counts = new Map(); // "commanderId_partnerId" -> { commander, partner, count }
  for (const e of entries) {
    if (!e.commander) continue;
    const key = `${e.commander.id}_${e.partner_commander?.id ?? ""}`;
    if (!counts.has(key)) counts.set(key, { commander: e.commander, partner: e.partner_commander ?? null, count: 0 });
    counts.get(key).count += 1;
  }
  let best = null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count || (v.count === best.count && v.commander.name.localeCompare(best.commander.name) < 0)) {
      best = v;
    }
  }
  return best;
}

// Up to 2 manually assigned badges plus up to 2 auto-assigned ones (see
// js/auto-badges.js), for up to 4 total. Hover/focus shows the badge's own
// name as a custom tooltip (styles.css) — a native `title` attribute can't
// be restyled by any browser, so this builds one from scratch instead, fed
// by data-tooltip and kept accessible via aria-label. Kept as a sibling of
// the name link (not nested inside it) so hovering/clicking a badge icon
// doesn't behave like part of the player-page link.
function playerBadgesHtml(p, autoBadgesByPlayer) {
  const badges = [p.badge1, p.badge2, ...(autoBadgesByPlayer.get(p.id) ?? [])].filter(Boolean);
  return badges
    .map(
      (b) =>
        `<span class="icon-badge" data-tooltip="${escapeHtml(b.name)}" aria-label="${escapeHtml(b.name)}" tabindex="0">${b.icon}</span>`
    )
    .join("");
}

function renderRow(r) {
  return `
    <tr>
      <td><a href="player.html?id=${r.id}">${r.nameHtml}</a>${r.badgesHtml}</td>
      <td>${r.eventsPlayed}</td>
      <td>${r.wins}-${r.losses}-${r.draws}</td>
      <td>${r.rate}</td>
      <td>${r.topCommanderHtml}</td>
    </tr>`;
}

async function fetchEventsData(eventIds) {
  return Promise.all(
    eventIds.map(async (id) => {
      const [entries, matches] = await Promise.all([EventEntries.listByEvent(id), Matches.listByEvent(id)]);
      return { entries, matches };
    })
  );
}

// Highest value first; a null winRate (no games played) always sorts last
// rather than tying with an actual 0%.
const SORTERS = {
  events: (a, b) => b.eventsPlayed - a.eventsPlayed,
  winrate: (a, b) => (b.winRate ?? -1) - (a.winRate ?? -1),
  wins: (a, b) => b.wins - a.wins,
};

async function init() {
  const listEl = document.getElementById("players-list");
  const searchInput = document.getElementById("players-search");
  const leagueSelect = document.getElementById("players-league-filter");
  const eventSelect = document.getElementById("players-event-filter");
  const dateFromInput = document.getElementById("players-date-from");
  const sortSelect = document.getElementById("players-sort");

  let allPlayers = [];
  let eventDateById = new Map();
  let lastScopeEventIds = [];
  let lastRows = [];
  // Auto-badge rules are absolute ("the current league", "the last 3
  // months"), not scoped to whatever this page's own filters are set to —
  // computed once, globally, rather than re-run on every filter change.
  let autoBadgesByPlayer = new Map();

  try {
    const [players, events] = await Promise.all([Players.list(), Events.list()]);
    if (players.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun giocatore inserito ancora.</p>';
      return;
    }
    allPlayers = players;
    eventDateById = new Map(events.map((e) => [e.id, e.event_date]));
  } catch (err) {
    showError(listEl, err);
    return;
  }

  // Not fatal if this fails — the page still works with just the manually
  // assigned badges, so it's kept out of the critical try/catch above.
  try {
    autoBadgesByPlayer = await computeAutoBadgeAssignments();
  } catch (err) {
    console.error(err);
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
  function renderList() {
    const term = searchInput.value.trim().toLowerCase();
    const base = lastRows.filter((r) => r.eventsPlayed > 0);
    const filtered = term ? base.filter((r) => r.searchText.includes(term)) : base;
    const sorter = SORTERS[sortSelect.value] ?? SORTERS.events;
    const visible = [...filtered].sort((a, b) => sorter(a, b) || a.nameHtml.localeCompare(b.nameHtml));
    listEl.innerHTML =
      visible.length === 0
        ? `<p class="page-empty">${term ? "Nessun giocatore corrisponde alla ricerca." : "Nessun giocatore ha ancora dati registrati."}</p>`
        : `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Giocatore</th><th>Eventi</th><th>V-S-P</th><th>Winrate</th><th>Commander pi&ugrave; usato</th></tr></thead>
      <tbody>${visible.map(renderRow).join("")}</tbody>
    </table></div>`;
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

      const recordByPlayer = new Map();
      function ensureRecord(id) {
        if (!recordByPlayer.has(id)) {
          recordByPlayer.set(id, { wins: 0, draws: 0, losses: 0, gameWins: 0, gameTotal: 0 });
        }
        return recordByPlayer.get(id);
      }
      for (const { matches } of eventsData) {
        for (const m of matches) {
          const r1 = ensureRecord(m.player1_id);
          const gamesInMatch = m.player1_wins + m.draws + m.player2_wins;
          r1.gameWins += m.player1_wins;
          r1.gameTotal += gamesInMatch;
          if (isBye(m)) {
            r1.wins += 1;
            continue;
          }
          const r2 = ensureRecord(m.player2_id);
          r2.gameWins += m.player2_wins;
          r2.gameTotal += gamesInMatch;
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

      lastRows = allPlayers.map((p) => {
        const playerEntries = entriesByPlayer.get(p.id) ?? [];
        const eventsPlayed = new Set(playerEntries.map((e) => e.event_id)).size;
        const record = recordByPlayer.get(p.id) ?? { wins: 0, draws: 0, losses: 0, gameWins: 0, gameTotal: 0 };
        const topCommander = mostUsedCommander(playerEntries);
        // Game basis, not match basis — winning a match 2-0 counts more
        // than winning it 2-1, even though both are one match win.
        const winRate = record.gameTotal > 0 ? (record.gameWins / record.gameTotal) * 100 : null;
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
          rate: winRate === null ? "—" : `${winRate.toFixed(1)}%`,
          topCommanderHtml: topCommander
            ? `${commanderPairLabel(topCommander.commander, topCommander.partner)} ${colorIdentityPips(
                (topCommander.commander.color_identity ?? "") + (topCommander.partner?.color_identity ?? "")
              )}`
            : "—",
        };
      });

      renderList();
    } catch (err) {
      showError(listEl, err);
    }
  }

  searchInput.addEventListener("input", renderList);
  sortSelect.addEventListener("change", renderList);
  dateFromInput.addEventListener("change", () => render(effectiveEventIds()));

  initScopeFilter({
    leagueSelect,
    eventSelect,
    onChange: (eventIds) => {
      lastScopeEventIds = eventIds;
      render(effectiveEventIds());
    },
  });
}

init();
