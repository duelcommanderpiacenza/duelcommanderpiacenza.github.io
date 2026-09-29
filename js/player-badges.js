// Player badge icons as shown next to a player's name in a table row —
// Giocatori's list, league.html's leaderboard and the Bacheca's league
// standings preview.
import { Players, PlayerAutoBadges } from "./db.js";
import { MAX_AUTO_BADGES_PER_PLAYER } from "./auto-badges.js";
import { badgeTooltipAttrs } from "./ui.js";

/**
 * Player id -> their top MAX_AUTO_BADGES_PER_PLAYER auto badges, highest
 * priority first. Precomputed by admin/js/badges-sync.js whenever an
 * event/league closes (see js/db.js's PlayerAutoBadges) — a plain read here,
 * not the actual (expensive) computation. The stored set is the player's
 * *entire* auto-badge set (player.html shows all of it) — table rows still
 * only show the top few (rows come back in no guaranteed order otherwise).
 * Auto-badge rules are absolute ("the current league", "the last 3
 * months"), not scoped to any page's own filters.
 * @returns {Promise<Map<string, Array>>}
 */
export async function fetchTopAutoBadgesByPlayer() {
  const byPlayer = new Map();
  for (const row of await PlayerAutoBadges.list()) {
    if (!row.badge) continue;
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, []);
    byPlayer.get(row.player_id).push(row.badge);
  }
  for (const [playerId, badges] of byPlayer) {
    byPlayer.set(playerId, badges.sort((a, b) => b.priority - a.priority).slice(0, MAX_AUTO_BADGES_PER_PLAYER));
  }
  return byPlayer;
}

/**
 * For rows whose player comes from an entry's own player embed, which
 * doesn't carry the manual badge slots: fetches Players.list() (badge
 * embed) plus the auto-badge cache, and returns `player -> badges HTML`.
 * Never rejects — if either fetch fails the rows still render, just without
 * (some) badge icons.
 * @returns {Promise<(player: object) => string>}
 */
export async function fetchPlayerBadgesRenderer() {
  const [players, autoBadgesByPlayer] = await Promise.all([
    Players.list().catch((err) => (console.error(err), [])),
    fetchTopAutoBadgesByPlayer().catch((err) => (console.error(err), new Map())),
  ]);
  const playersById = new Map(players.map((p) => [p.id, p]));
  return (player) => (player?.id ? playerBadgesHtml(playersById.get(player.id) ?? player, autoBadgesByPlayer) : "");
}

// Up to 2 manually assigned badges (p.badge1/badge2, from Players.list()'s
// badge embed) plus the auto-assigned ones from fetchTopAutoBadgesByPlayer.
// Hover/focus shows the badge's description (else its name) as a custom
// tooltip (styles.css, js/ui.js's badgeTooltipAttrs) —
// a native `title` attribute can't be restyled by any browser, so this
// builds one from scratch instead, fed by data-tooltip and kept accessible
// via aria-label. Meant to sit as a sibling of the name link (not nested
// inside it) so hovering/clicking a badge icon doesn't behave like part of
// the player-page link.
export function playerBadgesHtml(p, autoBadgesByPlayer) {
  const badges = [p.badge1, p.badge2, ...(autoBadgesByPlayer.get(p.id) ?? [])].filter(Boolean);
  return badges
    .map((b) => {
      const glyph = b.icon_url
        ? `<img src="${b.icon_url}" alt="" class="icon-badge-img badge-icon-box" style="width:1.1em;height:1.1em;">`
        : `<span class="badge-icon-box" style="width:1.1em;height:1.1em;">${b.icon ?? ""}</span>`;
      return `<span class="icon-badge" ${badgeTooltipAttrs(b)} tabindex="0">${glyph}</span>`;
    })
    .join("");
}
