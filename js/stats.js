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

// Best-winrate needs a real sample: a player who showed up for a single
// round and won it would otherwise top the league at 100%. Only players who
// played at least this fraction of the most active player's match count
// qualify (relative, not a fixed number, so it scales from a 2-event league
// to a full season).
const WRAPPED_MIN_PLAYED_RATIO = 0.5;
const WRAPPED_TOP_COMMANDERS = 3;

/**
 * League "Wrapped" highlights (league detail page): best winrate, most used
 * archetype, most used commanders. Winrate is match-basis, same figures as
 * the league leaderboard table (byes included, as they are there).
 * @param {Array<{entries: Array, matches: Array}>} eventsData
 * @param {Array} playerStandings - computeLeaguePoints(eventsData)'s output
 * @returns {{
 *   bestWinrate: null | { players: Array, winRate: number, wins: number, draws: number, losses: number },
 *   topArchetype: null | { archetype: string, entries: number, wins: number },
 *   topCommanders: Array<{ commander: object, partner: object|null, entries: number, wins: number }>,
 * }}
 */
export function computeLeagueWrapped(eventsData, playerStandings) {
  const withPlayed = playerStandings
    .map((s) => ({ ...s, played: s.wins + s.draws + s.losses }))
    .filter((s) => s.played > 0);
  const maxPlayed = Math.max(0, ...withPlayed.map((s) => s.played));
  const eligible = withPlayed.filter((s) => s.played >= maxPlayed * WRAPPED_MIN_PLAYED_RATIO);

  // Compared as exact fractions (a.wins/a.played vs b.wins/b.played, cross-
  // multiplied) rather than as floats, so two genuinely equal winrates
  // (e.g. 6/8 and 3/4) always tie instead of one edging out on rounding.
  let best = [];
  for (const s of eligible) {
    const cmp = best.length === 0 ? 1 : s.wins * best[0].played - best[0].wins * s.played;
    if (cmp > 0) best = [s];
    else if (cmp === 0) best.push(s);
  }
  best.sort((a, b) => (a.player?.name ?? "").localeCompare(b.player?.name ?? ""));
  const bestWinrate =
    best.length === 0
      ? null
      : {
          players: best.map((s) => s.player),
          winRate: best[0].winRate,
          // V-S-P only meaningful for a single winner — tied players can
          // share a winrate with different records (3-1 vs 6-2).
          wins: best[0].wins,
          draws: best[0].draws,
          losses: best[0].losses,
        };

  // Most entries first; a tie goes to whichever has more match wins.
  const byUsage = (a, b) => b.entries - a.entries || b.wins - a.wins;

  const archetypeStats = computeGroupedStats(eventsData, (e) => e.archetype, () => ({})).sort(byUsage);
  const topArchetype = archetypeStats[0]
    ? { archetype: archetypeStats[0].key, entries: archetypeStats[0].entries, wins: archetypeStats[0].wins }
    : null;

  // Grouped by the exact commander+partner pairing, same "deck" definition
  // as the Comandanti page.
  const commanderStats = computeGroupedStats(
    eventsData,
    (e) => `${e.commander_id}_${e.partner_commander_id ?? ""}`,
    (e) => ({ commander: e.commander, partner: e.partner_commander ?? null })
  );
  const topCommanders = commanderStats
    .sort((a, b) => byUsage(a, b) || (a.commander?.name ?? "").localeCompare(b.commander?.name ?? ""))
    .slice(0, WRAPPED_TOP_COMMANDERS)
    .map((s) => ({ commander: s.commander, partner: s.partner, entries: s.entries, wins: s.wins }));

  return { bestWinrate, topArchetype, topCommanders };
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
