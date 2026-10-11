// The "Leghe & Eventi" tab, a board of tiles:
//  - a group per league in progress (the real league, then the Topdeck
//    series): its tile, big and dark — its name, since when, players /
//    average attendance / matches played, a ring with events played out of
//    those scheduled, a link to its page — and beside it its next event
//    (red, the date big, its name, weekday / time / how soon) and its
//    latest one (date, name, players);
//  - then "Leghe concluse": one uniform tile per concluded league (the year,
//    the name, events and players — a link to its page), newest first, with
//    the standalone events' tile among them by the date of their latest one
//    (it opens their list: they have no page of their own).
// A tile with nothing to show is left out; the rest close up.

import { Leagues, Events, EventEntries, Matches } from "./db.js";
import { escapeHtml, formatDate, formatTime, eventTitle, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { openInfoDialog } from "./info-dialog.js";

const svg = (body, cls = "ev-ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const USERS = svg(
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>'
);
const CLOCK = svg('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>');

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const toDate = (iso) => new Date(`${iso}T00:00:00`);
// "24 ott" — day and short month.
const dayMonth = (iso) => {
  const d = toDate(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}`;
};
const weekday = (iso) => capitalize(toDate(iso).toLocaleDateString("it-IT", { weekday: "long" }));
const year = (iso) => toDate(iso).getFullYear();
const daysUntil = (iso) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((toDate(iso) - today) / 86400000);
};
const fmtAvg = (n) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const stat = (value, label) => `<div class="ev-stat"><b>${value}</b><span>${label}</span></div>`;

// Players per event, and the distinct players of a set of events.
function playerCounter(entries) {
  const byEvent = new Map();
  for (const e of entries) {
    if (!byEvent.has(e.event_id)) byEvent.set(e.event_id, new Set());
    byEvent.get(e.event_id).add(e.player_id);
  }
  return {
    ofEvent: (id) => byEvent.get(id)?.size ?? 0,
    distinct: (events) => {
      const all = new Set();
      for (const ev of events) for (const p of byEvent.get(ev.id) ?? []) all.add(p);
      return all.size;
    },
  };
}

// A league in progress (the real league, or the Topdeck series): big and
// dark, a progress ring on the right.
function currentTile(league, played, scheduled, players, avg, matches) {
  const total = Math.max(scheduled, played);
  const ring = 2 * Math.PI * 46;
  const share = total ? played / total : 0;
  const since = league.events.length ? `dal ${formatDate(league.events[league.events.length - 1].event_date)}` : "";
  return `
    <a class="ev-tile ev-big${league.is_topdeck ? " no-ring" : ""}" href="league.html?id=${league.id}">
      <span class="ev-tile-k">${league.is_topdeck ? "Serie Topdeck in corso" : "Lega in corso"}</span>
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

// The next event: red, the date big, its name (an unnamed one by its
// league's). A link to its league when it has one
// (the event's own page fills in once it's played).
function nextTile(ev) {
  const days = daysUntil(ev.event_date);
  const when = days <= 0 ? "oggi" : days === 1 ? "domani" : `tra ${days} giorni`;
  const parts = [ev.start_time ? `ore ${formatTime(ev.start_time)}` : "", when].filter(Boolean);
  const inner = `
      <span class="ev-tile-k"><span class="ev-pulse"></span>Prossimo evento</span>
      <div>
        <div class="ev-date">${dayMonth(ev.event_date)}</div>
        <div class="ev-event-name">${escapeHtml(ev.name || ev.league?.name || "Evento")}</div>
        <div class="ev-tile-s">${CLOCK}${marquee(parts.join(" · "))}</div>
      </div>`;
  return ev.league
    ? `<a class="ev-tile ev-next" href="league.html?id=${ev.league.id}">${inner}</a>`
    : `<div class="ev-tile ev-next">${inner}</div>`;
}

// The latest event: its date, its name (an unnamed one by its league's),
// its players.
// A league in progress with no next event scheduled yet: the same tile,
// "Prossimamente" in place of the date. A link to the league.
function soonTile(league) {
  return `
    <a class="ev-tile ev-next is-soon" href="league.html?id=${league.id}">
      <span class="ev-tile-k"><span class="ev-pulse"></span>Prossimo evento</span>
      <div>
        <div class="ev-date">Prossimamente</div>
        <div class="ev-tile-s">${CLOCK}${marquee("Data da definire")}</div>
      </div>
    </a>`;
}

function latestTile(ev, players, leagueName) {
  return `
    <a class="ev-tile" href="event.html?id=${ev.id}">
      <span class="ev-tile-k">Ultimo evento</span>
      <div>
        <div class="ev-date">${dayMonth(ev.event_date)}</div>
        <div class="ev-event-name">${escapeHtml(ev.name || leagueName || weekday(ev.event_date))}</div>
        <div class="ev-tile-s">${USERS}${players}</div>
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

// A next event's time line ("ore 21:00 · tra 5 giorni"): on one line; where
// it's wider than its tile (phones, the tile half the screen) it slides
// slowly back and forth to show the rest (fitMarquees, styles.css
// .ev-marquee).
const marquee = (text) => `<span class="ev-marquee"><span class="ev-marquee-text">${escapeHtml(text)}</span></span>`;

function fitMarquees(root) {
  for (const box of root.querySelectorAll(".ev-marquee")) {
    const text = box.firstElementChild;
    box.classList.remove("is-scrolling");
    const overflow = text.scrollWidth - box.clientWidth;
    if (overflow <= 1) continue;
    box.style.setProperty("--marquee-dist", `${Math.ceil(overflow)}px`);
    box.classList.add("is-scrolling");
  }
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
    const [leagues, allEvents, upcoming, entries, matchRows] = await Promise.all([
      Leagues.list(),
      Events.list(),
      Events.listUpcoming().catch((err) => (console.error(err), [])),
      EventEntries.listPlayersByEvent(),
      Matches.listEventIds(),
    ]);
    const counter = playerCounter(entries);
    // Matches per event — every match row, byes and drops included (the
    // same count as league.html's "Partite giocate").
    const matchesByEvent = new Map();
    for (const m of matchRows) matchesByEvent.set(m.event_id, (matchesByEvent.get(m.event_id) ?? 0) + 1);
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

    // The board: a group per league in progress (the real league first,
    // then the Topdeck series) — its tile, its next event, its latest one.
    const groups = [];
    for (const league of [current, topdeck].filter(Boolean)) {
      const scheduled = await Leagues.eventCount(league.id, allEvents.filter((ev) => ev.league_id === league.id).length);
      const attendance = league.events.reduce((sum, ev) => sum + counter.ofEvent(ev.id), 0);
      const big = currentTile(
        league,
        league.events.length,
        scheduled,
        counter.distinct(league.events),
        league.events.length ? attendance / league.events.length : 0,
        league.events.reduce((sum, ev) => sum + (matchesByEvent.get(ev.id) ?? 0), 0)
      );
      // Secondary: the Topdeck series while a real league is in progress —
      // just its own tile (one row), no event tiles. With no league in
      // progress the series takes the league's place: the main look, its
      // next / latest event beside it.
      const secondary = league.is_topdeck && Boolean(current);
      const side = [];
      if (!secondary) {
        const next = upcoming.find((ev) => ev.league?.id === league.id);
        side.push(next ? nextTile(next) : soonTile(league));
        if (league.events[0]) side.push(latestTile(league.events[0], counter.ofEvent(league.events[0].id), league.name));
      }
      groups.push(groupHtml(big, side, secondary));
    }
    boardEl.innerHTML = groups.join("");
    fitBigNames(boardEl);
    fitMarquees(boardEl);
    let fitTimer;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(() => {
          fitBigNames(boardEl);
          fitMarquees(boardEl);
        }, 120);
      },
      { signal }
    );
    if (!groups.length && !played.length) {
      boardEl.innerHTML = '<p class="page-empty">Nessuna lega o evento inserito ancora.</p>';
    }

    // Leghe concluse, newest first by their latest event (one without
    // events last), the standalone tile placed among them the same way.
    const archive = withEvents
      .filter((l) => !l.is_open)
      .map((l) => ({ last: l.events[0]?.event_date ?? "", html: closedTile(l, counter.distinct(l.events)) }));
    if (standalone.length) {
      archive.push({ last: standalone[0].event_date ?? "", html: standaloneTile(standalone, counter.distinct(standalone)) });
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
