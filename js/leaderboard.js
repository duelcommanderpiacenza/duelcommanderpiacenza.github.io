// Pure scoring logic — no DOM, no network — kept isolated so the league
// scoring rule can be swapped later without touching schema or pages.

const POINTS = { win: 3, draw: 1, loss: 0 };

/**
 * A match stores a best-of-3 game score (player1_wins/draws/player2_wins);
 * the round is won by whoever won more games, or a draw if tied (including
 * an all-draws score like 0-3-0).
 * @returns {"player1"|"player2"|"draw"}
 */
export function matchRoundOutcome(m) {
  if (m.player1_wins > m.player2_wins) return "player1";
  if (m.player2_wins > m.player1_wins) return "player2";
  return "draw";
}

/**
 * Event leaderboard: fixed rule per spec — 3 pts win / 1 pt draw / 0 pt loss.
 * @param {Array} matches - rows from `matches` for one event.
 * @param {Array} entries - rows from `event_entries` for the same event (with player/commander joined).
 * @returns {Array} standings sorted by points desc, then wins desc, then name.
 */
export function computeEventLeaderboard(matches, entries) {
  const byPlayer = new Map();

  for (const entry of entries) {
    byPlayer.set(entry.player_id, {
      player: entry.player,
      commander: entry.commander,
      archetype: entry.archetype,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      played: 0,
    });
  }

  const ensure = (playerId, playerObj) => {
    if (!byPlayer.has(playerId)) {
      byPlayer.set(playerId, {
        player: playerObj,
        commander: null,
        archetype: null,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        played: 0,
      });
    }
    return byPlayer.get(playerId);
  };

  for (const m of matches) {
    const p1 = ensure(m.player1_id, m.player1);
    const p2 = ensure(m.player2_id, m.player2);
    p1.played += 1;
    p2.played += 1;

    const outcome = matchRoundOutcome(m);
    if (outcome === "player1") {
      p1.points += POINTS.win;
      p1.wins += 1;
      p2.losses += 1;
    } else if (outcome === "player2") {
      p2.points += POINTS.win;
      p2.wins += 1;
      p1.losses += 1;
    } else {
      p1.points += POINTS.draw;
      p2.points += POINTS.draw;
      p1.draws += 1;
      p2.draws += 1;
    }
  }

  return Array.from(byPlayer.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.player?.name ?? "").localeCompare(b.player?.name ?? "");
  });
}

// League scoring rule ("Sistema di Punteggio"):
// each event ("tappa") awards points by final position within that event,
// plus a small bonus for finishing undefeated. A player's league total is
// the sum of their best BEST_RESULTS_COUNT event scores, plus a flat bonus
// for having an entry in every event of the league. RANK_POINTS[i] is the
// award for position i+1; any position beyond the array falls back to
// FALLBACK_POSITION_POINTS.
const RANK_POINTS = [20, 17, 14, 14, 11, 11, 11, 11];
const FALLBACK_POSITION_POINTS = 5;
const UNDEFEATED_BONUS = 2;
const FULL_ATTENDANCE_BONUS = 5;
const BEST_RESULTS_COUNT = 6;

function pointsForPosition(position) {
  return RANK_POINTS[position - 1] ?? FALLBACK_POSITION_POINTS;
}

/**
 * League leaderboard, per the club's official scoring rules.
 *
 * One-off adjustments that don't fit a generic rule (e.g. a bonus limited to
 * one specific tournament) aren't hardcoded here — they're applied manually
 * per player via the `bonus_points` field on that player's entry for that
 * event, which is added into their score for that event before the
 * best-N cutoff below.
 *
 * @param {Array<{matches: Array, entries: Array}>} eventsData - one entry per event in the league.
 */
export function computeLeaguePoints(eventsData) {
  const totalEvents = eventsData.length;
  const byPlayer = new Map();

  for (const { matches, entries } of eventsData) {
    const standings = computeEventLeaderboard(matches, entries);
    standings.forEach((row, index) => {
      const id = row.player?.id;
      if (!id) return;

      let score = pointsForPosition(index + 1);
      if (row.wins > 0 && row.losses === 0 && row.draws === 0) score += UNDEFEATED_BONUS;
      const entry = entries.find((e) => e.player_id === id);
      score += entry?.bonus_points ?? 0;

      if (!byPlayer.has(id)) {
        byPlayer.set(id, { player: row.player, eventScores: [], wins: 0, draws: 0, losses: 0 });
      }
      const agg = byPlayer.get(id);
      agg.eventScores.push(score);
      agg.wins += row.wins;
      agg.draws += row.draws;
      agg.losses += row.losses;
    });
  }

  const results = Array.from(byPlayer.values()).map(({ player, eventScores, wins, draws, losses }) => {
    const bestScores = [...eventScores].sort((a, b) => b - a).slice(0, BEST_RESULTS_COUNT);
    const fullAttendance = totalEvents > 0 && eventScores.length === totalEvents;
    const points = bestScores.reduce((sum, s) => sum + s, 0) + (fullAttendance ? FULL_ATTENDANCE_BONUS : 0);
    const played = wins + draws + losses;
    const winRate = played > 0 ? (wins / played) * 100 : null;
    return { player, points, eventsPlayed: eventScores.length, fullAttendance, wins, draws, losses, winRate };
  });

  return results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return (a.player?.name ?? "").localeCompare(b.player?.name ?? "");
  });
}
