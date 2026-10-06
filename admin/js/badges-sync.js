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

import { computeAutoBadgeAssignments, closedLeagueWinners } from "../../js/auto-badges.js";
import { computeEventLeaderboard } from "../../js/leaderboard.js";
import { computeCardProgress } from "../../js/card-progress.js";
import { PlayerAutoBadges, EventStandings, PlayerProgress, Events, Leagues, fetchEventsResults } from "../../js/db.js";

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
  const closedIds = (await Events.list()).filter((ev) => !ev.is_open).map((ev) => ev.id);
  return { closedIds, eventsData: await fetchEventsResults(closedIds) };
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

async function runSync() {
  const closedResults = loadClosedResults();
  const results = await Promise.allSettled([
    syncBadgeAssignments(),
    closedResults.then(syncEventStandings),
    closedResults.then(syncPlayerProgress),
  ]);
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
}

// --- Running it ------------------------------------------------------------------
//
// Callers fire and forget it (the "Salvato." message comes first), but it
// takes several seconds — and leaving or reloading the admin page meanwhile
// cuts it off, leaving the caches unchanged (or, between a table's delete
// and its insert, empty). So it shows its progress (a small status bar,
// admin.css .sync-status) and the browser asks before leaving while it runs.
// And it never runs twice at once: two overlapping runs (closing then
// reopening an event, quickly) would interleave their delete-all /
// insert-all on the same tables — one failing on duplicate rows, the final
// content possibly the older one. A request while it runs is queued: one
// more full run right after, from the data as it is then.

let current = null; // the run in progress (its queued rerun included)
let queued = false;
let statusEl = null;
let hideTimer = null;

const STATUS_TEXT = {
  running: "Aggiornamento di badge e statistiche… non chiudere la pagina",
  done: "Badge e statistiche aggiornati",
  error: "Aggiornamento di badge e statistiche non riuscito (dettagli nella console)",
};

function showStatus(state) {
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.className = "sync-status";
    statusEl.setAttribute("role", "status");
    document.body.append(statusEl);
  }
  clearTimeout(hideTimer);
  statusEl.dataset.state = state;
  statusEl.textContent = STATUS_TEXT[state];
  statusEl.hidden = false;
  if (state !== "running") hideTimer = setTimeout(() => (statusEl.hidden = true), state === "error" ? 8000 : 3000);
}

window.addEventListener("beforeunload", (e) => {
  if (!current) return;
  e.preventDefault();
  e.returnValue = "";
});

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
