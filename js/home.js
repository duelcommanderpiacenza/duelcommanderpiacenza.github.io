// Home dashboard: three independent widgets (active leagues, latest
// events, most played commanders) — each fetches and renders on its own,
// so one failing doesn't block the others.

import { Leagues, Events, EventEntries, Matches } from "./db.js";
import { computeLeagueSummary } from "./stats.js";
import { computeLeaguePoints } from "./leaderboard.js";
import { renderPieChart } from "./metagame-chart.js";
import { escapeHtml, eventTitle, formatDate, showError } from "./ui.js";

const LATEST_EVENTS_COUNT = 5;
const TOP_STANDINGS_COUNT = 3;
const TOP_COMMANDERS_COUNT = 6;
const TOP_COMMANDERS_WINDOW_MONTHS = 3;
// Same fixed hue order used by the Commanders page's own chart, so a
// commander reads as the same color there and here.
const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "#9a9a94";

async function fetchLeagueEventsData(leagueId) {
  const events = await Events.listByLeague(leagueId);
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
        <a class="section-link" style="margin-top:16px;" href="leagues.html">Tutte le leghe &rarr;</a>`;
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
    // RLS already limits anonymous visitors to closed (published) events.
    const events = (await Events.list()).slice(0, LATEST_EVENTS_COUNT);
    el.innerHTML =
      events.length === 0
        ? '<p class="page-empty">Nessun evento pubblicato ancora.</p>'
        : `<div class="dashboard-event-list">
            ${events
              .map(
                (ev) => `
              <a class="dashboard-event-row" href="event.html?id=${ev.id}">
                <span class="dashboard-event-name">${escapeHtml(eventTitle(ev))}</span>
                <span class="dashboard-event-meta">${
                  ev.league ? `${escapeHtml(ev.league.name)} &middot; ` : ""
                }${formatDate(ev.event_date)}</span>
              </a>`
              )
              .join("")}
          </div>
          <a class="section-link" style="margin-top:16px;" href="events.html">Tutti gli eventi &rarr;</a>`;
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
    // push the shares past 100%.
    const counts = new Map(); // commander id -> { name, count }
    let total = 0;
    for (const e of entries) {
      if (!e.commander) continue;
      const eventDate = eventDateById.get(e.event_id);
      if (!eventDate || eventDate < cutoffIso) continue;
      total += 1;
      const key = e.commander.id;
      if (!counts.has(key)) counts.set(key, { name: e.commander.name, count: 0 });
      counts.get(key).count += 1;
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

    el.innerHTML =
      renderPieChart(chartRows, "Nessun dato per il grafico.") +
      '<a class="section-link" style="margin-top:4px;" href="commanders.html">Vedi tutti &rarr;</a>';
  } catch (err) {
    showError(el, err);
  }
}

renderLeaguesSection(document.getElementById("dashboard-leagues-content"));
renderEventsSection(document.getElementById("dashboard-events-content"));
renderCommandersSection(document.getElementById("dashboard-commanders-content"));
