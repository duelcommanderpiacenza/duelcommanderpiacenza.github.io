// The achievements earned by playing (js/achievements.js, source "results"):
// who reached what, at which level, on which date. Pure computation, no DOM —
// run by the admin's sync (admin/js/badges-sync.js) over every closed event,
// which stores the rows in player_achievements (migration 028), so the pages
// just read a player's few rows.
//
// The events are walked in date order, so each level is dated by the event
// that reached it. Counted like the rest of the site: a match won is a round
// won — a bye counts for Vittorie (as on the card and player.html's tiles)
// but isn't a "real" win or match (Prima vittoria, Imbattuto, Maratoneta,
// Specchio); a drop never counts. Presenze / Vittorie / Podio / Collezione /
// Campione count exactly as the card's cosmetics (js/card-progress.js), so
// a card effect and its achievement always agree. Leagues: real ones only —
// a Topdeck series never counts.

import { computeEventLeaderboard, computeLeaguePoints, isBye, isDrop, matchRoundOutcome } from "./leaderboard.js";
import { BIG_EVENT_MIN_PLAYERS } from "./card-progress.js";
import { ACHIEVEMENTS } from "./achievements.js";

const TIERS = new Map(ACHIEVEMENTS.filter((a) => a.tiers).map((a) => [a.key, a.tiers]));
const ARCHETYPE_COUNT = 5;
const MARATHON_MATCHES = 100;
const LEAGUE_TOP = 8;
// Pioniere: the first recorded events don't count — there "first seen" only
// means "first recorded" (the same warm-up as the commanders' "Nuovo" badge).
const PIONEER_WARM_UP_MONTHS = 1;

const eventKey = (ev) => `${ev.event_date ?? ""}T${ev.start_time ?? ""}_${ev.id}`;
const monthIndex = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/**
 * @param {Array<{id, event_date, start_time, league_id, league?: {is_open, is_topdeck}}>} events
 *   - every closed event (js/db.js Events.list, filtered).
 * @param {Array<{entries: Array, matches: Array}>} eventsData - their results, same order
 *   (fetchEventsResults, full rows: the entries' commanders carry their colours).
 * @param {Map<string, number>} scheduledByLeague - each real league's total event count
 *   (Leagues.eventCount), for computeLeaguePoints' best-results cap.
 * @returns {Array<{player_id, key, level, value, unlocked_at}>}
 */
export function computeAchievements(events, eventsData, scheduledByLeague = new Map()) {
  const order = events.map((ev, i) => ({ ev, data: eventsData[i] })).sort((a, b) => eventKey(a.ev).localeCompare(eventKey(b.ev)));

  // Each real league's closed events, in date order — for its leader before
  // an event (Ammazzagiganti) and, once closed, its final standings.
  const leagueEvents = new Map(); // league id -> [{ ev, data }]
  for (const item of order) {
    const league = item.ev.league;
    if (!item.ev.league_id || !league || league.is_topdeck) continue;
    if (!leagueEvents.has(item.ev.league_id)) leagueEvents.set(item.ev.league_id, []);
    leagueEvents.get(item.ev.league_id).push(item);
  }
  const leaguePoints = (leagueId, items, leagueClosed) =>
    computeLeaguePoints(
      items.map((it) => it.data),
      { leagueClosed, scheduledEvents: scheduledByLeague.get(leagueId) ?? leagueEvents.get(leagueId).length }
    );

  const players = new Map();
  const player = (id) => {
    if (!players.has(id)) {
      players.set(id, {
        events: 0,
        wins: 0,
        realMatches: 0,
        eventsWon: 0,
        bigTop8s: 0,
        leaguesWon: 0,
        pairs: new Set(),
        pairEvents: new Map(),
        archetypes: new Set(),
        colors: new Set(),
        months: new Set(),
        bestStreak: 0,
        leagues: new Set(),
        got: new Map(), // key -> { level, value, date }
      });
    }
    return players.get(id);
  };
  const reach = (p, key, date, level = 1) => {
    const had = p.got.get(key);
    if (!had || had.level < level) p.got.set(key, { level, value: had?.value ?? null, date });
  };
  // A tiered one: its level from the count, and the count kept (the
  // progress toward the next level; a locked one shows none).
  const tier = (p, key, value, date) => {
    const level = TIERS.get(key).filter((t) => value >= t).length;
    if (level) reach(p, key, date, level);
    const got = p.got.get(key);
    if (got) got.value = value;
  };

  const seenCommanders = new Set();
  const firstDate = order.find((it) => it.ev.event_date)?.ev.event_date ?? null;
  const pioneerFrom = firstDate ? monthIndex(firstDate) + PIONEER_WARM_UP_MONTHS : Infinity;

  for (const { ev, data } of order) {
    const date = ev.event_date ?? new Date().toISOString().slice(0, 10);
    const { entries, matches } = data;
    const deckOf = new Map(); // player id -> sorted commander ids, for Specchio

    // --- Entries: presence, commanders, archetypes, colours ---
    const newCommanders = new Set();
    for (const e of entries) {
      for (const id of [e.commander_id, e.partner_commander_id]) if (id && !seenCommanders.has(id)) newCommanders.add(id);
    }
    for (const e of entries) {
      const p = player(e.player_id);
      p.events += 1;
      reach(p, "debutto", date);
      tier(p, "presenze", p.events, date);

      if (e.commander_id) {
        const pair = `${e.commander_id}_${e.partner_commander_id ?? ""}`;
        p.pairs.add(pair);
        tier(p, "collezione", p.pairs.size, date);
        p.pairEvents.set(pair, (p.pairEvents.get(pair) ?? 0) + 1);
        tier(p, "fedele", Math.max(...p.pairEvents.values()), date);
        deckOf.set(e.player_id, [e.commander_id, e.partner_commander_id].filter(Boolean).sort().join("+"));
      }
      if (e.partner_commander_id) reach(p, "coppia", date);
      if (e.archetype) {
        p.archetypes.add(e.archetype);
        if (p.archetypes.size >= ARCHETYPE_COUNT) reach(p, "tuttofare", date);
      }

      const identities = [e.commander, e.partner_commander].filter(Boolean).map((c) => c.color_identity);
      if (identities.length && identities.every((ci) => ci === "")) reach(p, "incolore", date);
      for (const ci of identities) for (const c of ci ?? "") p.colors.add(c);
      if ("WUBRG".split("").every((c) => p.colors.has(c))) reach(p, "arcobaleno", date);

      if (ev.event_date) {
        const m = monthIndex(ev.event_date);
        p.months.add(m);
        let streak = 1;
        while (p.months.has(m - streak)) streak += 1;
        p.bestStreak = Math.max(p.bestStreak, streak);
        tier(p, "fedelissimo", p.bestStreak, date);
        if (m >= pioneerFrom && [e.commander_id, e.partner_commander_id].some((id) => id && newCommanders.has(id))) reach(p, "pioniere", date);
      }

      if (leagueEvents.has(ev.league_id)) {
        p.leagues.add(ev.league_id);
        tier(p, "veterano", p.leagues.size, date);
      }
    }
    for (const id of newCommanders) seenCommanders.add(id);

    // --- Matches ---
    // The league's leader before this event (its earlier closed events).
    let leaderBefore = null;
    const leagueItems = leagueEvents.get(ev.league_id);
    if (leagueItems) {
      const before = leagueItems.slice(0, leagueItems.findIndex((it) => it.ev.id === ev.id));
      if (before.length) leaderBefore = leaguePoints(ev.league_id, before, false)[0]?.player?.id ?? null;
    }
    const firstRound = Math.min(...matches.map((m) => m.round ?? Infinity));
    const inEvent = new Map(); // player id -> { realWins, lostFirst }
    const mine = (id) => {
      if (!inEvent.has(id)) inEvent.set(id, { realWins: 0, lostFirst: false });
      return inEvent.get(id);
    };
    for (const m of matches) {
      if (isDrop(m)) continue;
      if (isBye(m)) {
        const p = player(m.player1_id);
        p.wins += 1;
        tier(p, "vittorie", p.wins, date);
        continue;
      }
      const p1 = player(m.player1_id);
      const p2 = player(m.player2_id);
      for (const p of [p1, p2]) {
        p.realMatches += 1;
        if (p.realMatches >= MARATHON_MATCHES) reach(p, "maratoneta", date);
      }
      const outcome = matchRoundOutcome(m);
      if (outcome === "draw") continue;
      const [winnerId, loserId] = outcome === "player1" ? [m.player1_id, m.player2_id] : [m.player2_id, m.player1_id];
      const winner = player(winnerId);
      winner.wins += 1;
      tier(winner, "vittorie", winner.wins, date);
      reach(winner, "prima_vittoria", date);
      mine(winnerId).realWins += 1;
      if (m.round === firstRound) mine(loserId).lostFirst = true;
      const deck = deckOf.get(winnerId);
      if (deck && deck === deckOf.get(loserId)) reach(winner, "specchio", date);
      if (leaderBefore && loserId === leaderBefore) reach(winner, "ammazzagiganti", date);
    }

    // --- Final standings ---
    const big = entries.length >= BIG_EVENT_MIN_PLAYERS;
    computeEventLeaderboard(matches, entries).forEach((row, index) => {
      const id = row.player?.id;
      if (!id) return;
      const p = player(id);
      const stats = inEvent.get(id) ?? { realWins: 0, lostFirst: false };
      if (row.losses === 0 && stats.realWins > 0) reach(p, "imbattuto", date);
      if (index === 0) {
        p.eventsWon += 1;
        tier(p, "primo_posto", p.eventsWon, date);
        if (row.losses === 0 && row.draws === 0 && row.wins > 0) reach(p, "perfetto", date);
      }
      if (big && row.isTop8) {
        p.bigTop8s += 1;
        tier(p, "podio", p.bigTop8s, date);
        reach(p, "top8", date);
        if (stats.lostFirst) reach(p, "rimonta", date);
      }
    });

    // --- A closed league's last event: its final standings ---
    if (leagueItems && !ev.league.is_open && leagueItems[leagueItems.length - 1].ev.id === ev.id) {
      leaguePoints(ev.league_id, leagueItems, true).forEach((row, index) => {
        const id = row.player?.id;
        if (!id) return;
        const p = player(id);
        if (index === 0) {
          p.leaguesWon += 1;
          tier(p, "campione", p.leaguesWon, date);
        }
        if (index < LEAGUE_TOP) reach(p, "in_cima_lega", date);
        if (row.fullAttendance) reach(p, "presenza_completa", date);
      });
    }
  }

  const rows = [];
  for (const [playerId, p] of players) {
    for (const [key, got] of p.got) {
      rows.push({ player_id: playerId, key, level: got.level, value: TIERS.has(key) ? got.value : null, unlocked_at: got.date });
    }
  }
  return rows;
}
