// Computes which players currently hold which auto-assigned badges
// (badges.auto_rule), fresh from live match/league data every time this is
// called. Not run on every page view any more — admin/js/badges-sync.js
// calls this once whenever an event/league closes and caches the *full*
// result (no MAX_AUTO_BADGES_PER_PLAYER cap applied here any more — see
// its own comment below) into player_badges_auto (js/db.js's
// PlayerAutoBadges), which is what public pages actually read. Scoped
// globally — these rules are absolute ("the current league", "the last 3
// months"), not affected by whatever league/event/date filter a visitor
// has selected.

import { Badges, Leagues, Events, EventEntries, Matches } from "./db.js";
import { computeEventLeaderboard, computeLeaguePoints, isBye, isDrop, matchRoundOutcome } from "./leaderboard.js";

const TOP8_STREAK_COUNT = 3;
const TOP8_STREAK_WINDOW_MONTHS = 3;
// How many auto badges show per player — applied by js/players-page.js at
// display time (sliced off the front of the priority-sorted array this
// module returns), not baked into what gets stored. player.html shows a
// player's *entire* auto-badge set instead, uncapped.
export const MAX_AUTO_BADGES_PER_PLAYER = 3;
// A tiny sample shouldn't win either stats-based badge below — a single
// lucky win is a meaningless 100% winrate, and a handful of matches
// shouldn't out-rank nobody-else-qualifies for "most played" either.
const MIN_MATCHES_FOR_STATS_BADGES = 10;
const MIN_COMMANDERS_FOR_DIVERSITY_BADGE = 5;
const COMPLETIST_EVENT_COUNT = 10;

async function fetchLeagueEventsData(leagueId) {
  const events = await Events.listByLeague(leagueId);
  return Promise.all(
    events.map(async (ev) => {
      const [entries, matches] = await Promise.all([EventEntries.listByEvent(ev.id), Matches.listByEvent(ev.id)]);
      return { entries, matches };
    })
  );
}

// Leagues are run one at a time (only one real league can be open), so the
// most recently *created* closed real league is, in practice, the most
// recently concluded one.
async function latestClosedRealLeague(leagues) {
  return leagues.find((l) => !l.is_topdeck && !l.is_open) ?? null;
}

async function leagueWinnerPlayerId(leagues) {
  const league = await latestClosedRealLeague(leagues);
  if (!league) return null;
  const results = computeLeaguePoints(await fetchLeagueEventsData(league.id));
  return results[0]?.player?.id ?? null;
}

const LEAGUE_RANK_POSITION = { league_rank_1: 1, league_rank_2: 2, league_rank_3: 3 };

async function leagueRankPlayerId(leagues, rule) {
  const league = leagues.find((l) => !l.is_topdeck && l.is_open) ?? null;
  if (!league) return null;
  const results = computeLeaguePoints(await fetchLeagueEventsData(league.id));
  return results[LEAGUE_RANK_POSITION[rule] - 1]?.player?.id ?? null;
}

// Every player who top-8'd in each of their last 3 attended events (any
// league/standalone), provided all 3 fall within the last 3 months.
async function top8StreakPlayerIds() {
  const [events, allEntries, allMatches] = await Promise.all([Events.list(), EventEntries.listAll(), Matches.listAll()]);
  const eventById = new Map(events.map((e) => [e.id, e]));

  const entriesByEvent = new Map();
  for (const e of allEntries) {
    if (!entriesByEvent.has(e.event_id)) entriesByEvent.set(e.event_id, []);
    entriesByEvent.get(e.event_id).push(e);
  }
  const matchesByEvent = new Map();
  for (const m of allMatches) {
    if (!matchesByEvent.has(m.event_id)) matchesByEvent.set(m.event_id, []);
    matchesByEvent.get(m.event_id).push(m);
  }

  const eventsByPlayer = new Map();
  for (const e of allEntries) {
    const ev = eventById.get(e.event_id);
    if (!ev?.event_date) continue;
    if (!eventsByPlayer.has(e.player_id)) eventsByPlayer.set(e.player_id, []);
    eventsByPlayer.get(e.player_id).push(ev);
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - TOP8_STREAK_WINDOW_MONTHS);
  const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  const standingsCache = new Map(); // event id -> computeEventLeaderboard result
  function standingsFor(eventId) {
    if (!standingsCache.has(eventId)) {
      standingsCache.set(eventId, computeEventLeaderboard(matchesByEvent.get(eventId) ?? [], entriesByEvent.get(eventId) ?? []));
    }
    return standingsCache.get(eventId);
  }

  const qualifying = [];
  for (const [playerId, playerEvents] of eventsByPlayer) {
    const latest = [...playerEvents].sort((a, b) => (a.event_date < b.event_date ? 1 : -1)).slice(0, TOP8_STREAK_COUNT);
    if (latest.length < TOP8_STREAK_COUNT) continue;
    if (latest.some((ev) => ev.event_date < cutoffIso)) continue;
    const allTop8 = latest.every((ev) => standingsFor(ev.id).find((row) => row.player?.id === playerId)?.isTop8);
    if (allTop8) qualifying.push(playerId);
  }
  return qualifying;
}

// Used by both match-based stats badges below (match-basis winrate and
// total matches played) — each one calls this independently, so both
// badges being configured at once means two separate fetches of the
// matches table, same trade-off the existing league-rank rules already
// make (each doing its own fetch) in exchange for keeping each rule
// self-contained.
async function playerMatchStats() {
  const allMatches = await Matches.listAll();
  const stats = new Map(); // player id -> { played, wins }

  function ensure(playerId) {
    if (!stats.has(playerId)) stats.set(playerId, { played: 0, wins: 0 });
    return stats.get(playerId);
  }

  for (const m of allMatches) {
    // A drop isn't a match played, win, or loss — excluded entirely, same
    // as everywhere else a match gets tallied.
    if (isDrop(m)) continue;
    const p1 = ensure(m.player1_id);
    p1.played += 1;
    if (isBye(m)) {
      // A bye is a plain win, same treatment as the official tiebreaker
      // rules elsewhere (js/leaderboard.js).
      p1.wins += 1;
      continue;
    }
    const p2 = ensure(m.player2_id);
    p2.played += 1;
    const outcome = matchRoundOutcome(m);
    if (outcome === "player1") p1.wins += 1;
    else if (outcome === "player2") p2.wins += 1;
  }
  return stats;
}

// The player(s) tied for the highest value of valueFn among everyone who
// clears minSample — an empty array (not an error) when nobody does yet.
function playersWithMaxValue(entries, valueFn, minSample, sampleFn) {
  let max = -Infinity;
  let winners = [];
  for (const [playerId, data] of entries) {
    if (sampleFn(data) < minSample) continue;
    const value = valueFn(data);
    if (value > max) {
      max = value;
      winners = [playerId];
    } else if (value === max) {
      winners.push(playerId);
    }
  }
  return winners;
}

async function highestWinratePlayerIds() {
  const stats = await playerMatchStats();
  return playersWithMaxValue(
    stats,
    (s) => (s.played > 0 ? s.wins / s.played : -1),
    MIN_MATCHES_FOR_STATS_BADGES,
    (s) => s.played
  );
}

async function mostMatchesPlayedPlayerIds() {
  const stats = await playerMatchStats();
  return playersWithMaxValue(stats, (s) => s.played, MIN_MATCHES_FOR_STATS_BADGES, (s) => s.played);
}

// Distinct commanders piloted — counts a commander whether it was played as
// the primary or as the partner/background, same convention as the
// commander detail page's own "played this commander" definition.
async function mostCommandersPlayedPlayerIds() {
  const entries = await EventEntries.listAll();
  const commandersByPlayer = new Map(); // player id -> Set of commander ids

  for (const e of entries) {
    if (!commandersByPlayer.has(e.player_id)) commandersByPlayer.set(e.player_id, new Set());
    const set = commandersByPlayer.get(e.player_id);
    if (e.commander_id) set.add(e.commander_id);
    if (e.partner_commander_id) set.add(e.partner_commander_id);
  }

  return playersWithMaxValue(
    commandersByPlayer,
    (set) => set.size,
    MIN_COMMANDERS_FOR_DIVERSITY_BADGE,
    (set) => set.size
  );
}

// Every player with an entry in *all* of the latest COMPLETIST_EVENT_COUNT
// events club-wide — any league, Topdeck, or standalone, whichever mix is
// most recent by date — not scoped to one league like the rank/winner rules
// above. Nobody qualifies until that many events exist yet at all. Any
// number of players can independently qualify (a threshold check, not a
// ranking), same shape as top8StreakPlayerIds above.
async function completistPlayerIds() {
  // A still-open (including future) event has no visible entries at all yet
  // — left in here, it would always count as zero participants and make
  // the "latest 10" intersection permanently empty for as long as it stays
  // open, so it's excluded the same way every other "how many events" count
  // on the public site now is.
  const events = (await Events.list()).filter((ev) => !ev.is_open); // newest-first already
  if (events.length < COMPLETIST_EVENT_COUNT) return [];
  const recentEvents = events.slice(0, COMPLETIST_EVENT_COUNT);
  const entries = await EventEntries.listByEvents(recentEvents.map((e) => e.id));

  const playerIdsByEvent = new Map(); // event id -> Set of player ids
  for (const e of entries) {
    if (!playerIdsByEvent.has(e.event_id)) playerIdsByEvent.set(e.event_id, new Set());
    playerIdsByEvent.get(e.event_id).add(e.player_id);
  }

  let qualifying = null;
  for (const ev of recentEvents) {
    const playerIds = playerIdsByEvent.get(ev.id) ?? new Set();
    qualifying = qualifying === null ? new Set(playerIds) : new Set([...qualifying].filter((id) => playerIds.has(id)));
    if (qualifying.size === 0) break;
  }
  return qualifying ? Array.from(qualifying) : [];
}

/**
 * @returns {Promise<Map<string, Array<{id: string, name: string, icon: string}>>>}
 *   player id -> up to MAX_AUTO_BADGES_PER_PLAYER badges, highest priority first.
 */
export async function computeAutoBadgeAssignments() {
  const badges = await Badges.list();
  const ruleBadges = badges.filter((b) => b.auto_rule);
  if (ruleBadges.length === 0) return new Map();

  const leagues = await Leagues.list();
  const grants = new Map(); // player id -> badge rows

  function grant(playerId, badge) {
    if (!playerId) return;
    if (!grants.has(playerId)) grants.set(playerId, []);
    grants.get(playerId).push(badge);
  }

  for (const badge of ruleBadges) {
    if (badge.auto_rule === "league_winner") {
      grant(await leagueWinnerPlayerId(leagues), badge);
    } else if (badge.auto_rule in LEAGUE_RANK_POSITION) {
      grant(await leagueRankPlayerId(leagues, badge.auto_rule), badge);
    } else if (badge.auto_rule === "top8_streak") {
      for (const playerId of await top8StreakPlayerIds()) grant(playerId, badge);
    } else if (badge.auto_rule === "highest_winrate") {
      for (const playerId of await highestWinratePlayerIds()) grant(playerId, badge);
    } else if (badge.auto_rule === "most_matches_played") {
      for (const playerId of await mostMatchesPlayedPlayerIds()) grant(playerId, badge);
    } else if (badge.auto_rule === "most_commanders_played") {
      for (const playerId of await mostCommandersPlayedPlayerIds()) grant(playerId, badge);
    } else if (badge.auto_rule === "completionist") {
      for (const playerId of await completistPlayerIds()) grant(playerId, badge);
    }
  }

  const result = new Map();
  for (const [playerId, playerBadges] of grants) {
    // Sorted (highest priority first), not sliced — the cap is a
    // players-page.js display concern now, not something baked into what
    // gets computed/stored.
    const sorted = [...playerBadges].sort((a, b) => b.priority - a.priority);
    result.set(
      playerId,
      sorted.map((b) => ({ id: b.id, name: b.name, icon: b.icon, icon_url: b.icon_url, priority: b.priority }))
    );
  }
  return result;
}
