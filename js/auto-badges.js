// Computes which players currently hold which auto-assigned badges
// (badges.auto_rule), fresh from live match/league data every time this is
// called — nothing about this is ever stored on a player row, so it can
// never drift out of sync with results. Only the Giocatori page uses this
// (badges show "ONLY in Giocatori tab" per spec), scoped globally — these
// rules are absolute ("the current league", "the last 3 months"), not
// affected by whatever league/event/date filter a visitor has selected.

import { Badges, Leagues, Events, EventEntries, Matches } from "./db.js";
import { computeEventLeaderboard, computeLeaguePoints } from "./leaderboard.js";

const TOP8_STREAK_COUNT = 3;
const TOP8_STREAK_WINDOW_MONTHS = 3;
const MAX_AUTO_BADGES_PER_PLAYER = 2;

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
    }
  }

  const result = new Map();
  for (const [playerId, playerBadges] of grants) {
    const top = [...playerBadges].sort((a, b) => b.priority - a.priority).slice(0, MAX_AUTO_BADGES_PER_PLAYER);
    result.set(
      playerId,
      top.map((b) => ({ id: b.id, name: b.name, icon: b.icon, icon_url: b.icon_url }))
    );
  }
  return result;
}
