// player.html's league recap, right after the hero: how the league is going
// (or went) for this player — the league in progress, else the latest
// finished one (never a Topdeck series). Option A ("Essenziale") of a
// five-style mockup: a plain card, no band — the league's name with "Vai
// alla lega ›" as a pill; one main row: the position big in the page's
// accent with its movement since the latest event beside it (while the
// league runs — js/history-list.js positionMoveHtml; a finished league's
// winner a 🏆), the points after a thin divider, Migliore / V-S-P / Winrate
// at the right; under it a small pill per stage (its position, "ass." if
// missed, "—" still to play). Not in the league: one line with the link.
// No league at all: nothing (the section stays hidden). No event dates, no
// gap to 1st, no attendance counter (by choice).
import { Leagues, Events, fetchEventsResults } from "./db.js";
import { computeLeaguePoints, previousLeaguePositions } from "./leaderboard.js";
import { positionMoveHtml } from "./history-list.js";
import { escapeHtml } from "./ui.js";
import { sectionLoadingHtml } from "./page-loading.js";
import { enableDragScroll } from "./drag-scroll.js";

const byDate = (a, b) => `${a.event_date ?? ""}T${a.start_time ?? ""}`.localeCompare(`${b.event_date ?? ""}T${b.start_time ?? ""}`);
const stat = (label, value) =>
  `<div class="league-recap-stat"><span class="league-recap-k">${label}</span><span class="league-recap-v">${value}</span></div>`;

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
    const link = `<a class="league-recap-link" href="league.html?id=${league.id}">Vai alla lega <span aria-hidden="true">›</span></a>`;
    const name = `<span class="league-recap-name">${escapeHtml(league.name)}</span>`;

    if (index < 0) {
      el.innerHTML = `
        <div class="league-recap-card league-recap-empty">
          <span>${name} · ${open ? "non ha ancora giocato in questa lega" : "non ha giocato in questa lega"}</span>
          ${link}
        </div>`;
      return;
    }

    const me = standings[index];
    const position = index + 1;
    const before = open ? previousLeaguePositions(eventsData, events, { scheduledEvents: scheduled }) : null;
    const winner = !open && position === 1;
    const played = me.results.filter(Boolean);
    const best = played.length ? `${Math.min(...played.map((r) => r.position))}°` : "—";
    const winRate = me.winRate === null ? "—" : `${me.winRate.toFixed(1)}%`;
    const stage = (i, cls, value, title) =>
      `<li class="league-recap-stage ${cls}" title="${title}"><span>T${i + 1}</span><b>${value}</b></li>`;
    const stages = [
      ...events.map((_, i) => {
        const r = me.results[i];
        return r
          ? stage(i, r.position === 1 ? "is-first" : "is-played", `${r.position}°`, `Tappa ${i + 1}: ${r.position}°, ${r.score} punti`)
          : stage(i, "is-missed", "ass.", `Tappa ${i + 1}: assente`);
      }),
      ...Array.from({ length: scheduled - events.length }, (_, k) =>
        stage(events.length + k, "is-future", "—", `Tappa ${events.length + k + 1}: da giocare`)
      ),
    ].join("");

    el.innerHTML = `
      <div class="league-recap-card">
        <div class="league-recap-top">${name}${link}</div>
        <div class="league-recap-main">
          <div class="league-recap-headline">
            <div class="league-recap-pos">
              <b${winner ? ' title="Campione"' : ""}>${winner ? "🏆" : `${position}°`}</b>${positionMoveHtml(position, before, playerId)}
            </div>
            <div class="league-recap-points"><b>${me.points}</b> punti</div>
          </div>
          <div class="league-recap-stats">
            ${stat("Migliore", best)}
            ${stat("V-S-P", `${me.wins}-${me.losses}-${me.draws}`)}
            ${stat("Winrate", winRate)}
          </div>
        </div>
        <ol class="league-recap-stages">${stages}</ol>
      </div>`;
    // The stages, when they don't all fit: their edges fade while there's
    // more that way (.fade-left / .fade-right), and a mouse drags them
    // sideways like a finger (js/drag-scroll.js, as badges.html's holders).
    enableDragScroll(el.querySelector(".league-recap-stages"));
  } catch (err) {
    // Not fatal: the rest of the page works without it.
    console.error(err);
    el.hidden = true;
    el.innerHTML = "";
  }
}
