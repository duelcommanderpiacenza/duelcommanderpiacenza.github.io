import { Players, EventEntries, Matches } from "./db.js";
import { matchRoundOutcome, isBye } from "./leaderboard.js";
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

function renderRow(r) {
  return `
    <tr>
      <td><a href="player.html?id=${r.id}">${r.nameHtml}</a></td>
      <td>${r.eventsPlayed}</td>
      <td>${r.wins}-${r.draws}-${r.losses}</td>
      <td>${r.rate}</td>
      <td>${r.topCommanderHtml}</td>
    </tr>`;
}

async function init() {
  const listEl = document.getElementById("players-list");
  const searchInput = document.getElementById("players-search");

  let rows = [];

  try {
    const [players, entries, matches] = await Promise.all([Players.list(), EventEntries.listAll(), Matches.listAll()]);

    if (players.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun giocatore inserito ancora.</p>';
      return;
    }

    const entriesByPlayer = new Map();
    for (const e of entries) {
      if (!entriesByPlayer.has(e.player_id)) entriesByPlayer.set(e.player_id, []);
      entriesByPlayer.get(e.player_id).push(e);
    }

    const recordByPlayer = new Map();
    function ensureRecord(id) {
      if (!recordByPlayer.has(id)) recordByPlayer.set(id, { wins: 0, draws: 0, losses: 0 });
      return recordByPlayer.get(id);
    }
    for (const m of matches) {
      const r1 = ensureRecord(m.player1_id);
      if (isBye(m)) {
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

    rows = players.map((p) => {
      const playerEntries = entriesByPlayer.get(p.id) ?? [];
      const eventsPlayed = new Set(playerEntries.map((e) => e.event_id)).size;
      const record = recordByPlayer.get(p.id) ?? { wins: 0, draws: 0, losses: 0 };
      const played = record.wins + record.draws + record.losses;
      const topCommander = mostUsedCommander(playerEntries);
      return {
        id: p.id,
        searchText: `${p.name} ${p.handle ?? ""}`.toLowerCase(),
        nameHtml: p.handle ? `${escapeHtml(p.name)} (${escapeHtml(p.handle)})` : escapeHtml(p.name),
        eventsPlayed,
        wins: record.wins,
        draws: record.draws,
        losses: record.losses,
        rate: played > 0 ? `${((record.wins / played) * 100).toFixed(1)}%` : "—",
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
    return;
  }

  function renderList() {
    const term = searchInput.value.trim().toLowerCase();
    const visible = term ? rows.filter((r) => r.searchText.includes(term)) : rows;
    listEl.innerHTML =
      visible.length === 0
        ? '<p class="page-empty">Nessun giocatore corrisponde alla ricerca.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Giocatore</th><th>Eventi</th><th>V-P-S</th><th>Winrate</th><th>Commander pi&ugrave; usato</th></tr></thead>
      <tbody>${visible.map(renderRow).join("")}</tbody>
    </table></div>`;
  }

  searchInput.addEventListener("input", renderList);
}

init();
