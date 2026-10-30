// The "Leghe & Eventi" tab: two tabs (js/tabs.js), "In corso" and
// "Archivio" (option D1, "Schede", of a mockup, 2026-10-30):
//  - In corso: the league in progress as one white card — "Lega" (no
//    status chip: the tab says it), its name, players / average / matches
//    in small, a ring with events played out of those scheduled on their
//    right, a link to its page — with its next event beside it (under it on phones: the date as a
//    small calendar sheet, the name, the weekday and how soon, the time big);
//    the Topdeck series in progress a step down, one plain row under it (its
//    name, next event, events played, players). With no real league in
//    progress the series takes the card;
//  - Archivio: one uniform tile per concluded league (the year, the name,
//    events and players — a link to its page), newest first, with the
//    standalone events' tile among them by the date of their latest one (it
//    opens their list: they have no page of their own).
// Only one of the two with anything in it: no tabs, just that one.

import { Leagues, Events, EventEntries, Matches, EventCounts, LeaguePlayerCounts } from "./db.js";
import { capitalize, escapeHtml, formatTime, eventTitle, leagueRingHtml, showError } from "./ui.js";
import { initTabs } from "./tabs.js";
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
// "mar 3 nov" — short weekday, day and short month.
const shortDate = (iso) => {
  const d = toDate(iso);
  const short = (opts) => d.toLocaleDateString("it-IT", opts).replace(".", "");
  return `${short({ weekday: "short" })} ${d.getDate()} ${short({ month: "short" })}`;
};
const fmtAvg = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const CHEVRON = svg('<path d="m9 18 6-6-6-6"></path>', "ev-chev");

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

// The league card: on the left (a link to the league) "Lega" — or "Serie
// Topdeck" when the series holds the card — the name, players / average /
// matches in small, and on the right of them the ring: events played out
// of those scheduled (the series, with no set number of events: "N eventi
// giocati" under the name instead); then (on its right, under it on
// phones) `slot`, its next event.
function mainCardHtml(league, { played, scheduled, players, avg, matches }, slot) {
  const total = Math.max(scheduled, played);
  return `
    <div class="ev-tile ev-league">
      <a class="ev-league-main" href="league.html?id=${league.id}">
        <span class="ev-league-text">
          <span class="ev-tile-k">${league.is_topdeck ? "Serie Topdeck" : "Lega"}</span>
          <span class="ev-tile-t">${escapeHtml(league.name)}</span>
          ${league.is_topdeck ? `<span class="ev-league-played"><b>${played}</b> ${played === 1 ? "evento giocato" : "eventi giocati"}</span>` : ""}
          <span class="ev-league-nums">
            <span>${USERS}${players}</span>
            <span>Media ${played ? fmtAvg(avg) : "—"}</span>
            <span>${matches} ${matches === 1 ? "partita" : "partite"}</span>
          </span>
        </span>
        ${league.is_topdeck ? "" : leagueRingHtml(played, total)}
      </a>
      ${slot}
    </div>`;
}

// The Topdeck series under the league card, a step down: one plain row —
// "Serie Topdeck", its name, its next event ("mar 3 nov, 21:00") and events
// played in small; its players and an arrow on the right. A link to it.
function minorRowHtml(league, { played, players }, next) {
  const when = next ? `Prossimo ${shortDate(next.event_date)}${next.start_time ? `, <b>${formatTime(next.start_time)}</b>` : ""} · ` : "";
  return `
    <a class="ev-tile ev-minor" href="league.html?id=${league.id}">
      <span class="ev-minor-text">
        <span class="ev-tile-k">Serie Topdeck</span>
        <span class="ev-tile-t">${escapeHtml(league.name)}</span>
        <span class="ev-tile-s">${when}${played} ${played === 1 ? "evento" : "eventi"}</span>
      </span>
      <span class="ev-slot-players">${USERS}${players}</span>
      ${CHEVRON}
    </a>`;
}

// The card's next event: its calendar sheet, then its label, name and a line
// under it, and on the right `side` (the time).
function slotHtml({ href, cal, name, sub = "", side = "" }) {
  return `
      <a class="ev-slot is-next" href="${href}">
        ${cal}
        <span class="ev-slot-main">
          <span class="ev-tile-k">Prossimo evento</span>
          <span class="ev-slot-name">${name}</span>
          ${sub ? `<span class="ev-slot-sub">${sub}</span>` : ""}
        </span>
        ${side ? `<span class="ev-slot-side">${side}</span>` : ""}
      </a>`;
}

// The next event: its name (an unnamed one by its league's), the weekday and
// how soon (js/countdown.js: down to the hours on the day, then "in corso"),
// the start time big on the right. A link to its league (the event's own
// page fills in once it's played).
function nextSlot(ev, league) {
  return slotHtml({
    href: `league.html?id=${league.id}`,
    cal: calendarHtml(ev.event_date),
    name: escapeHtml(ev.name || league.name || "Evento"),
    sub: `${weekday(ev.event_date)} · ${countdownHtml(ev)}`,
    side: ev.start_time ? `<span class="ev-slot-time">${formatTime(ev.start_time)}</span>` : "",
  });
}

// None scheduled yet: the same slot, "Prossimamente", a "?" for its date.
function soonSlot(league) {
  return slotHtml({
    href: `league.html?id=${league.id}`,
    cal: '<span class="ev-cal"><b>?</b></span>',
    name: "Prossimamente",
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

// The league card's name on one line, as big as its room allows: from its
// size in the stylesheet down to NAME_MIN px; still too long at that, it
// ends in "…". Redone on resize (a rotation).
const NAME_MIN = 15;

function fitBigNames(root) {
  for (const el of root.querySelectorAll(".ev-league .ev-tile-t")) {
    el.style.fontSize = "";
    const start = parseFloat(getComputedStyle(el).fontSize);
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
  const archiveEl = document.getElementById("events-archive");
  const tabsEl = document.querySelector(".ev-tabs");
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
    // (on the card); everything else counts played (closed) events.
    const played = allEvents
      .filter((ev) => !ev.is_open)
      .sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? ""));

    const eventsOf = (id) => played.filter((ev) => ev.league_id === id);
    const withEvents = leagues.map((l) => ({ ...l, events: eventsOf(l.id) }));
    const newest = (list) => list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;
    const current = newest(withEvents.filter((l) => l.is_open && !l.is_topdeck));
    const topdeck = newest(withEvents.filter((l) => l.is_open && l.is_topdeck));
    const standalone = played.filter((ev) => !ev.league_id);
    // The card: the league in progress — or, with none, the Topdeck series;
    // the series a row under it while a real league holds the card.
    const main = current ?? topdeck;
    const minor = current ? topdeck : null;

    const numbersOf = (league) => {
      const count = league.events.length;
      const attendance = league.events.reduce((sum, ev) => sum + counter.ofEvent(ev.id), 0);
      return {
        played: count,
        players: counter.ofLeague(league.id),
        avg: count ? attendance / count : 0,
        matches: league.events.reduce((sum, ev) => sum + counter.matchesOf(ev.id), 0),
      };
    };
    const nextOf = (league) => upcoming.find((ev) => ev.league?.id === league.id);
    const board = [];
    if (main) {
      // A real league's total event count (open ones included, even those
      // hidden from visitors), for its ring.
      const scheduled = main.is_topdeck
        ? 0
        : await Leagues.eventCount(main.id, allEvents.filter((ev) => ev.league_id === main.id).length);
      if (signal.aborted) return;
      const next = nextOf(main);
      board.push(mainCardHtml(main, { ...numbersOf(main), scheduled }, next ? nextSlot(next, main) : soonSlot(main)));
    }
    if (minor) board.push(minorRowHtml(minor, numbersOf(minor), nextOf(minor)));
    boardEl.innerHTML = board.join("");
    fitBigNames(boardEl);
    let fitTimer;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(() => fitBigNames(boardEl), 120);
      },
      { signal }
    );

    // The archive: the concluded leagues, newest first by their latest event
    // (one without events last), the standalone tile placed among them the
    // same way.
    const archive = withEvents
      .filter((l) => !l.is_open)
      .map((l) => ({ last: l.events[0]?.event_date ?? "", html: closedTile(l, counter.ofLeague(l.id)) }));
    if (standalone.length) {
      archive.push({ last: standalone[0].event_date ?? "", html: standaloneTile(standalone, counter.ofLeague(null)) });
    }
    archive.sort((a, b) => b.last.localeCompare(a.last));
    archiveEl.innerHTML = archive.map((x) => x.html).join("");
    document
      .getElementById("events-standalone-open")
      ?.addEventListener("click", () => openStandaloneList(standalone, counter));

    // The tabs, each with its count. Only one with anything in it: no tabs,
    // that one alone (initTabs opens the first tab not hidden); neither: the
    // empty message, in the first.
    const [currentTab, archiveTab] = tabsEl.querySelectorAll(".profile-tab");
    currentTab.querySelector(".ev-tab-count").textContent = board.length;
    archiveTab.querySelector(".ev-tab-count").textContent = archive.length;
    if (!board.length && !archive.length) {
      boardEl.innerHTML = '<p class="page-empty">Nessuna lega o evento inserito ancora.</p>';
    }
    currentTab.hidden = !board.length && archive.length > 0;
    archiveTab.hidden = !archive.length;
    tabsEl.hidden = !board.length || !archive.length;
    initTabs(tabsEl);
  } catch (err) {
    showError(boardEl, err);
  } finally {
    hidePageLoading(signal);
  }
}
