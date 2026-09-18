import { Commanders, EventEntries, Matches } from "./db.js";
import { matchRoundOutcome } from "./leaderboard.js";
import { initScopeFilter } from "./scope-filter.js";
import { tallyOutcome, renderWinrateTiles } from "./winrate.js";
import { escapeHtml, playerLabel, commanderLabel, colorIdentityPips, showError } from "./ui.js";

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

function outcomeFor(m, selfIsP1) {
  const outcome = matchRoundOutcome(m);
  if (outcome === "draw") return "draw";
  if ((outcome === "player1" && selfIsP1) || (outcome === "player2" && !selfIsP1)) return "win";
  return "loss";
}

// The score is shown from this commander's own point of view (its wins first).
function selfScoreLabel(m, selfIsP1) {
  return selfIsP1 ? `${m.player1_wins}-${m.draws}-${m.player2_wins}` : `${m.player2_wins}-${m.draws}-${m.player1_wins}`;
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("commander-title");
  const winrateEl = document.getElementById("commander-winrate");
  const leagueFilter = document.getElementById("commander-league-filter");
  const eventFilter = document.getElementById("commander-event-filter");
  const playersEl = document.getElementById("commander-players");
  const matchesEl = document.getElementById("commander-matches");

  if (!id) {
    titleEl.textContent = "Commander non trovato";
    return;
  }

  try {
    const commander = await Commanders.get(id);
    titleEl.innerHTML = `${escapeHtml(commander.name)} ${colorIdentityPips(commander.color_identity)}`;

    // Every (event, player) pair that piloted this commander.
    const playedEntries = await EventEntries.listByCommander(id);

    if (playedEntries.length === 0) {
      winrateEl.innerHTML = '<p class="page-empty">Non ci sono ancora dati sufficienti.</p>';
      playersEl.innerHTML = '<p class="page-empty">Nessun giocatore ha ancora usato questo commander.</p>';
      matchesEl.innerHTML = '<p class="page-empty">Nessuna partita registrata.</p>';
      return;
    }

    const playedKeys = new Set(playedEntries.map((e) => `${e.event_id}_${e.player_id}`));
    const eventIds = [...new Set(playedEntries.map((e) => e.event_id))];

    const [allEntries, matches] = await Promise.all([
      EventEntries.listByEvents(eventIds),
      Matches.listByEvents(eventIds),
    ]);
    const entryByKey = new Map(allEntries.map((e) => [`${e.event_id}_${e.player_id}`, e]));

    const playersMap = new Map();
    for (const e of playedEntries) {
      if (e.player) playersMap.set(e.player.id, e.player);
    }
    const playerList = Array.from(playersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    playersEl.innerHTML = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Giocatore</th></tr></thead>
      <tbody>${playerList.map((p) => `<tr><td>${playerLabel(p)}</td></tr>`).join("")}</tbody>
    </table></div>`;

    // One row per (match, side) where that side piloted this commander — a
    // mirror match (both sides on this commander) legitimately yields two rows.
    const rows = [];
    for (const m of matches) {
      if (playedKeys.has(`${m.event_id}_${m.player1_id}`)) {
        const oppEntry = entryByKey.get(`${m.event_id}_${m.player2_id}`);
        rows.push({
          event: m.event,
          self: m.player1,
          opponent: m.player2,
          outcome: outcomeFor(m, true),
          scoreLabel: selfScoreLabel(m, true),
          oppCommander: oppEntry?.commander ?? null,
        });
      }
      if (playedKeys.has(`${m.event_id}_${m.player2_id}`)) {
        const oppEntry = entryByKey.get(`${m.event_id}_${m.player1_id}`);
        rows.push({
          event: m.event,
          self: m.player2,
          opponent: m.player1,
          outcome: outcomeFor(m, false),
          scoreLabel: selfScoreLabel(m, false),
          oppCommander: oppEntry?.commander ?? null,
        });
      }
    }

    matchesEl.innerHTML =
      rows.length === 0
        ? '<p class="page-empty">Nessuna partita registrata.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Giocatore</th><th>Evento</th><th>Avversario</th><th>Commander avversario</th><th>Risultato</th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${playerLabel(r.self)}</td>
                  <td>${r.event ? `<a href="event.html?id=${r.event.id}">${escapeHtml(r.event.name)}</a>` : "—"}</td>
                  <td>${playerLabel(r.opponent)}</td>
                  <td>${commanderLabel(r.oppCommander)}</td>
                  <td>${r.scoreLabel}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`;

    function computeWinrate(scopedEventIds) {
      const scoped = new Set(scopedEventIds);
      const bucket = { wins: 0, draws: 0, losses: 0 };
      for (const r of rows) {
        if (r.event && !scoped.has(r.event.id)) continue;
        tallyOutcome(bucket, r.outcome);
      }
      renderWinrateTiles(winrateEl, bucket);
    }

    initScopeFilter({ leagueSelect: leagueFilter, eventSelect: eventFilter, onChange: computeWinrate });
  } catch (err) {
    showError(document.getElementById("commander-content"), err);
  }
}

init();
