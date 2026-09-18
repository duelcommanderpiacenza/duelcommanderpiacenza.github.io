import { Players, EventEntries, Matches } from "./db.js";
import { matchRoundOutcome } from "./leaderboard.js";
import { escapeHtml, commanderLabel, colorIdentityPips, showError } from "./ui.js";

function mostUsedCommander(entries) {
  const counts = new Map(); // commanderId -> { commander, count }
  for (const e of entries) {
    if (!e.commander) continue;
    const key = e.commander.id;
    if (!counts.has(key)) counts.set(key, { commander: e.commander, count: 0 });
    counts.get(key).count += 1;
  }
  let best = null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count || (v.count === best.count && v.commander.name.localeCompare(best.commander.name) < 0)) {
      best = v;
    }
  }
  return best?.commander ?? null;
}

async function init() {
  const listEl = document.getElementById("players-list");
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

    listEl.innerHTML = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Giocatore</th><th>Eventi</th><th>V-P-S</th><th>Winrate</th><th>Commander pi&ugrave; usato</th></tr></thead>
      <tbody>
        ${players
          .map((p) => {
            const playerEntries = entriesByPlayer.get(p.id) ?? [];
            const eventsPlayed = new Set(playerEntries.map((e) => e.event_id)).size;
            const record = recordByPlayer.get(p.id) ?? { wins: 0, draws: 0, losses: 0 };
            const played = record.wins + record.draws + record.losses;
            const rate = played > 0 ? `${((record.wins / played) * 100).toFixed(1)}%` : "—";
            const name = p.handle ? `${escapeHtml(p.name)} (${escapeHtml(p.handle)})` : escapeHtml(p.name);
            const topCommander = mostUsedCommander(playerEntries);
            return `
          <tr>
            <td><a href="player.html?id=${p.id}">${name}</a></td>
            <td>${eventsPlayed}</td>
            <td>${record.wins}-${record.draws}-${record.losses}</td>
            <td>${rate}</td>
            <td>${topCommander ? `${commanderLabel(topCommander)} ${colorIdentityPips(topCommander.color_identity)}` : "—"}</td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;
  } catch (err) {
    showError(listEl, err);
  }
}

init();
