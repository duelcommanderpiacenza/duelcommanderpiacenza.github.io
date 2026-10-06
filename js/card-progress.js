// Each player's progress — the numbers behind the player card's cosmetics
// (js/card-cosmetics.js): events played, matches won, top 8s in big events,
// distinct commanders, real leagues won. Pure computation, no DOM: run by
// the admin's sync (admin/js/badges-sync.js) over every closed event, which
// stores the result in player_progress (supabase/migrations/011), so the
// public pages just read a player's one row.

import { computeEventLeaderboard, isBye, isDrop, matchRoundOutcome } from "./leaderboard.js";

// Only these events count for the "Podio" top 8s.
export const BIG_EVENT_MIN_PLAYERS = 20;

/**
 * @param {Array<{entries: Array, matches: Array}>} eventsData - every closed
 *   event's entries + matches (js/db.js fetchEventsResults).
 * @param {Array<{league: {name: string}, playerId: string|null}>} leagueWinners
 *   - each closed real league with its winner (js/auto-badges.js).
 * @returns {Array<{player_id, events_played, matches_won, big_top8s,
 *   commanders, leagues_won}>} one row per player with any result.
 *
 * Counted like the rest of the site: a match won is a round won — a bye
 * counts as one (as on player.html's tiles), a drop doesn't count at all;
 * commanders are commander + partner pairs, like player.html's album.
 */
export function computeCardProgress(eventsData, leagueWinners) {
  const byPlayer = new Map();
  const progress = (playerId) => {
    if (!byPlayer.has(playerId)) {
      byPlayer.set(playerId, { events: new Set(), matchesWon: 0, bigTop8s: 0, pairs: new Set(), leaguesWon: [] });
    }
    return byPlayer.get(playerId);
  };

  for (const { entries, matches } of eventsData) {
    for (const e of entries) {
      const p = progress(e.player_id);
      p.events.add(e.event_id);
      if (e.commander_id) p.pairs.add(`${e.commander_id}_${e.partner_commander_id ?? ""}`);
    }
    for (const m of matches) {
      if (isDrop(m)) continue;
      if (isBye(m)) {
        progress(m.player1_id).matchesWon += 1;
        continue;
      }
      const outcome = matchRoundOutcome(m);
      if (outcome === "player1") progress(m.player1_id).matchesWon += 1;
      else if (outcome === "player2") progress(m.player2_id).matchesWon += 1;
    }
    if (entries.length >= BIG_EVENT_MIN_PLAYERS) {
      for (const row of computeEventLeaderboard(matches, entries)) {
        if (row.isTop8 && row.player?.id) progress(row.player.id).bigTop8s += 1;
      }
    }
  }

  for (const { league, playerId } of leagueWinners) {
    if (playerId) progress(playerId).leaguesWon.push(league.name);
  }

  return [...byPlayer].map(([playerId, p]) => ({
    player_id: playerId,
    events_played: p.events.size,
    matches_won: p.matchesWon,
    big_top8s: p.bigTop8s,
    commanders: p.pairs.size,
    leagues_won: p.leaguesWon,
  }));
}
