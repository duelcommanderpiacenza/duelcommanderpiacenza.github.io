// Home dashboard (the Bacheca): three sections — Eventi (league.html's
// timeline: the next few events above "Oggi", the latest played below),
// Classifica (the league in progress — or, between leagues, the latest one's
// final standings) and Più giocati (the bubble charts). Side by side on a
// computer; on touch screens one at a time behind the site's segmented
// control (js/tabs.js). Novità is the header's bell (js/header-news.js).
// Each section fetches and renders on its own, so one failing doesn't block
// the others.

import { Leagues, Events, EventEntries, fetchEventsResults } from "./db.js";
import { computeLeaguePoints, previousLeaguePositions } from "./leaderboard.js";
import { renderBubbleChart, initBubbleChart, ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { initChartCarousel } from "./chart-carousel.js";
import { escapeHtml, formatTime, localIso, playerLabel, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { nestedResultsMenu } from "./results-link.js";
import { fetchPlayerBadgesRenderer } from "./player-badges.js";
import { initTabs } from "./tabs.js";
import { leaguePosHtml } from "./history-list.js";
import { archetypeIcon } from "./archetype-icons.js";
import { openLeagueRules, RULES_ICON } from "./league-rules.js";
import { loadRecapData, loadSeasonData, openEventRecap, openSeasonRecap, recapSeen, seasonRecapSeen } from "./event-recap.js";
import { createArtPainter } from "./player-card.js";
import { dueStories } from "./stories.js";

// The timeline: how many played events above "Oggi", upcoming ones below
// (2 and 4 since 2026-10-27 — was 3 and 3; still 6 rows, like the loading
// skeleton's).
const UPCOMING_EVENTS_COUNT = 4;
const LATEST_EVENTS_COUNT = 2;
// External events (played somewhere else) only from this many days before
// their day (and deleted once it's over: migration 030's nightly job).
const EXTERNAL_EVENTS_DAYS = 7;
// How many of the league's standings the Classifica shows.
const LEAGUE_PREVIEW_COUNT = 8;
const TOP_COMMANDERS_COUNT = 6;
const TOP_COMMANDERS_WINDOW_MONTHS = 3;
// Same fixed hue order used by the Commanders page's own chart, so a
// commander reads as the same color there and here.
const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "#9a9a94";

const ICON = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const LIST_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line><line x1="9" y1="18" x2="20" y2="18"></line><circle cx="4.5" cy="6" r="1"></circle><circle cx="4.5" cy="12" r="1"></circle><circle cx="4.5" cy="18" r="1"></circle></svg>';

// --- Dates -------------------------------------------------------------------------

function parseIsoDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}


// A map pin: an external event's Località - Sito (styles.css .league-tl-place).
const PIN_ICON = ICON('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"></path><circle cx="12" cy="9.5" r="2.5"></circle>');

// --- Eventi: the timeline ------------------------------------------------------------

// One event on league.html's timeline (styles.css .league-timeline, the same
// markup as js/league-detail.js's): its node (day, month), its card — its
// name over the league (or "Evento"; the next one's circle pulsing), and on the right: played → "Liste", a menu of its results links (the card a link to
// the event); upcoming → its time alone, when set ("15:00"), down on the
// league's line.
// An external event (played somewhere else, migration 026 — styles.css
// .home-timeline .is-external): the colours of ours, a ticket's shape; its
// Località with a pin in place of the league; never a link (it has no
// page); its right part, past the ticket's tear line, its time
// (.league-tl-time, at the bottom); the very next event of all, external or
// not, the red "next" one. Only upcoming: a past one is deleted (migration
// 030).
// An external event's place: its Località, then its Sito in its own colour
// ("Milano - Il Labirinto"); either alone; "Evento esterno" with neither.
function placeHtml(ev) {
  const venue = ev.venue ? `<span class="league-tl-venue">${escapeHtml(ev.venue)}</span>` : "";
  const text = ev.location ? `${escapeHtml(ev.location)}${venue ? ` - ${venue}` : ""}` : venue || "Evento esterno";
  return `<span class="league-tl-place-text">${text}</span>`;
}

function timelineItemHtml(ev, state) {
  const date = ev.event_date ? parseIsoDate(ev.event_date) : null;
  const node = date
    ? `<b>${String(date.getDate()).padStart(2, "0")}</b><span>${date.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</span>`
    : "<b>?</b>";
  const fullDate = date
    ? `${date.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}<small>${date.toLocaleDateString("it-IT", { weekday: "long" })}</small>`
    : "—";
  const league = ev.is_external
    ? `<span class="league-tl-place">${PIN_ICON}${placeHtml(ev)}</span>`
    : ev.league
      ? escapeHtml(ev.league.name)
      : "Evento";
  const title = escapeHtml(ev.name || ev.league?.name || "Evento");
  // Played: "Liste" (its Moxfield / mtgtop8 links in a menu) beside the
  // text, centred; upcoming: the time on the league's line under the name
  // (its baseline), at the card's bottom right.
  const links = state === "played" ? nestedResultsMenu(ev.results_url, ev.decklists_url) : "";
  const time = state !== "played" && ev.start_time ? formatTime(ev.start_time) : "";
  // An external event's time in the ticket's stub (its own side part).
  const lineTime = time && !ev.is_external ? `<span class="league-tl-side">${time}</span>` : "";
  const stub = links
    ? `<span class="league-tl-side">${links}</span>`
    : time && ev.is_external
      ? `<span class="league-tl-side league-tl-time">${time}</span>`
      : "";
  const body = `
          <span class="league-tl-text">
            <span class="league-tl-t">${title}</span>
            <span class="league-tl-k-row"><span class="league-tl-k">${league}</span>${lineTime}</span>
          </span>
          ${stub}`;
  const card =
    state === "played" && !ev.is_external
      ? `<a class="league-tl-card" href="event.html?id=${ev.id}">${body}</a>`
      : `<div class="league-tl-card">${body}</div>`;
  return `
      <li class="league-tl-item is-${state}${ev.is_external ? " is-external" : ""}">
        <span class="league-tl-date">${fullDate}</span>
        <span class="league-tl-node">${node}</span>
        ${card}
      </li>`;
}

// The page's shared requests, made once per visit (reset by mount).
let shared = new Map();
const once = (key, load) => {
  if (!shared.has(key)) shared.set(key, load());
  return shared.get(key);
};
const upcomingEvents = () => once("upcoming", () => Events.listUpcoming());
const allEvents = () => once("events", () => Events.list());
// Never fatal: the timeline just shows ours.
const externalEvents = () => once("external", () => Events.listExternal().catch((err) => (console.error(err), [])));
const openLeague = () => once("openLeague", () => Leagues.getOpen());
const leagueStandings = (league) => once(`standings:${league.id}`, () => loadLeagueStandings(league));

// The latest played events, "Oggi", the upcoming ones — in time order.
async function renderTimeline(el, signal) {
  try {
    const [upcoming, all, external] = await Promise.all([upcomingEvents(), allEvents(), externalEvents()]);
    // External events (played somewhere else) among ours by date: only from
    // today to EXTERNAL_EVENTS_DAYS ahead (a past one is deleted the night
    // after its day — migration 030 — and hidden here from midnight).
    const today = localIso();
    const until = new Date();
    until.setDate(until.getDate() + EXTERNAL_EVENTS_DAYS);
    const when = (ev) => `${ev.event_date ?? ""}T${ev.start_time ?? ""}`;
    const dated = external.filter((ev) => ev.event_date && ev.event_date >= today && ev.event_date <= localIso(until));
    // Soonest first, across every league / standalone; RLS lets a future
    // open event through (see events_public_read in supabase/schema.sql).
    const next = [...upcoming, ...dated]
      .sort((a, b) => when(a).localeCompare(when(b)))
      .slice(0, UPCOMING_EVENTS_COUNT);
    // Only the closed (published) ones, the latest first.
    const played = all
      .filter((ev) => !ev.is_open)
      .sort((a, b) => when(b).localeCompare(when(a)))
      .slice(0, LATEST_EVENTS_COUNT);
    if (next.length === 0 && played.length === 0) {
      el.innerHTML = '<p class="page-empty">Nessun evento ancora.</p>';
      return;
    }
    // In time order, top to bottom (like league.html's): the latest played
    // ones (the oldest of them first), "Oggi", then the upcoming ones (the
    // next one first).
    const items = [
      ...played.map((ev) => timelineItemHtml(ev, "played")).reverse(),
      '<li class="league-tl-today"><span class="league-tl-today-dot" aria-hidden="true"></span><span class="league-tl-today-label">Oggi</span></li>',
      ...next.map((ev, i) => timelineItemHtml(ev, i === 0 ? "next" : "future")),
    ];
    el.innerHTML = `<ol class="league-timeline home-timeline">${items.join("")}</ol>`;
    fitTimelineNames(el, signal);
  } catch (err) {
    showError(el, err);
  }
}

// The smallest an event's name is shrunk to; still longer, it's cut ("…").
const TL_NAME_MIN_PX = 12;

// An event's name too long for its card shrunk to fit its line (only as
// much as it needs) instead of being cut with "…". Measured again whenever
// the timeline's width changes — a rotation, or its tab shown (inside a
// hidden tab there's nothing to measure). `signal`: stops with the page.
function fitTimelineNames(el, signal) {
  const fit = () => {
    for (const name of el.querySelectorAll(".league-tl-t")) {
      name.style.fontSize = "";
      const room = name.clientWidth;
      // .league-tl-t is one line (nowrap): scrollWidth is its whole text.
      if (!room || name.scrollWidth <= room) continue;
      const base = parseFloat(getComputedStyle(name).fontSize);
      name.style.fontSize = `${Math.max(TL_NAME_MIN_PX, Math.floor((base * room * 10) / name.scrollWidth) / 10)}px`;
    }
  };
  const observer = new ResizeObserver(fit);
  observer.observe(el);
  signal?.addEventListener("abort", () => observer.disconnect(), { once: true });
}

// --- Classifica ----------------------------------------------------------------------

async function loadLeagueStandings(league) {
  // A still-open (or future) event has no results yet: only the closed ones
  // count as played. The league's total event count (open ones included,
  // even those hidden from visitors) for computeLeaguePoints's best-results
  // cap and the progress. The league's events from the page's shared list
  // of every event (the timeline's — already on its way, no request of its
  // own); the count asked meanwhile, falling back to them (null until known).
  const countRequest = Leagues.eventCount(league.id, null);
  const leagueEvents = (await allEvents()).filter((ev) => ev.league_id === league.id);
  const closed = leagueEvents.filter((ev) => !ev.is_open);
  const [eventsData, count] = await Promise.all([fetchEventsResults(closed.map((ev) => ev.id)), countRequest]);
  const scheduledEvents = count ?? leagueEvents.length;
  return {
    league,
    standings: computeLeaguePoints(eventsData, { scheduledEvents }),
    // Each player's place before the league's latest event (the ▲ / ▼),
    // only shown while it runs.
    before: previousLeaguePositions(eventsData, closed, { scheduledEvents }),
    played: closed.length,
    scheduled: Math.max(scheduledEvents, closed.length),
  };
}

// A league's progress: one segment per event (open and future ones
// included), filled for those played. Past SEGMENTS_MAX events, one
// continuous bar instead.
const SEGMENTS_MAX = 16;

function leagueProgressHtml(played, scheduled) {
  if (!scheduled) return "";
  const pct = Math.round((played / scheduled) * 100);
  const bar =
    scheduled <= SEGMENTS_MAX
      ? Array.from(
          { length: scheduled },
          (_, i) => `<span class="league-progress-seg${i < played ? " is-done" : ""}${i === played ? " is-next" : ""}"></span>`
        ).join("")
      : `<span class="league-progress-fill" style="width:${pct}%"></span>`;
  return `
      <div class="league-progress" role="progressbar" aria-label="Eventi giocati" aria-valuemin="0" aria-valuemax="${scheduled}" aria-valuenow="${played}">
        <div class="league-progress-track${scheduled <= SEGMENTS_MAX ? " is-segmented" : ""}">${bar}</div>
      </div>`;
}

// The league's name (a link to league.html) — "Conclusa" when it's over —
// and "Regolamento" (js/league-rules.js) on its right; its progress; the top
// LEAGUE_PREVIEW_COUNT as sub-cards like league.html's Classifica, each a
// link to the player, then "Classifica completa" under them:
// position chip (while the league runs, with its change since the latest
// event — leaguePosHtml), name + badges, points; a finished league's winner in gold
// with a trophy. The name is plain text inside (a link can't hold another);
// .history-name is where js/me-highlight.js puts "Tu".
function standingsHtml({ league, standings: allStandings, before, played, scheduled }, badgesFor, finished) {
  const href = `league.html?id=${league.id}`;
  const standings = allStandings.slice(0, LEAGUE_PREVIEW_COUNT);
  const head = `
      <div class="home-panel-head">
        <a class="home-panel-title" href="${href}">${escapeHtml(league.name)}</a>
        ${finished ? '<span class="home-finished-chip">Conclusa</span>' : ""}
        <button type="button" class="section-link dashboard-league-rules" data-league-rules aria-haspopup="dialog">${RULES_ICON}<span>Regolamento</span></button>
      </div>
      ${leagueProgressHtml(played, scheduled)}`;
  if (standings.length === 0) return `${head}<p class="page-empty">Nessun dato per la classifica.</p>`;
  return `${head}
      <ol class="dashboard-standings">
        ${standings
          .map((s, i) => {
            const winner = finished && i === 0;
            const inner = `
            <div class="history-lead">
              ${
                finished
                  ? `<span class="history-pos${i === 0 ? " is-first" : ""}${winner ? " is-winner" : ""}">${winner ? "🏆" : `${i + 1}°`}</span>`
                  : leaguePosHtml(i + 1, before, s.player?.id)
              }
              <span class="dashboard-standings-name">
                <span class="dashboard-standings-name-text history-name">${playerLabel(s.player, { link: false })}</span><span class="dashboard-standings-badges">${badgesFor(s.player)}</span>
              </span>
            </div>
            <div class="dashboard-standings-points">
              <span class="history-stat-value">${s.points}</span>
              <span class="history-stat-label">Punti</span>
            </div>`;
            const cls = `history-item history-split dashboard-standing${winner ? " is-winner" : ""}`;
            return `
        <li>${s.player?.id ? `<a class="${cls}" href="player.html?id=${s.player.id}">${inner}</a>` : `<div class="${cls}">${inner}</div>`}</li>`;
          })
          .join("")}
      </ol>
      <p class="dashboard-league-more-row"><a class="section-link dashboard-league-more" href="${href}">${LIST_ICON}<span>Classifica completa</span></a></p>`;
}

// The league in progress (a Topdeck series has no standings — its events
// are on the timeline); none: the latest finished league's final standings,
// "Conclusa".
async function renderStandings(el) {
  try {
    let league = await openLeague();
    let finished = false;
    if (!league) {
      league = (await Leagues.list()).find((l) => !l.is_open && !l.is_topdeck) ?? null;
      finished = Boolean(league);
    }
    if (!league) {
      el.innerHTML = '<p class="page-empty">Nessuna lega ancora.</p>';
      return;
    }
    const [data, badgesFor] = await Promise.all([leagueStandings(league), fetchPlayerBadgesRenderer()]);
    el.innerHTML = standingsHtml(data, badgesFor, finished);
    el.querySelector("[data-league-rules]")?.addEventListener("click", openLeagueRules);
  } catch (err) {
    showError(el, err);
  }
}

// --- Più giocati ---------------------------------------------------------------------

// The Più giocati charts' entries since `cutoffIso`, reused from this
// browser for CHART_CACHE_MS (localStorage "homeCharts": the cutoff, when,
// the rows) — a reload or a return to the Bacheca within it skips the
// request. Any storage problem: just fetched.
const CHART_CACHE_KEY = "homeCharts";
const CHART_CACHE_MS = 5 * 60 * 1000;
async function chartEntries(cutoffIso) {
  try {
    const cached = JSON.parse(localStorage.getItem(CHART_CACHE_KEY) ?? "null");
    if (cached?.cutoff === cutoffIso && Date.now() - cached.at < CHART_CACHE_MS) return cached.rows;
  } catch {
    // Unreadable: fetched below.
  }
  const rows = await EventEntries.listForChartsSince(cutoffIso);
  try {
    localStorage.setItem(CHART_CACHE_KEY, JSON.stringify({ cutoff: cutoffIso, at: Date.now(), rows }));
  } catch {
    // Full / private mode: not kept, no matter.
  }
  return rows;
}

async function renderCommandersSection(el) {
  try {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - TOP_COMMANDERS_WINDOW_MONTHS);
    const cutoffIso = localIso(cutoff);
    // Only the window's entries, already date-filtered by the database —
    // kept in this browser for a few minutes (chartEntries), the charts'
    // slowest part, since they change only when an event is published.
    const entries = await chartEntries(cutoffIso);

    // Primary commander only, same as the Commanders page's own chart —
    // counting the partner too would let one appearance count twice and
    // push the shares past 100%. Archetypes counted over the same entries
    // (one per entry), same as the Archetipi page's own Metashare chart.
    const counts = new Map(); // commander id -> { name, count }
    const archetypeCounts = new Map(ARCHETYPES.map((a) => [a, 0]));
    let total = 0;
    for (const e of entries) {
      if (!e.commander) continue;
      total += 1;
      const key = e.commander.id;
      if (!counts.has(key)) counts.set(key, { id: key, name: e.commander.name, count: 0 });
      counts.get(key).count += 1;
      if (archetypeCounts.has(e.archetype)) archetypeCounts.set(e.archetype, archetypeCounts.get(e.archetype) + 1);
    }

    if (total === 0) {
      el.innerHTML = '<p class="page-empty">Nessun dato per il grafico.</p>';
      return;
    }

    const ranked = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    const top = ranked.slice(0, TOP_COMMANDERS_COUNT);
    const otherCount = ranked.slice(TOP_COMMANDERS_COUNT).reduce((sum, r) => sum + r.count, 0);

    // The commanders as bubbles with their art, each a link to its page.
    const chartRows = top.map((r, i) => ({
      label: r.name,
      share: (r.count / total) * 100,
      color: CHART_COLORS[i],
      href: `commander.html?id=${r.id}`,
      card: r.name,
    }));
    if (otherCount > 0) chartRows.push({ label: "Altri", share: (otherCount / total) * 100, color: OTHER_COLOR, bubble: false });

    // The archetypes as flat bubbles, each a link to its page.
    const archetypeRows = ARCHETYPES.map((a) => ({
      label: a,
      share: (archetypeCounts.get(a) / total) * 100,
      color: ARCHETYPE_COLORS[a],
      href: `archetype.html?id=${a}`,
      icon: archetypeIcon(a, "bubble-icon"),
    })).sort((a, b) => b.share - a.share);

    // The same whole-block carousel as the Comandanti/Archetipi charts
    // (js/chart-carousel.js): the two side by side once the card is wide
    // enough (.chart-carousel-host in styles.css — the full width on a
    // computer), else one at a time. Each slide carries its own title,
    // "(ultimi 3 mesi)" and "Vedi tutti"; the ‹ • › controls under the card.
    const periodLabel = `(ultimi ${TOP_COMMANDERS_WINDOW_MONTHS} mesi)`;
    const seeAll = (href) => `<a class="section-link" href="${href}">Vedi tutti</a>`;
    el.innerHTML = `
      <div class="chart-grid">
        ${renderBubbleChart(chartRows, "Nessun dato per il grafico.", "Commander più giocati", {
          subtitle: periodLabel,
          footer: seeAll("commanders.html"),
        })}
        ${renderBubbleChart(archetypeRows, "Nessun dato per il grafico.", "Archetipi più giocati", {
          subtitle: periodLabel,
          footer: seeAll("archetypes.html"),
        })}
      </div>`;
    initBubbleChart(el);
    initChartCarousel(el, { navAfter: document.getElementById("dashboard-charts-card") });
  } catch (err) {
    showError(el, err);
  }
}

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left. Two steps: the page is shown once Eventi and
// Classifica have settled (success or already-shown error); Più giocati —
// the slowest, its data and the commanders' art — keeps its own shimmering
// placeholder (index.html .home-charts-sk) until its charts are in.
// --- Recap -------------------------------------------------------------------------

// The recaps due (events played in the last RECAP_DAYS days, seasons over
// in the last SEASON_DAYS, below) on top — story bubbles (its
// winner's commander art in a turning red-gold ring — grey once watched,
// js/event-recap.js recapSeen —, "Nuovo · Recap", the event, who won with
// what; the whole card a button) opening its recap's stories. Nothing when there's none
// (or it can't be read).
const RECAP_DAYS = 7;
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"></path></svg>';

// Whether a recap card is likely before anything loads — for the loading
// skeleton's card placeholder (.sk-recap; index.html's inline script makes
// the same guess before the first paint): what the last visit saw, kept in
// localStorage "homeRecapHint" — the last day its recap card was due
// ("until"), and the next event's date then ("next"), which may have been
// played since (within RECAP_DAYS).
const HINT_KEY = "homeRecapHint";

function recapLikely() {
  try {
    const hint = JSON.parse(localStorage.getItem(HINT_KEY) || "null");
    const today = isoDaysAgo(0);
    return Boolean(hint && ((hint.until && today <= hint.until) || (hint.next && hint.next <= today && hint.next >= isoDaysAgo(RECAP_DAYS))));
  } catch {
    return false;
  }
}

function rememberRecapHint(until, next) {
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify({ until, next }));
  } catch {
    // No storage: no guess next time.
  }
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localIso(d);
}

// A season just over: a closed league (not a Topdeck series) whose last
// event was within SEASON_DAYS — its season recap (js/event-recap.js
// openSeasonRecap), beside the events' own.
const SEASON_DAYS = 14;

const plusDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localIso(d);
};

// The closed real leagues whose last played event is on or after `cutoff`:
// [{ id, last }], newest first.
function recentSeasons(events, cutoff) {
  const lastByLeague = new Map();
  for (const e of events) {
    if (e.is_open || !e.event_date || !e.league || e.league.is_open || e.league.is_topdeck) continue;
    if ((lastByLeague.get(e.league_id) ?? "") < e.event_date) lastByLeague.set(e.league_id, e.event_date);
  }
  return [...lastByLeague.entries()]
    .filter(([, d]) => d >= cutoff)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id, last]) => ({ id, last }));
}

// Every recap due now: each event played in the last RECAP_DAYS, each
// season over in the last SEASON_DAYS — with what its card / bubble shows.
// Not yet watched first, then newest first. A failed one is left out.
async function dueRecaps(events) {
  const eventItems = events
    .filter((e) => !e.is_open && e.event_date && e.event_date >= isoDaysAgo(RECAP_DAYS))
    .map(async (e) => {
      const data = await loadRecapData(e.id);
      if (!data.winner) return null;
      return {
        date: e.event_date,
        until: plusDays(e.event_date, RECAP_DAYS),
        seenId: e.id,
        seen: recapSeen(e.id),
        kicker: "Nuovo · Recap",
        short: "Recap",
        title: data.name,
        line: `Vince ${escapeHtml(data.winner.player?.name)} con ${escapeHtml(data.winnerCommander)}`,
        art: data.winnerCommander,
        open: () => openEventRecap(e.id),
      };
    });
  const seasonItems = recentSeasons(events, isoDaysAgo(SEASON_DAYS)).map(async ({ id, last }) => {
    const data = await loadSeasonData(id);
    if (!data.champion) return null;
    return {
      date: last,
      until: plusDays(last, SEASON_DAYS),
      seenId: `league:${id}`,
      seen: seasonRecapSeen(id),
      kicker: "Nuovo · Recap della stagione",
      short: "Stagione",
      title: data.name,
      line: `Campione ${escapeHtml(data.champion.player?.name)} con ${escapeHtml(data.championCommander)}`,
      art: data.championCommander,
      open: () => openSeasonRecap(id),
    };
  });
  const settled = await Promise.allSettled([...eventItems, ...seasonItems]);
  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter(Boolean)
    .sort((a, b) => a.seen - b.seen || a.date.localeCompare(b.date));
}

const RING_HTML = `<span class="recap-ring"><span class="recap-ring-art"></span><span class="recap-ring-play">${PLAY_ICON}</span></span>`;

// The recaps as a row of compact bubbles, like a social app's stories (one
// or several alike — since 2026-10-28 also a single one, which was a wide
// card): the ring with the art and just its kind under it ("Recap" /
// "Stagione" — the name only in its aria-label, since 2026-10-28).
function recapBubblesHtml(items) {
  return `
      <div class="recap-bubbles" role="list">${items
        .map(
          (item) => `
        <button type="button" class="recap-bubble${item.seen ? " is-seen" : ""}" role="listitem" data-recap="${escapeHtml(item.seenId)}" aria-label="${escapeHtml(
            `${item.kicker.replace("Nuovo · ", "")}: ${item.title}`
          )}">
          ${RING_HTML}
          <small>${item.short}</small>
        </button>`
        )
        .join("")}
      </div>`;
}

async function renderRecapCard(el, signal) {
  try {
    const [events, upcoming] = await Promise.all([allEvents(), upcomingEvents().catch(() => [])]);
    // The recaps and the other stories (js/stories.js: a new video, the
    // month's meta) in one row: not yet watched first, the watched ones
    // last — each group in chronological order, oldest first (a social
    // app's stories).
    const [recaps, others] = await Promise.all([dueRecaps(events), dueStories()]);
    const items = [...recaps, ...others].sort((a, b) => a.seen - b.seen || a.date.localeCompare(b.date));
    // For the next visit's loading skeleton (recapLikely): the last day any
    // of them is due.
    const next = upcoming[0]?.event_date ?? null;
    rememberRecapHint(items.length ? items.map((i) => i.until).sort().at(-1) : null, next);
    if (signal.aborted || !items.length) return;
    el.innerHTML = recapBubblesHtml(items);
    el.hidden = false;
    for (const item of items) {
      const btn = el.querySelector(`[data-recap="${CSS.escape(item.seenId)}"]`);
      // A commander's art, or (a video) its thumbnail.
      const ring = btn.querySelector(".recap-ring-art");
      if (item.thumb) {
        ring.style.backgroundImage = `url("${item.thumb}")`;
        ring.classList.add("is-loaded");
      } else if (item.art) createArtPainter(ring)(item.art.split(" / ")[0]);
      btn.addEventListener("click", item.open);
    }
    document.addEventListener(
      "recap:seen",
      (e) => el.querySelector(`[data-recap="${CSS.escape(e.detail)}"]`)?.classList.add("is-seen"),
      { signal }
    );
  } catch (err) {
    console.error(err);
  }
}

export function mount({ signal = new AbortController().signal } = {}) {
  shared = new Map();
  // The skeleton's recap placeholder (in-app navigation: the inline script
  // in index.html doesn't run then).
  const skRecap = document.querySelector(".sk-page.is-home .sk-recap");
  if (skRecap) skRecap.hidden = !recapLikely();
  initTabs(document.querySelector(".home-tabs"));
  renderCommandersSection(document.getElementById("dashboard-commanders-content"));
  return Promise.allSettled([
    renderTimeline(document.getElementById("home-timeline"), signal),
    renderStandings(document.getElementById("dashboard-leagues-content")),
    renderRecapCard(document.getElementById("home-recap"), signal),
  ]).then(() => hidePageLoading(signal));
}
