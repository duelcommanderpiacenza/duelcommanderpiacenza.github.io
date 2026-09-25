// Home dashboard: independent widgets (announcements, active leagues,
// upcoming events, latest events, most played commanders) — each fetches
// and renders on its own, so one failing doesn't block the others.

import { Announcements, Leagues, Events, EventEntries, Matches } from "./db.js";
import { computeLeagueSummary } from "./stats.js";
import { computeLeaguePoints } from "./leaderboard.js";
import { renderPieChart, ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { initChartCarousel } from "./chart-carousel.js";
import { escapeHtml, formatDate, formatTime, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { nestedResultsLink } from "./results-link.js";

const LATEST_EVENTS_COUNT = 5;
const UPCOMING_EVENTS_COUNT = 3;
const TOP_STANDINGS_COUNT = 3;
const TOP_COMMANDERS_COUNT = 6;
const TOP_COMMANDERS_WINDOW_MONTHS = 3;
// Same fixed hue order used by the Commanders page's own chart, so a
// commander reads as the same color there and here.
const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "#9a9a94";

async function fetchLeagueEventsData(leagueId) {
  // A still-open event (including a future one, now visible ahead of time
  // for "Prossimi eventi") has no entries/matches yet regardless — but
  // counting it here would still inflate this league's own "eventi" stat,
  // so it's excluded up front rather than relying on its (empty) data to
  // just wash out on its own.
  const events = (await Events.listByLeague(leagueId)).filter((ev) => !ev.is_open);
  return Promise.all(
    events.map(async (ev) => {
      const [entries, matches] = await Promise.all([EventEntries.listByEvent(ev.id), Matches.listByEvent(ev.id)]);
      return { entries, matches };
    })
  );
}

async function loadLeagueCard(league) {
  const eventsData = await fetchLeagueEventsData(league.id);
  const summary = computeLeagueSummary(eventsData);
  // A Topdeck series has no points leaderboard, so no standings teaser for it.
  const standings = league.is_topdeck ? [] : computeLeaguePoints(eventsData).slice(0, TOP_STANDINGS_COUNT);
  return { league, summary, standings };
}

function renderLeagueCard({ league, summary, standings }) {
  return `
    <a class="dashboard-league-card" href="league.html?id=${league.id}">
      <div class="dashboard-league-card-head">
        <span class="dashboard-league-card-name">${escapeHtml(league.name)}</span>
      </div>
      <div class="dashboard-league-card-stats">${summary.events} eventi &middot; ${summary.uniquePlayers} giocatori</div>
      ${
        standings.length === 0
          ? ""
          : `<ol class="dashboard-standings">
              ${standings
                .map(
                  (s, i) => `
                <li>
                  <span class="rank-cell">${i + 1}</span>
                  <span class="dashboard-standings-name">${escapeHtml(s.player?.name ?? "")}</span>
                  <strong>${s.points}</strong>
                </li>`
                )
                .join("")}
            </ol>`
      }
    </a>`;
}

// The section itself is hidden entirely (not just empty) whenever there
// are no announcements — including on a fetch failure, since this widget
// is a nice-to-have, not critical page content worth an error box.
async function renderAnnouncementsSection(sectionEl, contentEl) {
  try {
    const announcements = await Announcements.list();
    sectionEl.hidden = announcements.length === 0;
    if (announcements.length === 0) return;
    contentEl.innerHTML = announcements
      .map(
        (a) => `
      <article class="announcement-item">
        <div class="announcement-head">
          <h3 class="announcement-title">${escapeHtml(a.title)}</h3>
          <span class="announcement-date">${formatDate(a.created_at)}</span>
        </div>
        <p class="announcement-body">${escapeHtml(a.body)}</p>
      </article>`
      )
      .join("");
  } catch (err) {
    console.error(err);
    sectionEl.hidden = true;
  }
}

// Same "hidden entirely when empty" treatment as the Annunci section above
// — purely a nice-to-have widget, not critical page content. The query
// itself already only returns events whose date hasn't passed yet (and, for
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
    const [openLeague, openTopdeck] = await Promise.all([Leagues.getOpen(), Leagues.getOpenTopdeck()]);
    const active = [openLeague, openTopdeck].filter(Boolean);

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

    const cards = await Promise.all(active.map(loadLeagueCard));
    el.innerHTML = `<div class="dashboard-league-list">${cards.map(renderLeagueCard).join("")}</div>`;
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
                <div class="upcoming-row-text">
                  <span class="upcoming-row-title">${escapeHtml(title)}</span>
                  ${ev.league ? `<span class="upcoming-row-league">${escapeHtml(ev.league.name)}</span>` : ""}
                </div>
                ${nestedResultsLink(ev.results_url)}
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
    const [entries, events] = await Promise.all([EventEntries.listAll(), Events.list()]);
    const eventDateById = new Map(events.map((ev) => [ev.id, ev.event_date]));

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - TOP_COMMANDERS_WINDOW_MONTHS);
    const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    // Primary commander only, same as the Commanders page's own chart —
    // counting the partner too would let one appearance count twice and
    // push the shares past 100%. Archetypes counted over the same entries
    // (one per entry), same as the Archetipi page's own Metashare chart.
    const counts = new Map(); // commander id -> { name, count }
    const archetypeCounts = new Map(ARCHETYPES.map((a) => [a, 0]));
    let total = 0;
    for (const e of entries) {
      if (!e.commander) continue;
      const eventDate = eventDateById.get(e.event_id);
      if (!eventDate || eventDate < cutoffIso) continue;
      total += 1;
      const key = e.commander.id;
      if (!counts.has(key)) counts.set(key, { name: e.commander.name, count: 0 });
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

    const chartRows = top.map((r, i) => ({ label: r.name, share: (r.count / total) * 100, color: CHART_COLORS[i] }));
    if (otherCount > 0) chartRows.push({ label: "Altri", share: (otherCount / total) * 100, color: OTHER_COLOR });

    const archetypeRows = ARCHETYPES.map((a) => ({
      label: a,
      share: (archetypeCounts.get(a) / total) * 100,
      color: ARCHETYPE_COLORS[a],
    })).sort((a, b) => b.share - a.share);

    // The same whole-block carousel as the Comandanti/Archetipi charts
    // (js/chart-carousel.js) — this card is narrow, so it shows one chart
    // at a time (two only once the card itself is wide enough, see
    // .chart-carousel-host in styles.css). No per-chart titles: the card's
    // own heading and its bottom "Vedi tutti" link follow whichever chart
    // is in view, and the ‹ • › controls sit below the card, outside it.
    const slides = [
      { title: "Commander più giocati", href: "commanders.html" },
      { title: "Archetipi più giocati", href: "archetypes.html" },
    ];
    el.innerHTML = `
      <div class="chart-grid">
        ${renderPieChart(chartRows, "Nessun dato per il grafico.")}
        ${renderPieChart(archetypeRows, "Nessun dato per il grafico.")}
      </div>`;
    const titleEl = document.getElementById("dashboard-charts-title");
    const linkEl = document.getElementById("dashboard-charts-link");
    initChartCarousel(el, {
      navAfter: document.getElementById("dashboard-charts-card"),
      onIndexChange: (i) => {
        const slide = slides[i] ?? slides[0];
        titleEl.textContent = slide.title;
        linkEl.href = slide.href;
      },
    });
  } catch (err) {
    showError(el, err);
  }
}

// Five independent widgets — the page isn't "ready" until all of them have
// settled (success or already-shown error), not just the first one.
Promise.allSettled([
  renderAnnouncementsSection(
    document.getElementById("dashboard-announcements"),
    document.getElementById("dashboard-announcements-content")
  ),
  renderLeaguesSection(document.getElementById("dashboard-leagues-content")),
  renderUpcomingSection(
    document.getElementById("dashboard-upcoming"),
    document.getElementById("dashboard-upcoming-content")
  ),
  renderEventsSection(document.getElementById("dashboard-events-content")),
  renderCommandersSection(document.getElementById("dashboard-commanders-content")),
]).then(hidePageLoading);
