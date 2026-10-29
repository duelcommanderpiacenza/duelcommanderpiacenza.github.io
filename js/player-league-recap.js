// player.html's league recap, right after the hero: how the league is going
// (or went) for this player — the league in progress, else the latest
// finished one (never a Topdeck series). Three levels, nothing else (since
// 2026-10-29 — it had a "Vai alla lega" pill, a Migliore / V-S-P / Winrate
// block and "T1"-labelled stage pills): the whole card a link to the league
// (its name, a chevron); the position big in the page's accent with its
// movement since the latest event beside it (while the league runs —
// js/history-list.js positionMoveHtml; a finished league's winner a 🏆),
// then the points over the record and winrate, small; on the right (under
// it when narrow) the stages as a row of discs — its position in each,
// solid for a win, dashed when missed, faint still to play (details on
// hover). The best result is the stages' own job, not a number of its own.
// Not in the league, or no league at all: nothing (the section stays
// hidden). No event dates, no gap to 1st, no attendance counter (by choice).
import { Leagues, Events, fetchEventsResults } from "./db.js";
import { computeLeaguePoints, previousLeaguePositions } from "./leaderboard.js";
import { positionMoveHtml } from "./history-list.js";
import { escapeHtml } from "./ui.js";
import { sectionLoadingHtml } from "./page-loading.js";

const byDate = (a, b) => `${a.event_date ?? ""}T${a.start_time ?? ""}`.localeCompare(`${b.event_date ?? ""}T${b.start_time ?? ""}`);
const CHEVRON =
  '<svg class="league-recap-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

export async function renderPlayerLeagueRecap(el, playerId, { signal }) {
  el.hidden = false;
  el.innerHTML = `<div class="league-recap-card is-loading">${sectionLoadingHtml(2)}</div>`;
  try {
    const [openLeague, leagues] = await Promise.all([Leagues.getOpen(), Leagues.list()]);
    const league = openLeague ?? leagues.find((l) => !l.is_open && !l.is_topdeck) ?? null;
    if (signal.aborted) return;
    if (!league) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const [leagueEvents, count] = await Promise.all([Events.listByLeague(league.id), Leagues.eventCount(league.id, null)]);
    if (signal.aborted) return;
    // Played = closed, oldest first (a stage's number is its place here).
    const events = leagueEvents.filter((ev) => !ev.is_open).sort(byDate);
    const scheduled = Math.max(count ?? leagueEvents.length, events.length);
    const eventsData = await fetchEventsResults(events.map((ev) => ev.id));
    if (signal.aborted) return;

    const open = league.is_open;
    const standings = computeLeaguePoints(eventsData, { leagueClosed: !open, scheduledEvents: scheduled });
    const index = standings.findIndex((s) => s.player?.id === playerId);
    if (index < 0) {
      // Never played in it: nothing, like with no league at all.
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const me = standings[index];
    const position = index + 1;
    const before = open ? previousLeaguePositions(eventsData, events, { scheduledEvents: scheduled }) : null;
    const winner = !open && position === 1;
    const winRate = me.winRate === null ? "" : ` · ${me.winRate.toFixed(1)}% winrate`;
    const stage = (cls, value, label) =>
      `<li class="league-recap-stage ${cls}" title="${label}" aria-label="${label}">${value}</li>`;
    const stages = [
      ...events.map((_, i) => {
        const r = me.results[i];
        return r
          ? stage(r.position === 1 ? "is-first" : "is-played", `${r.position}°`, `Tappa ${i + 1}: ${r.position}°, ${r.score} punti`)
          : stage("is-missed", "", `Tappa ${i + 1}: assente`);
      }),
      ...Array.from({ length: scheduled - events.length }, (_, k) =>
        stage("is-future", "", `Tappa ${events.length + k + 1}: da giocare`)
      ),
    ].join("");

    el.innerHTML = `
      <a class="league-recap-card" href="league.html?id=${league.id}">
        <div class="league-recap-top"><span class="league-recap-name">${escapeHtml(league.name)}</span>${CHEVRON}</div>
        <div class="league-recap-main">
          <div class="league-recap-pos">
            <b${winner ? ' title="Campione"' : ""}>${winner ? "🏆" : `${position}°`}</b>${positionMoveHtml(position, before, playerId)}
          </div>
          <div class="league-recap-points">
            <span><b>${me.points}</b> punti</span>
            <span class="league-recap-record" title="Vittorie-Sconfitte-Pareggi">${me.wins}-${me.losses}-${me.draws}${winRate}</span>
          </div>
          <ol class="league-recap-stages" aria-label="Tappe">${stages}</ol>
        </div>
      </a>`;
  } catch (err) {
    // Not fatal: the rest of the page works without it.
    console.error(err);
    el.hidden = true;
    el.innerHTML = "";
  }
}
