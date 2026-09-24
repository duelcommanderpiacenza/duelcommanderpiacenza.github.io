// Recomputes every player's auto-badge assignments (js/auto-badges.js) and
// fully replaces the precomputed player_badges_auto table with the result —
// called after closing an event or a league (see app.js, events-admin.js,
// standalone-events-admin.js, leagues-admin.js), the only moments the
// underlying match/standings data that those rules depend on actually
// changes. Public pages then just read that table instead of running the
// (expensive, several-rules-refetch-overlapping-data) live computation
// themselves on every page view.

import { computeAutoBadgeAssignments } from "../../js/auto-badges.js";
import { PlayerAutoBadges } from "../../js/db.js";

export async function syncAutoBadges() {
  const assignments = await computeAutoBadgeAssignments();
  const rows = [];
  for (const [playerId, badges] of assignments) {
    for (const badge of badges) rows.push({ player_id: playerId, badge_id: badge.id });
  }
  await PlayerAutoBadges.replaceAll(rows);
}
