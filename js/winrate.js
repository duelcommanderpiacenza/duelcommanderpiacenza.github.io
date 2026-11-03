// Shared win/draw/loss tally + stat-tile rendering, used by both the player
// and commander detail pages (each shows the same overall winrate cards,
// updated live as the viewer narrows the scope with a filter).
//
// The "Winrate" figure is on a *match* basis (matches won / matches played),
// not a game basis: a 2-0 and a 2-1 match win both just count as one win,
// same as the V-S-P record beside it — that and the
// Winrate figure are now two views of the exact same match-level tally,
// not two different statistics.

import { matchRoundOutcome } from "./leaderboard.js";
import { statTileHtml } from "./ui.js";

export function winRatePct(wins, played) {
  return played > 0 ? ((wins / played) * 100).toFixed(1) : null;
}

// A match's outcome ("win" | "draw" | "loss") from one side's point of view:
// `isP1`, that side is the match's player1.
export function outcomeFor(m, isP1) {
  const outcome = matchRoundOutcome(m);
  if (outcome === "draw") return "draw";
  return (outcome === "player1") === isP1 ? "win" : "loss";
}

// The score from one side's point of view (its wins first), not the raw
// player1/player2 order: "2-1-0".
export function scoreLabelFor(m, isP1) {
  return isP1 ? `${m.player1_wins}-${m.player2_wins}-${m.draws}` : `${m.player2_wins}-${m.player1_wins}-${m.draws}`;
}

export function tallyOutcome(bucket, outcome) {
  if (outcome === "win") bucket.wins += 1;
  else if (outcome === "draw") bucket.draws += 1;
  else bucket.losses += 1;
}

// The hero's numbers (player.html, commander.html): Winrate, then `extra`
// ([label, value] pairs — the player's Elo and Eventi, the commander's
// Piloti and Giocato), then the record as one "V-S-P" tile
// (wins-losses-draws, the site's order) so they fit one row on phones too.
export function renderWinrateTiles(el, bucket, { extra = [] } = {}) {
  const played = (bucket.wins ?? 0) + (bucket.draws ?? 0) + (bucket.losses ?? 0);
  const rate = winRatePct(bucket.wins ?? 0, played);
  el.innerHTML =
    rate === null
      ? '<p class="page-empty">Non ci sono ancora dati sufficienti.</p>'
      : `
    ${statTileHtml("Winrate", `${rate}%`)}
    ${extra.map(([label, value]) => statTileHtml(label, value)).join("")}
    ${statTileHtml("V-S-P", `${bucket.wins}-${bucket.losses}-${bucket.draws}`)}
  `;
}
