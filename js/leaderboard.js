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

/**
 * The site's winrate (user, 2026-11-22): the official Match-Win Percentage
 * without its 33% floor — match points (win 3, draw 1, loss 0) over the most
 * a player could have had (3 per match), as a percentage. So a draw counts a
 * third of a win (1-1-2 is 41.7%, not 25%), and the event standings'
 * Winrate always follows their Punti. The floor belongs to the tiebreakers
 * only (buildTiebreakers' matchWinPct): on a shown number it would make every
 * record below 33% look the same. Null with no match played. A bye, where a
 * caller counts it, is a win (3 points), as in the official rules.
 */
export function matchWinRate(wins, draws, losses) {
  const played = wins + draws + losses;
  return played > 0 ? ((wins * POINTS.win + draws * POINTS.draw) / (played * POINTS.win)) * 100 : null;
}

/**
 * A matchup's winrate (one deck / archetype against another — Matchups'
 * cells, the archetype page's "Contro gli altri archetipi"): a draw is a draw
 * and doesn't move it (user, 2026-11-22) — wins over wins + losses, so the
 * two sides of a matchup always add up to 100%; only draws: 50%. Null with
 * no match.
 */
export function matchupWinRate(wins, draws, losses) {
  if (wins + losses > 0) return (wins / (wins + losses)) * 100;
  return draws > 0 ? 50 : null;
}

// Standard Magic tournament tiebreaker floor: a player's (or their
// opponents') win percentage is never treated as less than this, so a
// single bad round (or a weak opponent) doesn't disproportionately tank it.
// 0.33 exactly, as the official rules and the tournament software use — not
// 1/3, which left ties the software breaks (an opponent at 1/9 counting
// 33.0% vs one at 3/9 counting 33.3%) for the alphabetical fallback.
const MIN_WIN_PCT = 0.33;

// Tiebreaker percentages are averages of floats, so two mathematically equal
// ones can differ in their last bits depending on the order the opponents
// were summed in (0.33 + 1/3 + 2/3 vs 1/3 + 0.33 + 2/3). Closer than this
// counts as equal, so the next tiebreaker decides, not rounding noise.
const PCT_EPSILON = 1e-9;

// Descending order on a tiebreaker percentage; 0 when equal (see above).
function comparePctDesc(a, b) {
  return Math.abs(b - a) < PCT_EPSILON ? 0 : b - a;
}

// How many of an event's final standings count as a "top 8" finish.
const TOP_FINISH_CUTOFF = 8;

// An event's top 8 (migration 045): `events.top8_after` is how many Swiss
// rounds come before it (null = no top 8), the rounds after them its
// stages — quarterfinals, semifinals, final — between the top 8 of the Swiss
// standings, single elimination. A closed event whose top 8 has no final
// won was split by the players still in (top8SplitPlayers): the standings
// stay as they stood (see computeEventLeaderboard).
export const TOP8_STAGES = ["Quarti", "Semifinali", "Finale"];

/**
 * A round's top 8 stage: 1 quarterfinals, 2 semifinals, 3 final; 0 for a
 * Swiss round (or an event without a top 8). `event`: any row with
 * `top8_after` (null / missing = no top 8).
 */
export function top8Stage(event, round) {
  const after = event?.top8_after;
  if (!after) return 0;
  const stage = (round ?? 1) - after;
  return stage >= 1 ? stage : 0;
}

/** A round's name: "Turno N" for a Swiss round, the stage's for a top 8 one. */
export function roundLabel(event, round) {
  const stage = top8Stage(event, round);
  return stage ? TOP8_STAGES[stage - 1] ?? `Top 8 (${stage})` : `Turno ${round ?? 1}`;
}

/**
 * Who split an event's win: no split is entered — a **closed** event whose
 * top 8 has no final won (user, 2026-11-22) was split at its last stage
 * created by the players still in: the winners of its latest stage played,
 * or all of its 8 when the quarterfinals weren't played. Empty when there's
 * no split (no top 8, still open, or a final won). `event`: with
 * `top8_after` and `is_open`; `standings`: computeEventLeaderboard's.
 */
export function top8SplitPlayers(event, standings) {
  if (!event?.top8_after || event.is_open) return [];
  const best = Math.max(0, ...standings.map((row) => row.bracketReach));
  if (best === TOP8_STAGES.length * 2 + 1) return [];
  if (best === 0) return standings.filter((row) => row.seed <= TOP_FINISH_CUTOFF);
  return standings.filter((row) => row.bracketReach === best);
}

// A top 8 player's result in words, by `bracketReach` (a stage won but the
// next not played yet: that next one).
const TOP8_RESULTS = ["Top 8", "Quarti", "Quarti", "Semifinale", "Semifinale", "Finalista", "Finalista", "Vincitore"];

/**
 * A top 8 player's result: "Vincitore", "Finalista", "Semifinale", "Quarti",
 * or "Vittoria condivisa" for one of `splitPlayers` (top8SplitPlayers') —
 * shown instead of points where the top 8 is listed (event.html's Top 8
 * block, the recap's top 8 screen).
 */
export function top8Result(row, splitPlayers = []) {
  if (splitPlayers.includes(row)) return "Vittoria condivisa";
  return TOP8_RESULTS[row.bracketReach] ?? "Top 8";
}

/**
 * The standard Magic tournament tiebreaker stats (DCI/WPN formulas: Match
 * Win %, Game Win %, Opponents' Match/Game Win %), computed over whatever set
 * of matches is passed in — one event's for the event leaderboard, every
 * event of a league for the league one. Game-basis where the official
 * formula is, so never displayed as this site's own "winrate" (see
 * computeEventLeaderboard's doc).
 * @param {Array} matches - `matches` rows.
 * @returns {{matchWinPct: Function, gameWinPct: Function, opponentsMatchWinPct: Function, opponentsGameWinPct: Function}}
 *   each taking a player id.
 */
function buildTiebreakers(matches) {
  // Per-player match points / rounds played, for Match Win %.
  const records = new Map();
  // Matches involving each player (a bye has no real opponent, so it's
  // excluded from opponent-facing averages, but still counts for the
  // player's own game-win% — a bye is treated as a clean 2-0 per the
  // official rules).
  const matchesByPlayer = new Map();
  function track(playerId, m, points) {
    if (!records.has(playerId)) records.set(playerId, { points: 0, played: 0 });
    const rec = records.get(playerId);
    rec.points += points;
    rec.played += 1;
    if (!matchesByPlayer.has(playerId)) matchesByPlayer.set(playerId, []);
    matchesByPlayer.get(playerId).push(m);
  }

  for (const m of matches) {
    if (isDrop(m)) continue;
    if (isBye(m)) {
      track(m.player1_id, m, POINTS.win);
      continue;
    }
    const outcome = matchRoundOutcome(m);
    track(m.player1_id, m, outcome === "player1" ? POINTS.win : outcome === "draw" ? POINTS.draw : POINTS.loss);
    track(m.player2_id, m, outcome === "player2" ? POINTS.win : outcome === "draw" ? POINTS.draw : POINTS.loss);
  }

  function matchWinPct(playerId) {
    const rec = records.get(playerId);
    if (!rec || rec.played === 0) return MIN_WIN_PCT;
    return Math.max(rec.points / (rec.played * POINTS.win), MIN_WIN_PCT);
  }

  // Floors at MIN_WIN_PCT (a single bad round, or a weak opponent,
  // shouldn't disproportionately tank it) — the official tiebreak
  // convention, tiebreaker-only, never displayed as a real statistic.
  function gameWinPct(playerId) {
    let won = 0;
    let total = 0;
    for (const m of matchesByPlayer.get(playerId) ?? []) {
      if (isBye(m)) {
        won += 2;
        total += 2;
        continue;
      }
      won += m.player1_id === playerId ? m.player1_wins : m.player2_wins;
      total += m.player1_wins + m.draws + m.player2_wins;
    }
    return total > 0 ? Math.max(won / total, MIN_WIN_PCT) : MIN_WIN_PCT;
  }

  function opponentIdsOf(playerId) {
    const opponents = [];
    for (const m of matchesByPlayer.get(playerId) ?? []) {
      if (isBye(m)) continue;
      const oppId = m.player1_id === playerId ? m.player2_id : m.player1_id;
      if (oppId) opponents.push(oppId);
    }
    return opponents;
  }

  function average(ids, fn) {
    return ids.length > 0 ? ids.reduce((sum, id) => sum + fn(id), 0) / ids.length : 0;
  }

  return {
    matchWinPct,
    gameWinPct,
    opponentsMatchWinPct: (playerId) => average(opponentIdsOf(playerId), matchWinPct),
    opponentsGameWinPct: (playerId) => average(opponentIdsOf(playerId), gameWinPct),
  };
}

/**
 * Event leaderboard: 3 pts win / 1 pt draw / 0 pt loss, ties broken by the
 * standard Magic tournament tiebreakers — opponents' match-win %, then own
 * game-win %, then opponents' game-win % — with an optional per-entry
 * manual_rank that overrides those computed tiebreakers when the admin has
 * explicitly reordered a tie group (see admin/js/matches-admin.js).
 *
 * Each row's `winRate` is on a *match* basis (matchWinRate: match points
 * over 3 per match), from the same `wins`/`draws`/`losses` V-S-P counts — a
 * 2-0 and a 2-1 match win both just count as one win. The MTG tournament
 * tiebreakers below (`gameWinPct`/`opponentsGameWinPct`) are a deliberately
 * different, game-basis calculation — that's the official DCI/WPN tiebreak
 * formula itself (Opponents' Match Win %, then Game Win %, then Opponents'
 * Game Win %), not this site's own choice of how to display "winrate", so
 * it stays game-basis regardless of what `winRate` does.
 * A dropped player's round (isDrop) is skipped entirely — no points, no
 * played count, nothing — leaving whatever they'd already earned in earlier
 * rounds untouched.
 *
 * An event with a top 8 (`event.top8_after`, see top8Stage): the points and
 * the tiebreakers come from the Swiss rounds only, its top 8 being their
 * first 8 (`seed`); the top 8's matches still count in V-S-P and winrate
 * (real matches — user, 2026-11-22). Then the bracket decides the order:
 * the further a player went (`bracketReach`: 2 × the latest stage played,
 * +1 if won — the final's winner 7, its loser 6, a semifinal's loser 4, a
 * quarterfinal's 2), the higher, the Swiss order between players who went
 * as far; everyone else after them, in Swiss order. So a stage not played
 * yet — or never, after a split (top8SplitPlayers) — leaves the players still in
 * in their Swiss order: the standings frozen as they stood.
 * `undefeated` (the league's +2) looks at the Swiss rounds only.
 * @param {Array} matches - rows from `matches` for one event.
 * @param {Array} entries - rows from `event_entries` for the same event (with player/commander joined).
 * @param {{top8_after?: number|null}|null} [event] - the event (its top 8); none = Swiss only.
 * @returns {Array} standings sorted by points desc, then tiebreakers, then name — then the top 8's
 *   bracket; each row also carries `isTop8` (its final position is within the top TOP_FINISH_CUTOFF),
 *   `seed` (its Swiss position), `bracketReach` (0 without a top 8 match), `top8Wins` / `top8Losses`
 *   and `undefeated`.
 */
export function computeEventLeaderboard(matches, entries, event = null) {
  const byPlayer = new Map();

  for (const entry of entries) {
    byPlayer.set(entry.player_id, {
      entryId: entry.id,
      player: entry.player,
      commander: entry.commander,
      archetype: entry.archetype,
      manualRank: entry.manual_rank ?? null,
      // League-point adjustment for this event (set from the admin's event
      // leaderboard) — not part of the event's own match points/ordering,
      // only added by computeLeaguePoints.
      bonusPoints: entry.bonus_points ?? 0,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      played: 0,
      swissWins: 0,
      swissNotWon: 0,
      bracketReach: 0,
      top8Wins: 0,
      top8Losses: 0,
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
        bonusPoints: 0,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        played: 0,
        swissWins: 0,
        swissNotWon: 0,
        bracketReach: 0,
        top8Wins: 0,
        top8Losses: 0,
      });
    }
    return byPlayer.get(playerId);
  };

  // A Swiss round's result (for `undefeated`), or how far a top 8 match
  // took the player (`bracketReach`) and its own record (`top8Wins` /
  // `top8Losses` — a top 8 match can't be drawn).
  const tally = (row, stage, won) => {
    if (stage) {
      row.bracketReach = Math.max(row.bracketReach, stage * 2 + (won ? 1 : 0));
      if (won) row.top8Wins += 1;
      else row.top8Losses += 1;
    } else if (won) row.swissWins += 1;
    else row.swissNotWon += 1;
  };
  const swissMatches = [];
  for (const m of matches) {
    if (isDrop(m)) continue;
    const stage = top8Stage(event, m.round);
    if (!stage) swissMatches.push(m);
    // Points from the Swiss rounds only.
    const points = stage ? { win: 0, draw: 0 } : POINTS;

    const p1 = ensure(m.player1_id, m.player1);
    p1.played += 1;

    if (isBye(m)) {
      // A bye has no opponent to credit/debit — it's a plain win for player1.
      p1.points += points.win;
      p1.wins += 1;
      tally(p1, stage, true);
      continue;
    }

    const p2 = ensure(m.player2_id, m.player2);
    p2.played += 1;

    const outcome = matchRoundOutcome(m);
    if (outcome === "player1") {
      p1.points += points.win;
      p1.wins += 1;
      p2.losses += 1;
    } else if (outcome === "player2") {
      p2.points += points.win;
      p2.wins += 1;
      p1.losses += 1;
    } else {
      p1.points += points.draw;
      p2.points += points.draw;
      p1.draws += 1;
      p2.draws += 1;
    }
    tally(p1, stage, outcome === "player1");
    tally(p2, stage, outcome === "player2");
  }

  const tiebreakers = buildTiebreakers(swissMatches);
  for (const row of byPlayer.values()) {
    const id = row.player?.id;
    row.undefeated = row.swissWins > 0 && row.swissNotWon === 0;
    row.winRate = matchWinRate(row.wins, row.draws, row.losses);
    row.gameWinPct = id ? tiebreakers.gameWinPct(id) : MIN_WIN_PCT;
    row.opponentsMatchWinPct = id ? tiebreakers.opponentsMatchWinPct(id) : 0;
    row.opponentsGameWinPct = id ? tiebreakers.opponentsGameWinPct(id) : 0;
  }

  const standings = Array.from(byPlayer.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    // A manual override only settles ties among the entries the admin has
    // actually assigned a rank to; anyone left unranked (Infinity) still
    // sorts by the computed tiebreakers below, among themselves.
    const aManual = a.manualRank ?? Infinity;
    const bManual = b.manualRank ?? Infinity;
    if (aManual !== bManual) return aManual - bManual;

    return (
      comparePctDesc(a.opponentsMatchWinPct, b.opponentsMatchWinPct) ||
      comparePctDesc(a.gameWinPct, b.gameWinPct) ||
      comparePctDesc(a.opponentsGameWinPct, b.opponentsGameWinPct) ||
      (a.player?.name ?? "").localeCompare(b.player?.name ?? "")
    );
  });
  standings.forEach((row, i) => {
    row.seed = i + 1;
  });
  // The top 8's bracket ahead of the Swiss order (a stable sort: the Swiss
  // order stays between players who went as far, and for everyone else).
  standings.sort((a, b) => b.bracketReach - a.bracketReach);

  // Read by js/auto-badges.js's top-8 streak badge — exposed here so it
  // doesn't have to re-derive who placed top 8 from points/tiebreaks
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
// the sum of their best (league's total event count − DISCARDED_RESULTS)
// event scores, plus a flat bonus for having an entry in every event of the
// league. RANK_POINTS[i] is the award for position i+1; any position beyond
// the array falls back to FALLBACK_POSITION_POINTS.
const RANK_POINTS = [20, 17, 14, 14, 11, 11, 11, 11];
const FALLBACK_POSITION_POINTS = 5;
const UNDEFEATED_BONUS = 2;
const FULL_ATTENDANCE_BONUS = 5;
const DISCARDED_RESULTS = 1;

function pointsForPosition(position) {
  return RANK_POINTS[position - 1] ?? FALLBACK_POSITION_POINTS;
}

/**
 * League leaderboard, per the club's official scoring rules.
 *
 * One-off adjustments that don't fit a generic rule (e.g. a bonus limited to
 * one specific tournament) aren't hardcoded here — the admin sets them per
 * player from that event's leaderboard (admin/js/matches-admin.js, stored as
 * the entry's `bonus_points`), and they're added into the player's score for
 * that event before the best-results cap below.
 *
 * The full-attendance bonus is only awarded once the league is closed: while
 * it's still running, "played every event so far" isn't final (a later
 * event can still be missed), so it's never added early — and since this is
 * always computed live from the league's current state, reopening a closed
 * league takes it back out again. `fullAttendance` itself is still reported
 * either way (e.g. to show who's on track).
 *
 * Best-results cap: every player counts at most their best (X −
 * DISCARDED_RESULTS) event scores, X being the league's *total* event count
 * — scheduled-but-not-yet-played ones included, so the same rule holds
 * while the league is open as once it's closed. In practice nothing is
 * dropped until a player has more results than the cap: only someone who
 * plays every one of the X events loses their worst; anyone who missed one
 * keeps all of theirs. Never below 1 (a one-event league counts its result).
 *
 * Ties on points are broken by compareLeagueStandings, then by name.
 *
 * @param {Array<{matches: Array, entries: Array, event?: Object}>} eventsData - one entry per closed event
 *   in the league (`event`: its row, for a top 8 — js/db.js fetchEventsResults given the events).
 * @param {{leagueClosed?: boolean, scheduledEvents?: number}} [options] - leagueClosed: award the
 *   full-attendance bonus. scheduledEvents: the league's total event count, open/future events
 *   included (X above) — defaults to eventsData.length.
 */
export function computeLeaguePoints(eventsData, { leagueClosed = false, scheduledEvents = 0 } = {}) {
  const totalEvents = eventsData.length;
  const countedResults = Math.max(Math.max(scheduledEvents, totalEvents) - DISCARDED_RESULTS, 1);
  const byPlayer = new Map();

  eventsData.forEach(({ matches, entries, event }, eventIndex) => {
    const standings = computeEventLeaderboard(matches, entries, event);
    standings.forEach((row, index) => {
      const id = row.player?.id;
      if (!id) return;

      let score = pointsForPosition(index + 1);
      if (row.undefeated) score += UNDEFEATED_BONUS;
      score += row.bonusPoints;

      if (!byPlayer.has(id)) {
        byPlayer.set(id, { player: row.player, eventScores: [], results: [], placements: [], wins: 0, draws: 0, losses: 0 });
      }
      const agg = byPlayer.get(id);
      agg.eventScores.push(score);
      agg.results[eventIndex] = { position: index + 1, score };
      agg.placements[index] = (agg.placements[index] ?? 0) + 1;
      agg.wins += row.wins;
      agg.draws += row.draws;
      agg.losses += row.losses;
    });
  });

  // Tiebreakers over every match of this league's events only — their Swiss
  // rounds (a top 8's matches aren't scored, see computeEventLeaderboard).
  const tiebreakers = buildTiebreakers(
    eventsData.flatMap(({ matches, event }) => matches.filter((m) => !top8Stage(event, m.round)))
  );

  const results = Array.from(byPlayer.values()).map(({ player, eventScores, results: eventResults, placements, wins, draws, losses }) => {
    const bestScores = [...eventScores].sort((a, b) => b - a).slice(0, countedResults);
    const fullAttendance = totalEvents > 0 && eventScores.length === totalEvents;
    const attendanceBonus = leagueClosed && fullAttendance ? FULL_ATTENDANCE_BONUS : 0;
    const points = bestScores.reduce((sum, s) => sum + s, 0) + attendanceBonus;
    // Match-based, summed across every event in the league — not an average
    // of each event's own winRate%, which would misweight events with
    // fewer matches played.
    const winRate = matchWinRate(wins, draws, losses);
    return {
      player,
      points,
      eventsPlayed: eventScores.length,
      fullAttendance,
      attendanceBonus,
      wins,
      draws,
      losses,
      winRate,
      // placements[i] = how many of the league's events this player
      // finished in position i+1 (sparse: a missing index means 0).
      placements,
      // results[i] = { position, score } in eventsData[i] (sparse: a
      // missing index, an event this player didn't play) — the score
      // before the best-results cap (player.html's league recap).
      results: eventResults,
      matchWinPct: tiebreakers.matchWinPct(player.id),
      gameWinPct: tiebreakers.gameWinPct(player.id),
      opponentsGameWinPct: tiebreakers.opponentsGameWinPct(player.id),
    };
  });

  return results.sort(
    (a, b) => compareLeagueStandings(a, b) || (a.player?.name ?? "").localeCompare(b.player?.name ?? "")
  );
}

/**
 * Each player's league position before the league's latest closed event
 * (by date, then start time) — for the standings' ▲ / ▼ since then
 * (js/history-list.js leaguePosHtml). Computed as the league stood
 * then: still open (no full-attendance bonus), the same X. Null with fewer
 * than two events: nothing before to compare with.
 *
 * @param {Array<{matches: Array, entries: Array}>} eventsData - as computeLeaguePoints's.
 * @param {Array<{event_date: string, start_time?: string}>} events - the events eventsData is for, same order.
 * @param {{scheduledEvents?: number}} [options] - as computeLeaguePoints's.
 * @returns {Map<string, number>|null} player id → position (1-based).
 */
export function previousLeaguePositions(eventsData, events, { scheduledEvents = 0 } = {}) {
  if (eventsData.length < 2) return null;
  const when = (ev) => `${ev?.event_date ?? ""}T${ev?.start_time ?? ""}`;
  let latest = 0;
  events.forEach((ev, i) => {
    if (when(ev) > when(events[latest])) latest = i;
  });
  const before = computeLeaguePoints(
    eventsData.filter((_, i) => i !== latest),
    { scheduledEvents }
  );
  return new Map(before.map((s, i) => [s.player?.id, i + 1]));
}

/**
 * League standings order: points desc, then the tiebreakers — most 1st
 * places across the league's events (every event, including one left out
 * by the best-results cap), then most 2nd places, and so on; then own
 * Match Win %, own Game Win %, Opponents' Game Win % (league matches only).
 * Unlike an event, own Match Win % is meaningful here, since league points
 * come from finishing positions rather than directly from match results.
 * 0 means genuinely tied (only the alphabetical fallback would separate them).
 */
function compareLeagueStandings(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  const positions = Math.max(a.placements.length, b.placements.length);
  for (let i = 0; i < positions; i++) {
    const diff = (b.placements[i] ?? 0) - (a.placements[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return (
    comparePctDesc(a.matchWinPct, b.matchWinPct) ||
    comparePctDesc(a.gameWinPct, b.gameWinPct) ||
    comparePctDesc(a.opponentsGameWinPct, b.opponentsGameWinPct)
  );
}
