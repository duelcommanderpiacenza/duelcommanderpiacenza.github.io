import { Events, fetchEventsResults } from "./db.js";
import { computeGroupedStats } from "./stats.js";
import { initScopeFilter } from "./scope-filter.js";
import { renderPieChart, renderBarChart, ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { initChartCarousel } from "./chart-carousel.js";
import { archetypeBadge, showError, isoDateYearsAgo, DEFAULT_DATE_FROM_YEARS } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initFilterToggle } from "./filter-toggle.js";
import { historyPanelHtml, historyStatsHtml } from "./history-list.js";

// Entries + matches of every event in scope, batched (js/db.js) rather than
// two requests per event — "Tutte le leghe" spans the whole history.
function fetchEventsData(eventIds) {
  return fetchEventsResults(eventIds);
}

async function init() {
  const chartEl = document.getElementById("archetypes-chart");
  const tableEl = document.getElementById("archetypes-table");
  const leagueSelect = document.getElementById("archetypes-league-filter");
  const eventSelect = document.getElementById("archetypes-event-filter");
  const dateFromInput = document.getElementById("archetypes-date-from");

  let eventDateById = new Map();
  let lastScopeEventIds = [];
  try {
    const events = await Events.list();
    eventDateById = new Map(events.map((e) => [e.id, e.event_date]));
  } catch (err) {
    showError(chartEl, err);
    hidePageLoading();
    return;
  }

  // The date filter narrows whichever event ids the league/event scope
  // filter last reported, rather than replacing it — the two combine.
  function effectiveEventIds() {
    const from = dateFromInput.value;
    if (!from) return lastScopeEventIds;
    return lastScopeEventIds.filter((id) => {
      const d = eventDateById.get(id);
      return d && d >= from;
    });
  }

  async function render(eventIds) {
    chartEl.innerHTML = '<p class="page-loading">Caricamento...</p>';
    tableEl.innerHTML = "";
    try {
      const eventsData = await fetchEventsData(eventIds);
      const stats = computeGroupedStats(
        eventsData,
        (e) => e.archetype,
        (e) => ({ name: e.archetype })
      );
      const byKey = new Map(stats.map((s) => [s.key, s]));
      const totalEntries = stats.reduce((sum, s) => sum + s.entries, 0);

      const rows = ARCHETYPES.map((a) => {
        const s = byKey.get(a);
        const entries = s?.entries ?? 0;
        return {
          archetype: a,
          entries,
          share: totalEntries > 0 ? (entries / totalEntries) * 100 : 0,
          wins: s?.wins ?? 0,
          draws: s?.draws ?? 0,
          losses: s?.losses ?? 0,
          winRate: s?.winRate ?? null,
        };
      }).sort((a, b) => b.entries - a.entries);

      const chartHtml = renderPieChart(
        rows.map((r) => ({ label: r.archetype, share: r.share, color: ARCHETYPE_COLORS[r.archetype] })),
        "Nessun dato per il grafico.",
        "Metashare"
      );

      // Same colors as the metashare chart, one bar per archetype showing
      // its own actual winrate — not a share of total wins, so a bar's
      // length is independent of every other bar's. Sorted by that winrate
      // itself, not reusing the metashare chart's by-entries order.
      // Only archetypes with a match played in the current filter's scope —
      // one nobody played there has no winrate and isn't shown as a "—"
      // bar (the metashare pie already leaves out a 0% slice the same way).
      const winsChartHtml = renderBarChart(
        rows
          .filter((r) => r.winRate !== null)
          .map((r) => ({
            label: r.archetype,
            value: r.winRate,
            color: ARCHETYPE_COLORS[r.archetype],
          }))
          .sort((a, b) => (b.value ?? -1) - (a.value ?? -1)),
        "Nessun dato per il grafico.",
        "Winrate",
        { spacious: true }
      );

      chartEl.innerHTML = `
        <div class="chart-grid">
          ${chartHtml}
          ${winsChartHtml}
        </div>`;
      initChartCarousel(chartEl);

      // One sub-card per archetype, like the Comandanti list
      // (js/history-list.js) — not a link (no archetype page): the badge,
      // then Metashare / V-S-P / Winrate.
      tableEl.innerHTML = historyPanelHtml(
        rows
          .map(
            (r) => `
          <article class="history-item history-ranked">
            <div class="history-main">${archetypeBadge(r.archetype)}</div>
            ${historyStatsHtml([
              { label: "Metashare", value: `${r.share.toFixed(1)}%` },
              { label: "V-S-P", value: `${r.wins}-${r.losses}-${r.draws}` },
              { label: "Winrate", value: r.winRate === null ? "—" : `${r.winRate.toFixed(1)}%`, main: true },
            ])}
          </article>`
          )
          .join(""),
        { scroll: false }
      );
    } catch (err) {
      showError(chartEl, err);
    } finally {
      hidePageLoading();
    }
  }

  // Default "Dal": the last DEFAULT_DATE_FROM_YEARS years (js/ui.js) — set before the
  // first load, so that load already fetches only that window.
  dateFromInput.value = isoDateYearsAgo(DEFAULT_DATE_FROM_YEARS);
  initFilterToggle("archetypes-filter-toggle", "archetypes-filter-panel");

  dateFromInput.addEventListener("change", () => render(effectiveEventIds()));

  initScopeFilter({
    leagueSelect,
    eventSelect,
    onChange: (eventIds) => {
      lastScopeEventIds = eventIds;
      render(effectiveEventIds());
    },
  });
}

init();
