import { Players, Events, EventEntries, Matches, PlayerAutoBadges } from "./db.js";
import { matchRoundOutcome, isBye, isDrop } from "./leaderboard.js";
import { initScopeFilter } from "./scope-filter.js";
import { MAX_AUTO_BADGES_PER_PLAYER } from "./auto-badges.js";
import { escapeHtml, commanderPairWithColors, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initFilterToggle } from "./filter-toggle.js";

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

// Up to 2 manually assigned badges plus up to MAX_AUTO_BADGES_PER_PLAYER
// auto-assigned ones (already capped in autoBadgesByPlayer above — see
// js/auto-badges.js). Hover/focus shows the badge's own name as a custom
// tooltip (styles.css) — a native `title` attribute can't be restyled by
// any browser, so this builds one from scratch instead, fed by
// data-tooltip and kept accessible via aria-label. Kept as a sibling of
// the name link (not nested inside it) so hovering/clicking a badge icon
// doesn't behave like part of the player-page link.
function playerBadgesHtml(p, autoBadgesByPlayer) {
  const badges = [p.badge1, p.badge2, ...(autoBadgesByPlayer.get(p.id) ?? [])].filter(Boolean);
  return badges
    .map((b) => {
      const glyph = b.icon_url
        ? `<img src="${b.icon_url}" alt="" class="icon-badge-img badge-icon-box" style="width:1.1em;height:1.1em;">`
        : `<span class="badge-icon-box" style="width:1.1em;height:1.1em;">${b.icon ?? ""}</span>`;
      return `<span class="icon-badge" data-tooltip="${escapeHtml(b.name)}" aria-label="${escapeHtml(b.name)}" tabindex="0">${glyph}</span>`;
    })
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
  // read once, globally, rather than re-fetched on every filter change.
  let autoBadgesByPlayer = new Map();

  try {
    const [players, events] = await Promise.all([Players.list(), Events.list()]);
    if (players.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun giocatore inserito ancora.</p>';
      hidePageLoading();
      return;
    }
    allPlayers = players;
    eventDateById = new Map(events.map((e) => [e.id, e.event_date]));
  } catch (err) {
    showError(listEl, err);
    hidePageLoading();
    return;
  }

  // Not fatal if this fails — the page still works with just the manually
  // assigned badges, so it's kept out of the critical try/catch above.
  // Precomputed by admin/js/badges-sync.js whenever an event/league closes
  // (see js/db.js's PlayerAutoBadges) — a plain read here, not the actual
  // (expensive) computation.
  try {
    for (const row of await PlayerAutoBadges.list()) {
      if (!row.badge) continue;
      if (!autoBadgesByPlayer.has(row.player_id)) autoBadgesByPlayer.set(row.player_id, []);
      autoBadgesByPlayer.get(row.player_id).push(row.badge);
    }
    // The stored set is the player's *entire* auto-badge set (player.html
    // shows all of it) — this page still only shows the top few, highest
    // priority first (rows come back in no guaranteed order otherwise).
    for (const [playerId, badges] of autoBadgesByPlayer) {
      autoBadgesByPlayer.set(
        playerId,
        badges.sort((a, b) => b.priority - a.priority).slice(0, MAX_AUTO_BADGES_PER_PLAYER)
      );
    }
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
  function renderList(animate = true) {
    const term = searchInput.value.trim().toLowerCase();
    const base = lastRows.filter((r) => r.eventsPlayed > 0);
    const filtered = term ? base.filter((r) => r.searchText.includes(term)) : base;
    const sorter = SORTERS[sortSelect.value] ?? SORTERS.events;
    const visible = [...filtered].sort((a, b) => sorter(a, b) || a.nameHtml.localeCompare(b.nameHtml));
    listEl.innerHTML =
      visible.length === 0
        ? `<p class="page-empty">${term ? "Nessun giocatore corrisponde alla ricerca." : "Nessun giocatore ha ancora dati registrati."}</p>`
        : `<div class="data-table-wrap${animate ? "" : " no-entrance-anim"}"><table class="data-table">
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

      lastRows = allPlayers.map((p) => {
        const playerEntries = entriesByPlayer.get(p.id) ?? [];
        const eventsPlayed = new Set(playerEntries.map((e) => e.event_id)).size;
        const record = recordByPlayer.get(p.id) ?? { wins: 0, draws: 0, losses: 0 };
        const topCommander = mostUsedCommander(playerEntries);
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
          rate: winRate === null ? "—" : `${winRate.toFixed(1)}%`,
          topCommanderHtml: topCommander ? commanderPairWithColors(topCommander.commander, topCommander.partner) : "—",
        };
      });

      renderList();
    } catch (err) {
      showError(listEl, err);
    } finally {
      hidePageLoading();
    }
  }

  initFilterToggle("players-filter-toggle", "players-filter-panel");

  searchInput.addEventListener("input", () => renderList(false));
  sortSelect.addEventListener("change", () => renderList());
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
