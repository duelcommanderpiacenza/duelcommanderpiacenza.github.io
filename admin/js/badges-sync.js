// Recomputes every player's auto-badge assignments (js/auto-badges.js) and
// fully replaces the precomputed player_badges_auto table with the result —
// called after closing or reopening an event, creating a league (which
// closes the previous one) or opening/closing a league,
// deleting an event or league (see app.js, events-admin.js,
// standalone-events-admin.js, leagues-admin.js), and saving a badge
// (badges-admin.js) — the only moments the published match/standings data
// (or the rules themselves) actually change. Public pages then just read that table instead of running the
// (expensive, several-rules-refetch-overlapping-data) live computation
// themselves on every page view.

//
// It also rebuilds the other derived cache, event_standings (every closed
// event's final standings, read by player.html) — same triggers, since the
// same changes are what alter them. The two run independently: a failure in
// one (e.g. the event_standings table not created yet on this DB) doesn't
// stop the other. The first run after event_standings is created fills it
// for every event already in the DB — nothing to migrate by hand.

//
// And a third: player_progress (js/card-progress.js — the numbers behind the
// player card's cosmetics), from the same closed-event results, which are
// downloaded once and shared by both.
//
// And a fourth: the commanders' "Nuovo" badge (commanders.is_new, migration
// 027), from the same results and the events' dates.
//
// And a fifth: the achievements earned by playing (player_achievements,
// migration 028 — js/achievement-progress.js), from the same results, the
// events' dates and leagues. If the table doesn't exist yet on this DB, only
// this step fails.

import { computeAutoBadgeAssignments, closedLeagueWinners } from "../../js/auto-badges.js";
import { showToast } from "./toast.js";
import { computeEventLeaderboard } from "../../js/leaderboard.js";
import { computeCardProgress } from "../../js/card-progress.js";
import { computeAchievements } from "../../js/achievement-progress.js";
import { PlayerAutoBadges, EventStandings, PlayerProgress, PlayerAchievements, Commanders, Events, Leagues, fetchEventsResults } from "../../js/db.js";

async function syncBadgeAssignments() {
  const assignments = await computeAutoBadgeAssignments();
  const rows = [];
  for (const [playerId, badges] of assignments) {
    for (const badge of badges) rows.push({ player_id: playerId, badge_id: badge.id });
  }
  await PlayerAutoBadges.replaceAll(rows);
}

// Every *closed* event's entries + matches (this runs logged in, where open
// events are visible too — those aren't published, so never cached).
async function loadClosedResults() {
  const closed = (await Events.list()).filter((ev) => !ev.is_open);
  const closedIds = closed.map((ev) => ev.id);
  return { closed, closedIds, closedDates: closed.map((ev) => ev.event_date), eventsData: await fetchEventsResults(closedIds) };
}

// The commanders' "Nuovo" badge: those whose first appearance in a closed
// event (as the commander or the partner) falls within NEW_COMMANDER_MONTHS
// before the latest closed event — counted from that event, not from today,
// so the badge holds still between events. And not within that long after
// the very first recorded event: before then "first seen" only means "first
// recorded" (the site's history starts somewhere), not new to the meta.
const NEW_COMMANDER_MONTHS = 1;

// YYYY-MM-DD `months` calendar months after (or, negative, before) `iso`.
function shiftMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function syncNewCommanders({ closedDates, eventsData }) {
  const dates = closedDates.filter(Boolean).sort();
  const latest = dates[dates.length - 1];
  const ids = [];
  if (latest) {
    const windowStart = shiftMonths(latest, -NEW_COMMANDER_MONTHS);
    const historyWarmUp = shiftMonths(dates[0], NEW_COMMANDER_MONTHS);
    const fromIso = windowStart > historyWarmUp ? windowStart : historyWarmUp;
    const firstSeen = new Map(); // commander id -> earliest date
    eventsData.forEach(({ entries }, i) => {
      const date = closedDates[i];
      if (!date) return;
      for (const e of entries) {
        for (const id of [e.commander_id, e.partner_commander_id]) {
          if (id && (!firstSeen.has(id) || date < firstSeen.get(id))) firstSeen.set(id, date);
        }
      }
    });
    for (const [id, date] of firstSeen) if (date >= fromIso) ids.push(id);
  }
  try {
    await Commanders.setNew(ids);
  } catch (err) {
    // Migration 027 not run on this database yet (no is_new column:
    // Postgres' 42703) — nothing to update; the other caches still are.
    if (err?.code === "42703") return console.warn("commanders.is_new missing: run migration 027", err);
    throw err;
  }
}

// Final standings of every closed event, computed exactly as event.html
// does, from the saved matches.
async function syncEventStandings({ closedIds, eventsData }) {
  const rows = [];
  eventsData.forEach(({ entries, matches }, i) => {
    computeEventLeaderboard(matches, entries).forEach((s, index) => {
      if (!s.player?.id) return;
      rows.push({
        event_id: closedIds[i],
        player_id: s.player.id,
        position: index + 1,
        points: s.points,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
      });
    });
  });
  await EventStandings.replaceAll(rows);
}

// Each player's progress (events, wins, big top 8s, commanders, leagues won).
async function syncPlayerProgress({ eventsData }) {
  const leagueWinners = await closedLeagueWinners(await Leagues.list());
  await PlayerProgress.replaceAll(computeCardProgress(eventsData, leagueWinners));
}

// Every player's achievements earned by playing — dated by the event that
// reached each level. Each real league's total event count first (its
// best-results cap, as on league.html).
async function syncPlayerAchievements({ closed, eventsData }) {
  const leagueIds = [...new Set(closed.filter((ev) => ev.league_id && ev.league && !ev.league.is_topdeck).map((ev) => ev.league_id))];
  const counts = await Promise.all(
    leagueIds.map((id) => Leagues.eventCount(id, closed.filter((ev) => ev.league_id === id).length))
  );
  const scheduledByLeague = new Map(leagueIds.map((id, i) => [id, counts[i]]));
  await PlayerAchievements.replaceAll(computeAchievements(closed, eventsData, scheduledByLeague));
}

async function runSync() {
  const closedResults = loadClosedResults();
  const results = await Promise.allSettled([
    syncBadgeAssignments(),
    closedResults.then(syncEventStandings),
    closedResults.then(syncPlayerProgress),
    closedResults.then(syncNewCommanders),
    closedResults.then(syncPlayerAchievements),
  ]);
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}

// --- Running it ------------------------------------------------------------------
//
// Callers fire and forget it (the "Salvato." message comes first), but it
// takes several seconds — and leaving or reloading the admin page meanwhile
// cuts it off, leaving the caches unchanged (or, between a table's delete
// and its insert, empty). So it shows its progress (one of the admin's
// notifications, js/toast.js) and the browser asks before leaving while it runs.
// And it never runs twice at once: two overlapping runs (closing then
// reopening an event, quickly) would interleave their delete-all /
// insert-all on the same tables — one failing on duplicate rows, the final
// content possibly the older one. A request while it runs is queued: one
// more full run right after, from the data as it is then.

let current = null; // the run in progress (its queued rerun included)
let queued = false;
let statusToast = null;

const STATUS_TEXT = {
  running: "Aggiornamento di badge e statistiche… non chiudere la pagina",
  done: "Badge e statistiche aggiornati",
  error: "Aggiornamento di badge e statistiche non riuscito (dettagli nella console)",
};

// Its progress as one of the admin's notifications (js/toast.js): a
// spinning one while it runs, turned into "aggiornati" (or the error) at
// the end, gone a few seconds later.
function showStatus(state) {
  const type = state === "running" ? "running" : state === "done" ? "ok" : "error";
  if (statusToast && state !== "running") {
    statusToast.update(STATUS_TEXT[state], type);
    statusToast = null;
    return;
  }
  if (!statusToast) statusToast = showToast(STATUS_TEXT[state], type);
}

window.addEventListener("beforeunload", (e) => {
  if (!current) return;
  e.preventDefault();
  e.returnValue = "";
});

// On the admin's opening: the sync run once by itself if the achievements
// have never been computed (player_achievements empty — just after
// migration 028, before any event was closed or reopened), so they cover
// every past result at once rather than waiting for the next change. Never
// in the way: a failure (e.g. the table not there yet) is only logged.
export async function syncIfAchievementsMissing() {
  try {
    if ((await PlayerAchievements.count()) > 0) return;
    if (!(await Events.list()).some((ev) => !ev.is_open)) return;
    await syncAutoBadges();
  } catch (err) {
    console.error(err);
  }
}

export function syncAutoBadges() {
  if (current) {
    queued = true;
    return current;
  }
  current = (async () => {
    showStatus("running");
    try {
      do {
        queued = false;
        await runSync();
      } while (queued);
      showStatus("done");
    } catch (err) {
      showStatus("error");
      throw err;
    } finally {
      current = null;
    }
  })();
  return current;
}
