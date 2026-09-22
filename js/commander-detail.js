import { Commanders, EventEntries, Matches } from "./db.js";
import { matchRoundOutcome, isBye } from "./leaderboard.js";
import { initScopeFilter } from "./scope-filter.js";
import { tallyOutcome, tallyGames, renderWinrateTiles } from "./winrate.js";
import {
  escapeHtml,
  playerLabel,
  commanderPairLabel,
  colorIdentityPips,
  eventTitle,
  formatDate,
  showError,
} from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

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
  return selfIsP1 ? `${m.player1_wins}-${m.player2_wins}-${m.draws}` : `${m.player2_wins}-${m.player1_wins}-${m.draws}`;
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
    hidePageLoading();
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

    const playedEntryByKey = new Map(playedEntries.map((e) => [`${e.event_id}_${e.player_id}`, e]));
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

    // One row per (match, side) where that side piloted this commander — a
    // mirror match (both sides on this commander) legitimately yields two rows.
    const rows = [];
    for (const m of matches) {
      const gameTotal = m.player1_wins + m.draws + m.player2_wins;
      const selfEntry1 = playedEntryByKey.get(`${m.event_id}_${m.player1_id}`);
      if (selfEntry1) {
        const oppEntry = entryByKey.get(`${m.event_id}_${m.player2_id}`);
        rows.push({
          event: m.event,
          self: m.player1,
          opponent: m.player2,
          isBye: isBye(m),
          outcome: outcomeFor(m, true),
          scoreLabel: isBye(m) ? "Bye" : selfScoreLabel(m, true),
          gameWins: m.player1_wins,
          gameTotal,
          oppCommander: oppEntry?.commander ?? null,
          oppPartner: oppEntry?.partner_commander ?? null,
        });
      }
      // player2_id is null for a bye, so this lookup naturally never matches
      // one — a bye can only ever be "self as player1" above.
      const selfEntry2 = playedEntryByKey.get(`${m.event_id}_${m.player2_id}`);
      if (selfEntry2) {
        const oppEntry = entryByKey.get(`${m.event_id}_${m.player1_id}`);
        rows.push({
          event: m.event,
          self: m.player2,
          opponent: m.player1,
          outcome: outcomeFor(m, false),
          scoreLabel: selfScoreLabel(m, false),
          gameWins: m.player2_wins,
          gameTotal,
          oppCommander: oppEntry?.commander ?? null,
          oppPartner: oppEntry?.partner_commander ?? null,
        });
      }
    }

    // Most recent event date among a player's own rows above — i.e. the
    // last time they actually played a match on this commander, not just
    // the last event they were entered into with it.
    const lastPlayedByPlayer = new Map();
    for (const r of rows) {
      if (!r.self || !r.event?.event_date) continue;
      const current = lastPlayedByPlayer.get(r.self.id);
      if (!current || r.event.event_date > current) lastPlayedByPlayer.set(r.self.id, r.event.event_date);
    }
    playersEl.innerHTML = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Giocatore</th><th>Ultima partita</th></tr></thead>
      <tbody>${playerList
        .map((p) => `<tr><td>${playerLabel(p)}</td><td>${formatDate(lastPlayedByPlayer.get(p.id))}</td></tr>`)
        .join("")}</tbody>
    </table></div>`;

    matchesEl.innerHTML =
      rows.length === 0
        ? '<p class="page-empty">Nessuna partita registrata.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Evento</th><th>Giocatore</th><th>Avversario</th><th>Commander avversario</th><th>Risultato</th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${r.event ? `<a href="event.html?id=${r.event.id}">${escapeHtml(eventTitle(r.event))}</a>` : "—"}</td>
                  <td>${playerLabel(r.self)}</td>
                  <td>${r.isBye ? "Bye" : playerLabel(r.opponent)}</td>
                  <td>${r.isBye ? "—" : commanderPairLabel(r.oppCommander, r.oppPartner)}</td>
                  <td>${r.scoreLabel}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`;

    function computeWinrate(scopedEventIds) {
      const scoped = new Set(scopedEventIds);
      const bucket = { wins: 0, draws: 0, losses: 0, gameWins: 0, gameTotal: 0 };
      for (const r of rows) {
        if (r.event && !scoped.has(r.event.id)) continue;
        // A bye is a free win for the player, not a "victory" for the
        // commander — it never actually beat anything.
        if (r.isBye) continue;
        tallyOutcome(bucket, r.outcome);
        tallyGames(bucket, r.gameWins, r.gameTotal);
      }
      renderWinrateTiles(winrateEl, bucket);
    }

    await initScopeFilter({ leagueSelect: leagueFilter, eventSelect: eventFilter, onChange: computeWinrate });
  } catch (err) {
    showError(document.getElementById("commander-content"), err);
  } finally {
    hidePageLoading();
  }
}

init();
