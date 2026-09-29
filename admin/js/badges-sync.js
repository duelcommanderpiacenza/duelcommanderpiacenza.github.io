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

import { computeAutoBadgeAssignments } from "../../js/auto-badges.js";
import { computeEventLeaderboard } from "../../js/leaderboard.js";
import { PlayerAutoBadges, EventStandings, Events, fetchEventsResults } from "../../js/db.js";

async function syncBadgeAssignments() {
  const assignments = await computeAutoBadgeAssignments();
  const rows = [];
  for (const [playerId, badges] of assignments) {
    for (const badge of badges) rows.push({ player_id: playerId, badge_id: badge.id });
  }
  await PlayerAutoBadges.replaceAll(rows);
}

// Final standings of every *closed* event (this runs logged in, where open
// events are visible too — those aren't published, so never cached),
// computed exactly as event.html does, from the saved matches.
async function syncEventStandings() {
  const closedIds = (await Events.list()).filter((ev) => !ev.is_open).map((ev) => ev.id);
  const eventsData = await fetchEventsResults(closedIds);
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

export async function syncAutoBadges() {
  const results = await Promise.allSettled([syncBadgeAssignments(), syncEventStandings()]);
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}
