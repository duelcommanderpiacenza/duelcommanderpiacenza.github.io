// The "Leghe & Eventi" tab, a board of tiles:
//  - the league in progress as one card: on top a red cover — its name,
//    players / average attendance / matches played, a ring with events
//    played out of those scheduled, a link to its page — and under it its
//    next event (the date as a small calendar sheet, the name, the weekday
//    and how soon, the time big) and its latest one (date, name, players,
//    the results links);
//  - the Topdeck series in progress under it, a plain tile (its numbers);
//  - then "Leghe concluse": one uniform tile per concluded league (the year,
//    the name, events and players — a link to its page), newest first, with
//    the standalone events' tile among them by the date of their latest one
//    (it opens their list: they have no page of their own).
// A tile with nothing to show is left out; the rest close up.

import { Leagues, Events, EventEntries, Matches, EventCounts, LeaguePlayerCounts } from "./db.js";
import { capitalize, escapeHtml, formatDate, formatTime, eventTitle, showError } from "./ui.js";
import { nestedResultsMenu } from "./results-link.js";
import { hidePageLoading } from "./page-loading.js";
import { openInfoDialog } from "./info-dialog.js";
import { countdownHtml, startCountdowns } from "./countdown.js";

const svg = (body, cls = "ev-ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const USERS = svg(
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>'
);

const toDate = (iso) => new Date(`${iso}T00:00:00`);
// "24 ott" — day and short month.
const dayMonth = (iso) => {
  const d = toDate(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}`;
};
const weekday = (iso) => capitalize(toDate(iso).toLocaleDateString("it-IT", { weekday: "long" }));
// A date as a small calendar sheet: the short month over the day.
const calendarHtml = (iso) => {
  const d = toDate(iso);
  return `<span class="ev-cal"><small>${d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</small><b>${d.getDate()}</b></span>`;
};
const year = (iso) => toDate(iso).getFullYear();
const fmtAvg = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const stat = (value, label) => `<div class="ev-stat"><b>${value}</b><span>${label}</span></div>`;

// The page's numbers: players and matches per event, a league's distinct
// players (null: the standalone events together). Counted by the database
// (db.js EventCounts / LeaguePlayerCounts, migration 021) — a few hundred
// rows instead of every entry and match ever; until those views exist, the
// old way: every entry and match downloaded and counted here. `eventsRequest`:
// the page's Events.list() (a promise) — the counts don't wait for it, only
// the old way needs it.
async function loadCounts(eventsRequest) {
  try {
    const [eventRows, leagueRows] = await Promise.all([EventCounts.list(), LeaguePlayerCounts.list()]);
    const byEvent = new Map(eventRows.map((r) => [r.event_id, r]));
    const byLeague = new Map(leagueRows.map((r) => [r.league_id ?? null, r.players]));
    return {
      ofEvent: (id) => byEvent.get(id)?.players ?? 0,
      matchesOf: (id) => byEvent.get(id)?.matches ?? 0,
      ofLeague: (leagueId) => byLeague.get(leagueId ?? null) ?? 0,
    };
  } catch (err) {
    console.warn("event_counts views unavailable, counting from every entry (run migration 021):", err);
  }
  const [entries, matchRows, events] = await Promise.all([
    EventEntries.listPlayersByEvent(),
    Matches.listEventIds(),
    eventsRequest,
  ]);
  const playersByEvent = new Map();
  for (const e of entries) {
    if (!playersByEvent.has(e.event_id)) playersByEvent.set(e.event_id, new Set());
    playersByEvent.get(e.event_id).add(e.player_id);
  }
  // Every match row, byes and drops included (the same count as
  // league.html's "Partite giocate").
  const matchesByEvent = new Map();
  for (const m of matchRows) matchesByEvent.set(m.event_id, (matchesByEvent.get(m.event_id) ?? 0) + 1);
  const leagueOf = new Map(events.map((ev) => [ev.id, ev.league_id ?? null]));
  const byLeague = new Map();
  for (const [eventId, players] of playersByEvent) {
    const key = leagueOf.get(eventId) ?? null;
    if (!byLeague.has(key)) byLeague.set(key, new Set());
    for (const p of players) byLeague.get(key).add(p);
  }
  return {
    ofEvent: (id) => playersByEvent.get(id)?.size ?? 0,
    matchesOf: (id) => matchesByEvent.get(id) ?? 0,
    ofLeague: (leagueId) => byLeague.get(leagueId ?? null)?.size ?? 0,
  };
}

// What a league on the board is: in progress (the real league or the
// Topdeck series), or the latest finished one keeping the main place.
const boardLabel = (league) => (league.is_topdeck ? "Serie Topdeck in corso" : league.is_open ? "Lega in corso" : "Ultima lega");

// Its numbers: players, average attendance, matches (the Topdeck series,
// with no set number of events, also its events played).
function statsHtml(league, { played, players, avg, matches }) {
  return `
      <div class="ev-stats">
        ${stat(`${USERS}${players}`, "Giocatori")}
        ${stat(played ? `${USERS}${fmtAvg(avg)}` : "—", "Media")}
        ${stat(matches, "Partite")}
        ${league.is_topdeck ? stat(played, "Eventi") : ""}
      </div>`;
}

// The board's main league (in progress, or the latest finished one; the
// Topdeck series when there's no real league) as one card: a red cover —
// its label, name, numbers and (not the Topdeck series) the ring, a link
// to the league — and under it its events (`slots`: the next and the
// latest, side by side; stacked on phones).
function mainCardHtml(league, numbers, slots) {
  const total = Math.max(numbers.scheduled, numbers.played);
  return `
    <div class="ev-tile ev-league">
      <a class="ev-league-cover" href="league.html?id=${league.id}">
        <div class="ev-league-text">
          <span class="ev-tile-k">${boardLabel(league)}</span>
          <div class="ev-tile-t">${escapeHtml(league.name)}</div>
          ${statsHtml(league, numbers)}
        </div>
        ${league.is_topdeck ? "" : ringHtml(numbers.played, total)}
      </a>
      ${slots.length ? `<div class="ev-league-foot">${slots.join("")}</div>` : ""}
    </div>`;
}

// The Topdeck series under the main league: a plain tile, its label on a
// light band, its name and numbers (styles.css .ev-board.is-secondary). A
// link to it.
function secondaryTile(league, numbers) {
  return `
    <a class="ev-tile ev-big" href="league.html?id=${league.id}">
      <span class="ev-tile-k">${boardLabel(league)}</span>
      <div class="ev-tile-t">${escapeHtml(league.name)}</div>
      ${statsHtml(league, numbers)}
    </a>`;
}

// The ring of the main league: events played out of those scheduled (the
// Topdeck series has none — no set number of events: its count is a
// number among the others).
function ringHtml(played, total) {
  const ring = 2 * Math.PI * 46;
  const share = total ? played / total : 0;
  return `
        <span class="ev-ring" aria-label="${played} eventi giocati${total ? ` su ${total}` : ""}">
          <svg viewBox="0 0 110 110" aria-hidden="true">
            <circle cx="55" cy="55" r="46" class="ev-ring-track"></circle>
            <circle cx="55" cy="55" r="46" class="ev-ring-fill" stroke-dasharray="${(ring * share).toFixed(1)} ${ring.toFixed(1)}"></circle>
          </svg>
          <span class="ev-ring-label"><span>${played}${total ? `/${total}` : ""}<small>EVENTI</small></span></span>
        </span>`;
}

// One event under the cover: its calendar sheet, then its label, name and
// a line under it, and on the right `side` (the time, or the players and
// results links).
function slotHtml({ cls = "", href, cal, label, name, sub = "", side = "" }) {
  const inner = `
        ${cal}
        <span class="ev-slot-main">
          <span class="ev-tile-k">${label}</span>
          <span class="ev-slot-name">${name}</span>
          ${sub ? `<span class="ev-slot-sub">${sub}</span>` : ""}
        </span>
        ${side ? `<span class="ev-slot-side">${side}</span>` : ""}`;
  return href ? `<a class="ev-slot${cls}" href="${href}">${inner}</a>` : `<div class="ev-slot${cls}">${inner}</div>`;
}

// The next event: a pulsing dot, its name (an unnamed one by its league's),
// the weekday and how soon (js/countdown.js: down to the hours on the day,
// then "in corso"), the start time big on the right. A link to its league
// (the event's own page fills in once it's played).
function nextSlot(ev) {
  return slotHtml({
    cls: " is-next",
    href: ev.league ? `league.html?id=${ev.league.id}` : "",
    cal: calendarHtml(ev.event_date),
    label: '<span class="ev-pulse"></span>Prossimo evento',
    name: escapeHtml(ev.name || ev.league?.name || "Evento"),
    sub: `${weekday(ev.event_date)} · ${countdownHtml(ev)}`,
    side: ev.start_time ? `<span class="ev-slot-time">${formatTime(ev.start_time)}</span>` : "",
  });
}

// A league in progress with no next event scheduled yet: the same slot,
// "Prossimamente", a "?" for its date. A link to the league.
function soonSlot(league) {
  return slotHtml({
    cls: " is-next",
    href: `league.html?id=${league.id}`,
    cal: '<span class="ev-cal"><b>?</b></span>',
    label: '<span class="ev-pulse"></span>Prossimo evento',
    name: "Prossimamente",
  });
}

// The latest event: its name and weekday, its players and the Moxfield /
// Top 8 links (js/results-link.js) on the right. A link to it.
function latestSlot(ev, leagueName, players) {
  return slotHtml({
    href: `event.html?id=${ev.id}`,
    cal: calendarHtml(ev.event_date),
    label: "Ultimo evento",
    name: escapeHtml(ev.name || leagueName || weekday(ev.event_date)),
    sub: weekday(ev.event_date),
    side: `<span class="ev-slot-players">${USERS}${players}</span>${nestedResultsMenu(ev.results_url, ev.decklists_url)}`,
  });
}

function closedTile(league, players) {
  const last = league.events[0]?.event_date;
  const count = league.events.length;
  return `
    <a class="ev-tile" href="league.html?id=${league.id}">
      <span class="ev-tile-k">Conclusa${last ? `<span class="ev-tag">${year(last)}</span>` : ""}</span>
      <div>
        <div class="ev-tile-t">${escapeHtml(league.name)}</div>
        <div class="ev-tile-s">${count} ${count === 1 ? "evento" : "eventi"} · ${USERS}${players}</div>
      </div>
    </a>`;
}

// The standalone events (no page of their own): the latest names on the
// tile, the date of the latest as its tag; it opens the full list.
function standaloneTile(events, players) {
  const last = events[0].event_date;
  const names = events.slice(0, 3).map((ev) => escapeHtml(eventTitle(ev))).join(" · ");
  return `
    <button type="button" class="ev-tile is-standalone" id="events-standalone-open">
      <span class="ev-tile-k">Eventi standalone<span class="ev-tag">${dayMonth(last)} ${year(last)}</span></span>
      <div>
        <div class="ev-tile-t">${names}</div>
        <div class="ev-tile-s">${events.length} ${events.length === 1 ? "evento" : "eventi"} · ${USERS}${players}</div>
      </div>
    </button>`;
}

function openStandaloneList(events, counter) {
  openInfoDialog({
    id: "events-standalone-dialog",
    title: "Eventi standalone",
    bodyHtml: `<div class="ev-list">${events
      .map(
        (ev) => `
      <a class="ev-list-row" href="event.html?id=${ev.id}">
        <span class="ev-list-date">${dayMonth(ev.event_date)} ${year(ev.event_date)}</span>
        <span class="ev-list-name">${escapeHtml(eventTitle(ev))}</span>
        <span class="ev-tile-s">${USERS}${counter.ofEvent(ev.id)}</span>
      </a>`
      )
      .join("")}</div>`,
  });
}

// A board league's name on one line, as big as its room allows: from
// the tile's own size (the stylesheet's — bigger on desktop; on phones the
// main league's from NAME_MAX_PHONE) down to NAME_MIN px, the largest that
// fits beside the ring; still too long at that, it ends in "…". Redone on
// resize (a rotation).
const NAME_MAX_PHONE = 28;
const NAME_MIN = 15;

function fitBigNames(root) {
  for (const el of root.querySelectorAll(":is(.ev-league, .ev-big) .ev-tile-t")) {
    el.style.fontSize = "";
    const main = !el.closest(".is-secondary");
    const start = main && window.innerWidth <= 480 ? NAME_MAX_PHONE : parseFloat(getComputedStyle(el).fontSize);
    for (let size = Math.round(start); size >= NAME_MIN; size -= 1) {
      el.style.fontSize = `${size}px`;
      if (el.scrollWidth <= el.clientWidth) break;
    }
  }
}

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
export async function mount({ signal = new AbortController().signal } = {}) {
  const boardEl = document.getElementById("events-board");
  const archiveSectionEl = document.getElementById("events-archive-section");
  const archiveEl = document.getElementById("events-archive");
  startCountdowns(signal);
  try {
    // One round: the leagues, the events, the upcoming ones and the counts
    // (which don't need the events — see loadCounts).
    const eventsRequest = Events.list();
    const [leagues, allEvents, upcoming, counter] = await Promise.all([
      Leagues.list(),
      eventsRequest,
      Events.listUpcoming().catch((err) => (console.error(err), [])),
      loadCounts(eventsRequest),
    ]);
    if (signal.aborted) return;
    // A still-open event isn't published yet: only the next one is shown
    // (its own tile); everything else counts played (closed) events.
    const played = allEvents
      .filter((ev) => !ev.is_open)
      .sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? ""));

    const eventsOf = (id) => played.filter((ev) => ev.league_id === id);
    const withEvents = leagues.map((l) => ({ ...l, events: eventsOf(l.id) }));
    const current = withEvents.filter((l) => l.is_open && !l.is_topdeck).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    const topdeck = withEvents.filter((l) => l.is_open && l.is_topdeck).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    const standalone = played.filter((ev) => !ev.league_id);
    // No league in progress: the latest finished one (by its latest event)
    // keeps the board's main place — "Ultima lega" on its band, its latest
    // event beside it (no next one) — and leaves the archive.
    const lastLeague = current
      ? null
      : withEvents
          .filter((l) => !l.is_open && !l.is_topdeck && l.events.length)
          .sort((a, b) => (b.events[0].event_date ?? "").localeCompare(a.events[0].event_date ?? ""))[0] ?? null;
    const mainLeague = current ?? lastLeague;

    // The board: a group per league in progress (the real league — or the
    // latest finished one — first, then the Topdeck series) — its tile, its
    // next event, its latest one.
    const groups = [];
    // Each board league's total event count (open ones included, even those
    // hidden from visitors), both asked at once.
    const boardLeagues = [mainLeague, topdeck].filter(Boolean);
    const scheduledCounts = await Promise.all(
      boardLeagues.map((league) => Leagues.eventCount(league.id, allEvents.filter((ev) => ev.league_id === league.id).length))
    );
    if (signal.aborted) return;
    for (const [index, league] of boardLeagues.entries()) {
      const played = league.events.length;
      const attendance = league.events.reduce((sum, ev) => sum + counter.ofEvent(ev.id), 0);
      const numbers = {
        played,
        scheduled: scheduledCounts[index],
        players: counter.ofLeague(league.id),
        avg: played ? attendance / played : 0,
        matches: league.events.reduce((sum, ev) => sum + counter.matchesOf(ev.id), 0),
      };
      // Secondary: the Topdeck series while the main place has a real league
      // (in progress, or the latest finished one) — just its own tile, no
      // events. With no real league at all the series takes that place: the
      // main card, its next / latest event under the cover.
      if (league.is_topdeck && mainLeague) {
        groups.push(`<div class="ev-board is-secondary">${secondaryTile(league, numbers)}</div>`);
        continue;
      }
      const slots = [];
      const next = upcoming.find((ev) => ev.league?.id === league.id);
      // A finished league: no next event to wait for.
      if (league.is_open) slots.push(next ? nextSlot(next) : soonSlot(league));
      if (league.events[0]) slots.push(latestSlot(league.events[0], league.name, counter.ofEvent(league.events[0].id)));
      groups.push(`<div class="ev-board">${mainCardHtml(league, numbers, slots)}</div>`);
    }
    boardEl.innerHTML = groups.join("");
    const boardArea = boardEl.parentElement;
    fitBigNames(boardArea);
    let fitTimer;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(() => fitBigNames(boardArea), 120);
      },
      { signal }
    );
    if (!groups.length && !played.length) {
      boardEl.innerHTML = '<p class="page-empty">Nessuna lega o evento inserito ancora.</p>';
    }

    // Leghe concluse, newest first by their latest event (one without
    // events last), the standalone tile placed among them the same way.
    const archive = withEvents
      .filter((l) => !l.is_open && l !== lastLeague)
      .map((l) => ({ last: l.events[0]?.event_date ?? "", html: closedTile(l, counter.ofLeague(l.id)) }));
    if (standalone.length) {
      archive.push({ last: standalone[0].event_date ?? "", html: standaloneTile(standalone, counter.ofLeague(null)) });
    }
    archive.sort((a, b) => b.last.localeCompare(a.last));
    archiveEl.innerHTML = archive.map((x) => x.html).join("");
    archiveSectionEl.hidden = archive.length === 0;
    document
      .getElementById("events-standalone-open")
      ?.addEventListener("click", () => openStandaloneList(standalone, counter));
  } catch (err) {
    showError(boardEl, err);
  } finally {
    hidePageLoading(signal);
  }
}
