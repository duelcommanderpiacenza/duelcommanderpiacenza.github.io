// Groups match results by an arbitrary key derived from each event's entries
// (e.g. commander_id or archetype), so we can answer "how did X perform
// across all the games it was played in, within this scope". Used by the
// Commanders and Archetypes pages, both of which let the viewer narrow the
// scope to a league and/or a single event first.

import { matchRoundOutcome, isBye, isDrop } from "./leaderboard.js";

/**
 * `wins`/`draws`/`losses` are match-level counts (one per match, used for
 * the V-S-P display column), and `winRate` is computed from those same
 * counts (`wins / played`, `played` = `wins+draws+losses`) — a 2-0 and a
 * 2-1 match win both just count as one win.
 * @param {Array<{entries: Array, matches: Array}>} eventsData
 * @param {(entry) => string} keyFn - grouping key for one entry, e.g. entry.commander_id
 * @param {(entry) => object} buildMeta - extra display fields captured the first time a key is seen
 * @returns {Array} one row per group: { key, wins, draws, losses, entries, played, winRate, ...meta }
 */
export function computeGroupedStats(eventsData, keyFn, buildMeta) {
  const groups = new Map();

  function ensure(entry) {
    const key = keyFn(entry);
    if (key == null) return null;
    if (!groups.has(key)) {
      groups.set(key, { key, entries: 0, wins: 0, draws: 0, losses: 0, ...buildMeta(entry) });
    }
    return groups.get(key);
  }

  for (const { entries, matches } of eventsData) {
    const entryByPlayer = new Map(entries.map((e) => [e.player_id, e]));

    for (const entry of entries) {
      const g = ensure(entry);
      if (g) g.entries += 1;
    }

    for (const m of matches) {
      // A bye is a free win for the player, but it's not a "victory" for
      // whatever commander/archetype they happened to be piloting — it
      // never involved an opponent to actually beat. A drop is excluded for
      // the same reason (plus it's not a match played at all).
      if (isBye(m) || isDrop(m)) continue;

      const e1 = entryByPlayer.get(m.player1_id);
      const e2 = entryByPlayer.get(m.player2_id);
      const g1 = e1 ? groups.get(keyFn(e1)) : null;
      const g2 = e2 ? groups.get(keyFn(e2)) : null;
      const outcome = matchRoundOutcome(m);

      if (g1) {
        if (outcome === "player1") g1.wins += 1;
        else if (outcome === "player2") g1.losses += 1;
        else g1.draws += 1;
      }
      if (g2) {
        if (outcome === "player2") g2.wins += 1;
        else if (outcome === "player1") g2.losses += 1;
        else g2.draws += 1;
      }
    }
  }

  return Array.from(groups.values())
    .map((g) => {
      const played = g.wins + g.draws + g.losses;
      return { ...g, played, winRate: played > 0 ? (g.wins / played) * 100 : null };
    })
    .sort((a, b) => b.entries - a.entries);
}

/**
 * League/homepage summary stats: number of events, unique players across
 * all of them, average attendance per event, total matches played.
 * @param {Array<{entries: Array, matches: Array}>} eventsData
 */
export function computeLeagueSummary(eventsData) {
  const uniquePlayers = new Set();
  let totalEntries = 0;
  let totalMatches = 0;

  for (const { entries, matches } of eventsData) {
    totalEntries += entries.length;
    totalMatches += matches.length;
    for (const e of entries) uniquePlayers.add(e.player_id);
  }

  const events = eventsData.length;
  return {
    events,
    uniquePlayers: uniquePlayers.size,
    avgPlayersPerEvent: events > 0 ? totalEntries / events : 0,
    totalMatches,
  };
}
