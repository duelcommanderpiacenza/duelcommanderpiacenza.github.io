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
import { escapeHtml, formatTime, isHttpUrl, playerLabel, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { nestedResultsMenu } from "./results-link.js";
import { fetchPlayerBadgesRenderer } from "./player-badges.js";
import { initTabs } from "./tabs.js";
import { leaguePosHtml } from "./history-list.js";

// The timeline: how many upcoming events above "Oggi", played ones below.
const UPCOMING_EVENTS_COUNT = 3;
const LATEST_EVENTS_COUNT = 3;
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

// Local-time YYYY-MM-DD, directly comparable with an event_date string.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A map pin: an external event's Località (styles.css .league-tl-place).
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
// page); its right part, past the ticket's tear line, "Liste" once past
// (it's only shown with a link) or its time while upcoming (.league-tl-time,
// at the bottom); the very next event of all, external or not, the red
// "next" one.
function timelineItemHtml(ev, state) {
  const date = ev.event_date ? parseIsoDate(ev.event_date) : null;
  const node = date
    ? `<b>${String(date.getDate()).padStart(2, "0")}</b><span>${date.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</span>`
    : "<b>?</b>";
  const fullDate = date
    ? `${date.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}<small>${date.toLocaleDateString("it-IT", { weekday: "long" })}</small>`
    : "—";
  const league = ev.is_external
    ? `<span class="league-tl-place">${PIN_ICON}${escapeHtml(ev.location || "Evento esterno")}</span>`
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
async function renderTimeline(el) {
  try {
    const [upcoming, all, external] = await Promise.all([upcomingEvents(), allEvents(), externalEvents()]);
    // External events (played somewhere else) mixed in by date: the upcoming
    // ones (today or later) among ours; a past one only with its mtgtop8 /
    // Moxfield link, among the latest played.
    const today = todayIso();
    const when = (ev) => `${ev.event_date ?? ""}T${ev.start_time ?? ""}`;
    const dated = external.filter((ev) => ev.event_date);
    // Soonest first, across every league / standalone; RLS lets a future
    // open event through (see events_public_read in supabase/schema.sql).
    const next = [...upcoming, ...dated.filter((ev) => ev.event_date >= today)]
      .sort((a, b) => when(a).localeCompare(when(b)))
      .slice(0, UPCOMING_EVENTS_COUNT);
    // Events.list() is newest first; only the closed (published) ones.
    const pastExternal = dated.filter(
      (ev) => ev.event_date < today && (isHttpUrl(ev.results_url) || isHttpUrl(ev.decklists_url))
    );
    const played = [...all.filter((ev) => !ev.is_open), ...pastExternal]
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
  } catch (err) {
    showError(el, err);
  }
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
// and "Classifica completa"; its progress; the top LEAGUE_PREVIEW_COUNT as
// sub-cards like league.html's Classifica, each a link to the player:
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
        ${standings.length ? `<a class="section-link dashboard-league-more" href="${href}">${LIST_ICON}<span>Classifica completa</span></a>` : ""}
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
      </ol>`;
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
    const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
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
export function mount({ signal = new AbortController().signal } = {}) {
  shared = new Map();
  initTabs(document.querySelector(".home-tabs"));
  renderCommandersSection(document.getElementById("dashboard-commanders-content"));
  return Promise.allSettled([
    renderTimeline(document.getElementById("home-timeline")),
    renderStandings(document.getElementById("dashboard-leagues-content")),
  ]).then(() => hidePageLoading(signal));
}
