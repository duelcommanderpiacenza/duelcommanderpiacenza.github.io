// The "Leghe & Eventi" tab, a board of tiles:
//  - a group per league in progress (the real league, then the Topdeck
//    series): its tile, big and dark — its name, since when, players /
//    average attendance / matches played, a ring with events played out of
//    those scheduled, a link to its page — and beside it its next event
//    (red: how soon, the date and name, the time big) and its latest one
//    (date, name, players, the results links);
//  - then "Leghe concluse": one uniform tile per concluded league (the year,
//    the name, events and players — a link to its page), newest first, with
//    the standalone events' tile among them by the date of their latest one
//    (it opens their list: they have no page of their own).
// A tile with nothing to show is left out; the rest close up.

import { Leagues, Events, EventEntries, Matches, EventCounts, LeaguePlayerCounts } from "./db.js";
import { escapeHtml, formatDate, formatTime, eventTitle, showError } from "./ui.js";
import { nestedResultsLink } from "./results-link.js";
import { hidePageLoading } from "./page-loading.js";
import { openInfoDialog } from "./info-dialog.js";

const svg = (body, cls = "ev-ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const USERS = svg(
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>'
);

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const toDate = (iso) => new Date(`${iso}T00:00:00`);
// "24 ott" — day and short month.
const dayMonth = (iso) => {
  const d = toDate(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}`;
};
const weekday = (iso) => capitalize(toDate(iso).toLocaleDateString("it-IT", { weekday: "long" }));
// "dom 25 ott" — short weekday (in its own span: phones leave it out,
// styles.css), day and short month.
const shortDate = (iso) =>
  `<span class="ev-date-wd">${toDate(iso).toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")} </span>${dayMonth(iso)}`;
// "oggi" / "domani" / "tra N giorni".
const fromToday = (iso) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((toDate(iso) - today) / 86400000);
  return days <= 0 ? "oggi" : days === 1 ? "domani" : `tra ${days} giorni`;
};
const year = (iso) => toDate(iso).getFullYear();
const fmtAvg = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const stat = (value, label) => `<div class="ev-stat"><b>${value}</b><span>${label}</span></div>`;

// The page's numbers: players and matches per event, a league's distinct
// players (null: the standalone events together). Counted by the database
// (db.js EventCounts / LeaguePlayerCounts, migration 021) — a few hundred
// rows instead of every entry and match ever; until those views exist, the
// old way: every entry and match downloaded and counted here.
async function loadCounts(events) {
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
  const [entries, matchRows] = await Promise.all([EventEntries.listPlayersByEvent(), Matches.listEventIds()]);
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

// A league in progress (the real league, or the Topdeck series): big, its
// label on a red band across the top (styles.css .ev-big), a progress ring
// on the right.
function currentTile(league, played, scheduled, players, avg, matches) {
  const total = Math.max(scheduled, played);
  const ring = 2 * Math.PI * 46;
  const share = total ? played / total : 0;
  const since = league.events.length ? `dal ${formatDate(league.events[league.events.length - 1].event_date)}` : "";
  return `
    <a class="ev-tile ev-big${league.is_topdeck ? " no-ring" : ""}" href="league.html?id=${league.id}">
      <span class="ev-tile-k">${league.is_topdeck ? "Serie Topdeck in corso" : league.is_open ? "Lega in corso" : "Ultima lega"}</span>
      <div class="ev-name-block">
        <div class="ev-tile-t">${escapeHtml(league.name)}</div>
        ${since ? `<div class="ev-since">${since}</div>` : ""}
      </div>
      <div class="ev-stats">
        ${stat(`${USERS}${players}`, "Giocatori")}
        ${stat(played ? `${USERS}${fmtAvg(avg)}` : "—", "Media")}
        ${stat(matches, "Partite")}
        ${league.is_topdeck ? stat(played, "Eventi") : ""}
      </div>
      ${league.is_topdeck ? "" : ringHtml(played, total, share, ring)}
    </a>`;
}

// Touch screens: the main league's tile pinned to the top of the screen,
// collapsing as the page scrolls — its bottom rising with the content (the
// tile keeps its room in the page: nothing below moves; only less of it is
// shown, clip-path), the stats and the ring fading, the name shrinking,
// down to the band, the name and the events count (styles.css
// .ev-board-pinned; back as the page scrolls back up). The tile sits in a
// row of its own just before the board (a sticky element sticks only
// within its parent: inside the board it would leave with it).
function initPinned(pinnedEl, nextEl, signal) {
  const tile = pinnedEl.querySelector(".ev-big");
  const name = tile?.querySelector(".ev-tile-t");
  if (!tile || !name) return;
  const NAME_COMPACT = 20;
  // Room above and below the name's line once collapsed.
  const PAD = 11;
  // The ring's count, collapsed: this much bigger, at the line's right end.
  const COUNT_GROW = 1.35;
  let H = 0;
  let Hc = 0;
  let gap = 0;

  // Sizes, at rest (re-measured on resize): the tile's height; once
  // collapsed, the name moved up right under the band (--name-shift) and
  // shrunk, the tile cut to just around it (the band, the name's line, a
  // little room), and the ring's count moved to that line's right end
  // (--ring-dx / -dy), bigger, its circle gone.
  // The sticky offset (read once, on measuring) and the last values written
  // (written again only when they change: each write restyles the tile).
  let stickTop = 0;
  let last = { p: null, clip: null, stuck: null };
  function measure() {
    tile.style.setProperty("--p", "0");
    stickTop = parseFloat(getComputedStyle(pinnedEl).top) || 0;
    last = { p: null, clip: null, stuck: null };
    const k = Math.min(1, NAME_COMPACT / parseFloat(getComputedStyle(name).fontSize));
    const tr = tile.getBoundingClientRect();
    const nr = name.getBoundingClientRect();
    const band = tile.querySelector(".ev-tile-k")?.getBoundingClientRect();
    const bandBottom = band ? band.bottom - tr.top : 0;
    const lineTop = bandBottom + PAD;
    H = tr.height;
    Hc = Math.min(H, lineTop + nr.height * k + PAD);
    gap = nextEl ? nextEl.getBoundingClientRect().top - tr.bottom : 18;
    tile.style.setProperty("--name-k", String(k));
    tile.style.setProperty("--name-shift", `${lineTop - (nr.top - tr.top)}px`);
    const ring = tile.querySelector(".ev-ring");
    const count = ring?.querySelector(".ev-ring-label > span");
    if (ring && count) {
      const rr = ring.getBoundingClientRect();
      const cr = count.getBoundingClientRect();
      const toX = tr.width - 16 - (cr.width * COUNT_GROW) / 2;
      const toY = lineTop + (nr.height * k) / 2;
      tile.style.setProperty("--ring-dx", `${toX - (rr.left + rr.width / 2 - tr.left)}px`);
      tile.style.setProperty("--ring-dy", `${toY - (rr.top + rr.height / 2 - tr.top)}px`);
      tile.style.setProperty("--count-grow", String(COUNT_GROW));
    }
    update();
  }

  let queued = false;
  function update() {
    queued = false;
    // Where the tile would be if it didn't stick (the next block's top,
    // minus the gap and the tile), and how far the page has scrolled past it.
    const naturalTop = nextEl ? nextEl.getBoundingClientRect().top - gap - H : stickTop;
    const past = Math.max(0, stickTop - naturalTop);
    const visible = Math.max(Hc, H - past);
    const p = H > Hc ? Math.min(1, past / (H - Hc)) : 0;
    const pText = p.toFixed(3);
    const clipText = `${(H - visible).toFixed(1)}px`;
    if (pText !== last.p) tile.style.setProperty("--p", (last.p = pText));
    if (clipText !== last.clip) tile.style.setProperty("--clip", (last.clip = clipText));
    if (past > 0 !== last.stuck) pinnedEl.classList.toggle("is-stuck", (last.stuck = past > 0));
  }

  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", queue, { passive: true, signal });
  window.addEventListener("resize", () => requestAnimationFrame(measure), { signal });
  measure();
}

// The ring of a league in progress: events played out of those scheduled
// (the Topdeck series has none — no set number of events: its count is a
// number among the others).
function ringHtml(played, total, share, ring) {
  return `
      <span class="ev-ring" aria-label="${played} eventi giocati${total ? ` su ${total}` : ""}">
        <svg viewBox="0 0 110 110" aria-hidden="true">
          <circle cx="55" cy="55" r="46" class="ev-ring-track"></circle>
          <circle cx="55" cy="55" r="46" class="ev-ring-fill" stroke-dasharray="${(ring * share).toFixed(1)} ${ring.toFixed(1)}"></circle>
        </svg>
        <span class="ev-ring-label"><span>${played}${total ? `/${total}` : ""}<small>EVENTI</small></span></span>
      </span>`;
}

// The next event: red — "Prossimo evento · tra N giorni", its date (with the
// weekday) and name (an unnamed one by its league's) on the left, its start
// time big on the right. A link to its league when it has one (the event's
// own page fills in once it's played).
function nextTile(ev) {
  const inner = `
      <span class="ev-tile-k"><span class="ev-pulse"></span>Prossimo evento<span class="ev-k-when"> · ${fromToday(ev.event_date)}</span></span>
      <div class="ev-event-row">
        <div class="ev-event-main">
          <div class="ev-date">${shortDate(ev.event_date)}</div>
          <div class="ev-event-name">${escapeHtml(ev.name || ev.league?.name || "Evento")}</div>
        </div>
        ${ev.start_time ? `<div class="ev-event-side"><span class="ev-event-time">${formatTime(ev.start_time)}</span></div>` : ""}
      </div>`;
  return ev.league
    ? `<a class="ev-tile ev-next" href="league.html?id=${ev.league.id}">${inner}</a>`
    : `<div class="ev-tile ev-next">${inner}</div>`;
}

// The latest event: its date, its name (an unnamed one by its league's).
// A league in progress with no next event scheduled yet: the same tile,
// "Prossimamente" in place of the date. A link to the league.
function soonTile(league) {
  return `
    <a class="ev-tile ev-next is-soon" href="league.html?id=${league.id}">
      <span class="ev-tile-k"><span class="ev-pulse"></span>Prossimo evento</span>
      <div>
        <div class="ev-date">Prossimamente</div>
      </div>
    </a>`;
}

// The latest event: its date and name on the left, its players and the
// Moxfield / Top 8 links (js/results-link.js) on the right. A link to it.
function latestTile(ev, leagueName, players) {
  return `
    <a class="ev-tile" href="event.html?id=${ev.id}">
      <span class="ev-tile-k">Ultimo evento</span>
      <div class="ev-event-row">
        <div class="ev-event-main">
          <div class="ev-date">${shortDate(ev.event_date)}</div>
          <div class="ev-event-name">${escapeHtml(ev.name || leagueName || weekday(ev.event_date))}</div>
        </div>
        <div class="ev-event-side">
          <span class="ev-event-players">${USERS}${players}</span>
          ${nestedResultsLink(ev.results_url, ev.decklists_url)}
        </div>
      </div>
    </a>`;
}

// One league in progress as its own group: its big tile on the left, its
// next event (or "Prossimamente", when none is scheduled yet) and latest
// event beside it (the next one alone, before any is played, fills the
// space). The real league is the main group (two
// rows, dark); the Topdeck series a secondary one (`secondary`: one row,
// light — styles.css .ev-board.is-secondary), under it.
function groupHtml(bigHtml, sideTiles, secondary = false) {
  const side = sideTiles.length === 1 ? sideTiles[0].replace('class="ev-tile', 'class="ev-tile ev-tall') : sideTiles.join("");
  const cls = ["ev-board", sideTiles.length ? "" : "is-alone", secondary ? "is-secondary" : ""].filter(Boolean).join(" ");
  return `<div class="${cls}">${bigHtml}${side}</div>`;
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

// A league in progress's name on one line, as big as its room allows: from
// the tile's own size (the stylesheet's — bigger on desktop; on phones the
// main league's from NAME_MAX_PHONE) down to NAME_MIN px, the largest that
// fits beside the ring; still too long at that, it ends in "…". Redone on
// resize (a rotation).
const NAME_MAX_PHONE = 28;
const NAME_MIN = 15;

function fitBigNames(root) {
  for (const el of root.querySelectorAll(".ev-big .ev-tile-t")) {
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
  try {
    const [leagues, allEvents, upcoming] = await Promise.all([
      Leagues.list(),
      Events.list(),
      Events.listUpcoming().catch((err) => (console.error(err), [])),
    ]);
    const counter = await loadCounts(allEvents);
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
    // Touch screens: the main league's tile in a row of its own, pinned
    // (initPinned).
    const pin = document.documentElement.classList.contains("nav-mobile");
    let pinned = "";
    for (const league of [mainLeague, topdeck].filter(Boolean)) {
      const scheduled = await Leagues.eventCount(league.id, allEvents.filter((ev) => ev.league_id === league.id).length);
      const attendance = league.events.reduce((sum, ev) => sum + counter.ofEvent(ev.id), 0);
      const big = currentTile(
        league,
        league.events.length,
        scheduled,
        counter.ofLeague(league.id),
        league.events.length ? attendance / league.events.length : 0,
        league.events.reduce((sum, ev) => sum + counter.matchesOf(ev.id), 0)
      );
      // Secondary: the Topdeck series while the main place has a real league
      // (in progress, or the latest finished one) — just its own tile (one
      // row), no event tiles. With no real league at all the series takes
      // that place: the main look, its next / latest event beside it.
      const secondary = league.is_topdeck && Boolean(mainLeague);
      const side = [];
      if (!secondary) {
        const next = upcoming.find((ev) => ev.league?.id === league.id);
        // A finished league: no next event to wait for.
        if (league.is_open) side.push(next ? nextTile(next) : soonTile(league));
        if (league.events[0]) side.push(latestTile(league.events[0], league.name, counter.ofEvent(league.events[0].id)));
      }
      if (pin && !secondary && !pinned) {
        pinned = `<div class="ev-board is-alone ev-board-pinned">${big}</div>`;
        if (side.length) groups.push(groupHtml("", side, false));
      } else {
        groups.push(groupHtml(big, side, secondary));
      }
    }
    boardEl.innerHTML = groups.join("");
    if (pinned) boardEl.insertAdjacentHTML("beforebegin", pinned);
    const boardArea = boardEl.parentElement;
    fitBigNames(boardArea);
    if (pinned) initPinned(boardEl.previousElementSibling, boardEl, signal);
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
