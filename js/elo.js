// Each player's Elo rating over every closed event (online ones left out,
// like everywhere else outside the timeline / Leghe & Eventi). Pure
// computation, no DOM: run by the admin's sync (admin/js/badges-sync.js),
// which stores it in player_progress (migration 035), so the public pages
// (Giocatori, player.html's hero) just read it.
//
// Match-level, like the winrate: a match won 1, drawn ½, lost 0 — a 2-0 and
// a 2-1 the same. A bye (no opponent) and a drop (not played) don't count.
// Everyone starts at ELO_START; each match moves the two ratings by
// ELO_K × (result − expected), the expected result from the rating gap
// (400 points = 10 to 1), so beating a stronger player earns more.

import { isBye, isDrop, matchRoundOutcome } from "./leaderboard.js";

export const ELO_START = 1500;
export const ELO_K = 32;

/**
 * @param {Array<{entries: Array, matches: Array}>} eventsData - every closed
 *   event's results (js/db.js fetchEventsResults), **oldest first**; each
 *   event's matches in round order (as fetchEventsResults returns them).
 * @returns {Map<string, {elo: number, before: number}>} player id → rating
 *   now and at the start of the latest event they played a match in (both
 *   rounded) — the trend arrows' "before". Only players with a rated match.
 */
export function computeElo(eventsData) {
  const rating = new Map(); // player id -> rating (unrounded)
  const before = new Map(); // player id -> rating at the start of their latest event
  const ratingOf = (id) => rating.get(id) ?? ELO_START;

  for (const { matches } of eventsData) {
    const seen = new Set(); // players already met in this event
    for (const m of matches) {
      if (isBye(m) || isDrop(m)) continue;
      const [p1, p2] = [m.player1_id, m.player2_id];
      for (const id of [p1, p2]) {
        if (!seen.has(id)) {
          seen.add(id);
          before.set(id, ratingOf(id));
        }
      }
      const r1 = ratingOf(p1);
      const r2 = ratingOf(p2);
      const expected1 = 1 / (1 + 10 ** ((r2 - r1) / 400));
      const outcome = matchRoundOutcome(m);
      const score1 = outcome === "player1" ? 1 : outcome === "player2" ? 0 : 0.5;
      const delta = ELO_K * (score1 - expected1);
      rating.set(p1, r1 + delta);
      rating.set(p2, r2 - delta);
    }
  }

  return new Map([...rating].map(([id, r]) => [id, { elo: Math.round(r), before: Math.round(before.get(id)) }]));
}
