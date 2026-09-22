// Pure scoring logic — no DOM, no network — kept isolated so the league
// scoring rule can be swapped later without touching schema or pages.

const POINTS = { win: 3, draw: 1, loss: 0 };

/**
 * A bye: player1 had no opponent this round (an odd number of entrants) and
 * is scored an automatic win, regardless of whatever placeholder score got
 * saved alongside it. A dropped player's round (isDrop below) also has no
 * player2, so it's explicitly excluded here — the two are mutually
 * exclusive single-player match "shapes".
 */
export function isBye(m) {
  return m.player2_id == null && !m.is_drop;
}

/**
 * A drop: player1 left the event as of this round and isn't playing it —
 * not a win, not a loss, not a real game. Excluded everywhere a match is
 * tallied into points, standings, or winrate (game- or match-basis alike);
 * only kept around as a record so the round history shows it and the admin
 * form can stop offering that player in later rounds of the same event.
 */
export function isDrop(m) {
  return !!m.is_drop;
}

/**
 * A match stores a best-of-3 game score (player1_wins/draws/player2_wins);
 * the round is won by whoever won more games, or a draw if tied (including
 * an all-draws score like 0-3-0). A bye is always a win for player1.
 * @returns {"player1"|"player2"|"draw"}
 */
export function matchRoundOutcome(m) {
  if (isBye(m)) return "player1";
  if (m.player1_wins > m.player2_wins) return "player1";
  if (m.player2_wins > m.player1_wins) return "player2";
  return "draw";
}

// Standard Magic tournament tiebreaker floor: a player's (or their
// opponents') win percentage is never treated as less than this, so a
// single bad round (or a weak opponent) doesn't disproportionately tank it.
const MIN_WIN_PCT = 1 / 3;

// How many of an event's final standings count as a "top 8" finish.
const TOP_FINISH_CUTOFF = 8;

/**
 * Event leaderboard: 3 pts win / 1 pt draw / 0 pt loss, ties broken by the
 * standard Magic tournament tiebreakers — opponents' match-win %, then own
 * game-win %, then opponents' game-win % — with an optional per-entry
 * manual_rank that overrides those computed tiebreakers when the admin has
 * explicitly reordered a tie group (see admin/js/matches-admin.js).
 *
 * Each row's `winRate` is on a *game* basis (games won / games played
 * across every match), not a match basis — winning a match 2-0 counts more
 * than winning it 2-1, even though both are a single match win. `wins`/
 * `draws`/`losses` stay match-level counts (used for the undefeated bonus
 * and the V-S-P display column, which are legitimately about match record).
 * A dropped player's round (isDrop) is skipped entirely — no points, no
 * played count, nothing — leaving whatever they'd already earned in earlier
 * rounds untouched.
 * @param {Array} matches - rows from `matches` for one event.
 * @param {Array} entries - rows from `event_entries` for the same event (with player/commander joined).
 * @returns {Array} standings sorted by points desc, then tiebreakers, then name; each row also carries
 *   `isTop8` (its final position is within the top TOP_FINISH_CUTOFF).
 */
export function computeEventLeaderboard(matches, entries) {
  const byPlayer = new Map();

  for (const entry of entries) {
    byPlayer.set(entry.player_id, {
      entryId: entry.id,
      player: entry.player,
      commander: entry.commander,
      archetype: entry.archetype,
      manualRank: entry.manual_rank ?? null,
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
        entryId: null,
        player: playerObj,
        commander: null,
        archetype: null,
        manualRank: null,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        played: 0,
      });
    }
    return byPlayer.get(playerId);
  };

  // Matches involving each player, kept for the game-win% / opponents'
  // win% tiebreakers below (a bye has no real opponent, so it's excluded
  // from opponent-facing averages, but still counts for the player's own
  // game-win% — a bye is treated as a clean 2-0 per the official rules).
  const matchesByPlayer = new Map();
  function trackMatch(playerId, m) {
    if (!matchesByPlayer.has(playerId)) matchesByPlayer.set(playerId, []);
    matchesByPlayer.get(playerId).push(m);
  }

  for (const m of matches) {
    if (isDrop(m)) continue;

    const p1 = ensure(m.player1_id, m.player1);
    p1.played += 1;
    trackMatch(m.player1_id, m);

    if (isBye(m)) {
      // A bye has no opponent to credit/debit — it's a plain win for player1.
      p1.points += POINTS.win;
      p1.wins += 1;
      continue;
    }

    const p2 = ensure(m.player2_id, m.player2);
    p2.played += 1;
    trackMatch(m.player2_id, m);

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

  function matchWinPct(playerId) {
    const row = byPlayer.get(playerId);
    if (!row || row.played === 0) return MIN_WIN_PCT;
    return Math.max(row.points / (row.played * POINTS.win), MIN_WIN_PCT);
  }

  // Raw game tally (not the floored percentage below) — games won/played
  // across every match, which is what "winrate" actually means: winning a
  // match 2-1 is not the same as winning it 2-0, even though both are a
  // single match win.
  function gameTally(playerId) {
    const pMatches = matchesByPlayer.get(playerId) ?? [];
    let won = 0;
    let total = 0;
    for (const m of pMatches) {
      if (isBye(m)) {
        won += 2;
        total += 2;
        continue;
      }
      const isP1 = m.player1_id === playerId;
      won += isP1 ? m.player1_wins : m.player2_wins;
      total += m.player1_wins + m.draws + m.player2_wins;
    }
    return { won, total };
  }

  // The MTG tiebreaker version of the above floors at MIN_WIN_PCT (a single
  // bad round, or a weak opponent, shouldn't disproportionately tank it) —
  // that floor is specifically a tiebreak convention, not a real statistic,
  // so the *displayed* winrate (row.winRate below) uses the raw tally
  // instead, unfloored.
  function gameWinPct(playerId) {
    const { won, total } = gameTally(playerId);
    return total > 0 ? Math.max(won / total, MIN_WIN_PCT) : MIN_WIN_PCT;
  }

  function opponentIdsOf(playerId) {
    const pMatches = matchesByPlayer.get(playerId) ?? [];
    const opponents = [];
    for (const m of pMatches) {
      if (isBye(m)) continue;
      const oppId = m.player1_id === playerId ? m.player2_id : m.player1_id;
      if (oppId) opponents.push(oppId);
    }
    return opponents;
  }

  function average(ids, fn) {
    return ids.length > 0 ? ids.reduce((sum, id) => sum + fn(id), 0) / ids.length : 0;
  }

  for (const row of byPlayer.values()) {
    const id = row.player?.id;
    const opponents = id ? opponentIdsOf(id) : [];
    const tally = id ? gameTally(id) : { won: 0, total: 0 };
    row.gameWins = tally.won;
    row.gameTotal = tally.total;
    row.winRate = tally.total > 0 ? (tally.won / tally.total) * 100 : null;
    row.gameWinPct = id ? gameWinPct(id) : MIN_WIN_PCT;
    row.opponentsMatchWinPct = average(opponents, matchWinPct);
    row.opponentsGameWinPct = average(opponents, gameWinPct);
  }

  const standings = Array.from(byPlayer.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    // A manual override only settles ties among the entries the admin has
    // actually assigned a rank to; anyone left unranked (Infinity) still
    // sorts by the computed tiebreakers below, among themselves.
    const aManual = a.manualRank ?? Infinity;
    const bManual = b.manualRank ?? Infinity;
    if (aManual !== bManual) return aManual - bManual;

    if (b.opponentsMatchWinPct !== a.opponentsMatchWinPct) return b.opponentsMatchWinPct - a.opponentsMatchWinPct;
    if (b.gameWinPct !== a.gameWinPct) return b.gameWinPct - a.gameWinPct;
    if (b.opponentsGameWinPct !== a.opponentsGameWinPct) return b.opponentsGameWinPct - a.opponentsGameWinPct;
    return (a.player?.name ?? "").localeCompare(b.player?.name ?? "");
  });

  // Not used anywhere yet — exposed so a later feature (a stat, a badge...)
  // can read who placed top 8 without re-deriving it from points/tiebreaks
  // itself. Always computed fresh from the live standings above, never
  // stored, so it can never drift out of sync with match results.
  standings.forEach((row, i) => {
    row.isTop8 = i < TOP_FINISH_CUTOFF;
  });

  return standings;
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
        byPlayer.set(id, { player: row.player, eventScores: [], wins: 0, draws: 0, losses: 0, gameWins: 0, gameTotal: 0 });
      }
      const agg = byPlayer.get(id);
      agg.eventScores.push(score);
      agg.wins += row.wins;
      agg.draws += row.draws;
      agg.losses += row.losses;
      agg.gameWins += row.gameWins;
      agg.gameTotal += row.gameTotal;
    });
  }

  const results = Array.from(byPlayer.values()).map(({ player, eventScores, wins, draws, losses, gameWins, gameTotal }) => {
    const bestScores = [...eventScores].sort((a, b) => b - a).slice(0, BEST_RESULTS_COUNT);
    const fullAttendance = totalEvents > 0 && eventScores.length === totalEvents;
    const points = bestScores.reduce((sum, s) => sum + s, 0) + (fullAttendance ? FULL_ATTENDANCE_BONUS : 0);
    // Game-based, summed across every event in the league — not an average
    // of each event's own winRate%, which would misweight events with
    // fewer games played.
    const winRate = gameTotal > 0 ? (gameWins / gameTotal) * 100 : null;
    return { player, points, eventsPlayed: eventScores.length, fullAttendance, wins, draws, losses, winRate };
  });

  return results.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return (a.player?.name ?? "").localeCompare(b.player?.name ?? "");
  });
}
