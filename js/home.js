// Home dashboard: independent widgets (upcoming events, active leagues,
// latest events, most played commanders; Novità is the header's bell,
// js/header-news.js) — each fetches and renders on its own, so one failing
// doesn't block the others.

import { Leagues, Events, EventEntries, fetchEventsResults } from "./db.js";
import { computeLeaguePoints } from "./leaderboard.js";
import { renderBubbleChart, initBubbleChart, ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { initChartCarousel } from "./chart-carousel.js";
import { escapeHtml, formatTime, playerLabel, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { nestedResultsLink } from "./results-link.js";
import { fetchPlayerBadgesRenderer } from "./player-badges.js";
import { mountCalendar } from "./events-calendar.js";

const LATEST_EVENTS_COUNT = 5;
const UPCOMING_EVENTS_COUNT = 3;
// How many of the open league's standings "Leghe in corso" previews.
const LEAGUE_PREVIEW_COUNT = 8;
const TOP_COMMANDERS_COUNT = 6;
const TOP_COMMANDERS_WINDOW_MONTHS = 3;
// Same fixed hue order used by the Commanders page's own chart, so a
// commander reads as the same color there and here.
const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "#9a9a94";

async function fetchLeagueEventsData(leagueId) {
  // A still-open event (including a future one, now visible ahead of time
  // for "Prossimi eventi") has no entries/matches yet regardless — but
  // counting it here would still inflate this league's played count, so
  // it's excluded up front rather than relying on its (empty) data to
  // just wash out on its own.
  // The league's total event count (open ones included, even those hidden
  // from visitors) is returned too, for computeLeaguePoints's best-results cap.
  const allEvents = await Events.listByLeague(leagueId);
  const closed = allEvents.filter((ev) => !ev.is_open);
  const [eventsData, scheduledEvents] = await Promise.all([
    fetchEventsResults(closed.map((ev) => ev.id)),
    Leagues.eventCount(leagueId, allEvents.length),
  ]);
  return { eventsData, scheduledEvents, played: closed.length };
}

async function loadLeagueCard(league) {
  const { eventsData, scheduledEvents, played } = await fetchLeagueEventsData(league.id);
  // A Topdeck series has no points leaderboard (same as league.html).
  const standings = league.is_topdeck ? null : computeLeaguePoints(eventsData, { scheduledEvents });
  return { league, standings, played, scheduled: Math.max(scheduledEvents, played) };
}

// The open league and Topdeck series with their data.
let activeLeaguesPromise = null;
function loadActiveLeagues() {
  activeLeaguesPromise ??= Promise.all([Leagues.getOpen(), Leagues.getOpenTopdeck()]).then(
    async ([openLeague, openTopdeck]) => {
      const active = [openLeague, openTopdeck].filter(Boolean);
      return { openLeague, active, cards: await Promise.all(active.map(loadLeagueCard)) };
    }
  );
  return activeLeaguesPromise;
}

// A real league's progress: one segment per event of the league (open and
// future ones included), filled for those already played. Past
// SEGMENTS_MAX events, one continuous bar instead.
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
        <div class="league-progress-head">
          <span class="league-progress-label">${played} di ${scheduled} eventi giocati</span>
        </div>
        <div class="league-progress-track${scheduled <= SEGMENTS_MAX ? " is-segmented" : ""}">${bar}</div>
      </div>`;
}

// Name (a link to league.html). A real league also gets its progress, a
// glimpse of its current standings (top LEAGUE_PREVIEW_COUNT, points only)
// and, under them, "Classifica completa" (a list icon before it) to
// league.html; a Topdeck series
// has none of them.
function renderLeagueCard({ league, standings: allStandings, played, scheduled }, badgesFor) {
  const standings = allStandings?.slice(0, LEAGUE_PREVIEW_COUNT) ?? null;
  const href = `league.html?id=${league.id}`;
  // Compact sub-cards like league.html's Classifica (js/history-list.js's
  // look), each a link to the player: position chip, name + badges, points.
  // The name is plain text inside (a link can't hold another);
  // .history-name is where js/me-highlight.js puts "Tu".
  const ranking = !standings
    ? ""
    : standings.length === 0
      ? '<p class="page-empty">Nessun dato per la classifica.</p>'
      : `<ol class="dashboard-standings">
            ${standings
              .map((s, i) => {
                const inner = `
                <div class="history-lead">
                  <span class="history-pos${i === 0 ? " is-first" : ""}">${i + 1}°</span>
                  <span class="dashboard-standings-name">
                    <span class="dashboard-standings-name-text history-name">${playerLabel(s.player, { link: false })}</span><span class="dashboard-standings-badges">${badgesFor(s.player)}</span>
                  </span>
                </div>
                <div class="dashboard-standings-points">
                  <span class="history-stat-value">${s.points}</span>
                  <span class="history-stat-label">Punti</span>
                </div>`;
                return `
            <li>${
              s.player?.id
                ? `<a class="history-item history-split dashboard-standing" href="player.html?id=${s.player.id}">${inner}</a>`
                : `<div class="history-item history-split dashboard-standing">${inner}</div>`
            }</li>`;
              })
              .join("")}
          </ol>`;
  return `
    <div class="dashboard-league-card">
      <div class="dashboard-league-card-head">
        <a class="dashboard-league-card-name" href="${href}">${escapeHtml(league.name)}</a>
      </div>
      ${league.is_topdeck ? "" : leagueProgressHtml(played, scheduled)}
      ${ranking}
      ${standings?.length ? `<a class="section-link dashboard-league-more" href="${href}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line><line x1="9" y1="18" x2="20" y2="18"></line><circle cx="4.5" cy="6" r="1"></circle><circle cx="4.5" cy="12" r="1"></circle><circle cx="4.5" cy="18" r="1"></circle></svg>Classifica completa</a>` : ""}
    </div>`;
}

// Hidden entirely when empty — purely a nice-to-have widget, not critical
// page content. The query itself already only returns events whose date
// hasn't passed yet (and, for
// a still-open one, only once RLS lets it through at all — see
// events_public_read in supabase/schema.sql).
async function renderUpcomingSection(sectionEl, contentEl) {
  try {
    // listUpcoming() already returns soonest-first, across every
    // league/standalone — only the nearest few are worth featuring here.
    const events = (await Events.listUpcoming()).slice(0, UPCOMING_EVENTS_COUNT);
    sectionEl.hidden = events.length === 0;
    if (events.length === 0) return;
    contentEl.innerHTML = `<div class="upcoming-list">
      ${events
        .map((e) => {
          const { day, month } = upcomingDateParts(e.event_date);
          // The date badge on the left already carries the date — the name
          // falls back to a generic label instead of a formatted date (what
          // eventTitle() would otherwise give an unnamed Topdeck event) so
          // it's never repeated a second time here.
          const title = e.name || (e.league ? e.league.name : "Evento");
          return `
        <div class="upcoming-row">
          <div class="upcoming-date-badge">
            <span class="upcoming-date-day">${day}</span>
            <span class="upcoming-date-month">${month}</span>
          </div>
          <div class="upcoming-row-text">
            <span class="upcoming-row-title">${escapeHtml(title)}</span>
            ${e.start_time ? `<span class="upcoming-row-time">ore ${formatTime(e.start_time)}</span>` : ""}
            ${e.league ? `<span class="upcoming-row-league">${escapeHtml(e.league.name)}</span>` : ""}
          </div>
        </div>`;
        })
        .join("")}
    </div>`;
  } catch (err) {
    console.error(err);
    sectionEl.hidden = true;
  }
}

// A big day + 3-letter month reads as a calendar-page badge, more eye
// catching than plain "23 ott 2026" text — the year is left off since it's
// implied (a "Prossimi eventi" list is never showing a past one).
function upcomingDateParts(value) {
  const d = new Date(value);
  return {
    day: d.toLocaleDateString("it-IT", { day: "2-digit" }),
    month: d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "").toUpperCase(),
  };
}

async function renderLeaguesSection(el) {
  try {
    const { openLeague, active, cards } = await loadActiveLeagues();

    if (active.length === 0) {
      const leagues = await Leagues.list();
      const recent = leagues.slice(0, 3);
      el.innerHTML =
        recent.length === 0
          ? '<p class="page-empty">Nessuna lega inserita ancora.</p>'
          : `
        <p class="page-empty" style="margin-bottom:14px;">Nessuna lega attiva al momento.</p>
        <div class="dashboard-league-chip-list">
          ${recent.map((l) => `<a class="dashboard-league-chip" href="league.html?id=${l.id}">${escapeHtml(l.name)}</a>`).join("")}
        </div>
        <a class="section-link" style="margin-top:16px;" href="events.html">Tutte le leghe &rarr;</a>`;
      return;
    }

    // Player badges only matter for a real league's standings preview.
    const badgesFor = openLeague ? await fetchPlayerBadgesRenderer() : () => "";
    el.innerHTML = `<div class="dashboard-league-list">${cards.map((c) => renderLeagueCard(c, badgesFor)).join("")}</div>`;
  } catch (err) {
    showError(el, err);
  }
}

async function renderEventsSection(el) {
  try {
    // RLS used to limit anonymous visitors to closed (published) events on
    // its own, but now also lets a future *open* event through (so it can
    // surface in "Prossimi eventi" before it's been played) — this widget
    // only wants already-played, closed ones, so that needs filtering for
    // explicitly here. Events.list() already orders by event_date
    // descending, so closed events stay in date order once filtered.
    const events = (await Events.list()).filter((ev) => !ev.is_open).slice(0, LATEST_EVENTS_COUNT);
    el.innerHTML =
      events.length === 0
        ? '<p class="page-empty">Nessun evento pubblicato ancora.</p>'
        : `<div class="upcoming-list">
            ${events
              .map((ev) => {
                // Same row shape as "Prossimi eventi" above (date badge +
                // name + league), and the same title fallback: the badge
                // already shows the date, so an unnamed Topdeck event isn't
                // titled with it a second time.
                const title = ev.name || (ev.league ? ev.league.name : "Evento");
                const { day, month } = ev.event_date ? upcomingDateParts(ev.event_date) : { day: "&mdash;", month: "" };
                const badge = `<span class="upcoming-date-day">${day}</span><span class="upcoming-date-month">${month}</span>`;
                return `
              <a class="upcoming-row" href="event.html?id=${ev.id}">
                <div class="upcoming-date-badge">${badge}</div>
                <div class="upcoming-row-main">
                  <div class="upcoming-row-text">
                    <span class="upcoming-row-title">${escapeHtml(title)}</span>
                    ${ev.league ? `<span class="upcoming-row-league">${escapeHtml(ev.league.name)}</span>` : ""}
                  </div>
                  ${nestedResultsLink(ev.results_url, ev.decklists_url)}
                </div>
              </a>`;
              })
              .join("")}
          </div>`;
  } catch (err) {
    showError(el, err);
  }
}

async function renderCommandersSection(el) {
  try {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - TOP_COMMANDERS_WINDOW_MONTHS);
    const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    // Only the window's entries, already date-filtered by the database.
    const entries = await EventEntries.listForChartsSince(cutoffIso);

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
    // (js/chart-carousel.js) — this card is narrow, so it shows one chart
    // at a time (two only once the card itself is wide enough, see
    // .chart-carousel-host in styles.css). Each slide carries its own title,
    // "(ultimi 3 mesi)" and "Vedi tutti" link (the card has no fixed heading
    // or link of its own), so all of it slides along with its chart; the
    // ‹ • › controls sit below the card, outside it.
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
// aborts when the page is left. Independent widgets — the page isn't
// "ready" until all of them have settled (success or already-shown error),
// not just the first one. The calendar's button and dialog wired too
// (js/events-calendar.js); the active leagues read again on each visit.
export function mount({ signal = new AbortController().signal } = {}) {
  activeLeaguesPromise = null;
  mountCalendar();
  return Promise.allSettled([
    renderLeaguesSection(document.getElementById("dashboard-leagues-content")),
    renderUpcomingSection(
      document.getElementById("dashboard-upcoming"),
      document.getElementById("dashboard-upcoming-content")
    ),
    renderEventsSection(document.getElementById("dashboard-events-content")),
    renderCommandersSection(document.getElementById("dashboard-commanders-content")),
  ]).then(() => hidePageLoading(signal));
}
