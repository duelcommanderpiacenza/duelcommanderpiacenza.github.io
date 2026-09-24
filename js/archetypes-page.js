import { Events, EventEntries, Matches } from "./db.js";
import { computeGroupedStats } from "./stats.js";
import { initScopeFilter } from "./scope-filter.js";
import { renderPieChart, renderBarChart } from "./metagame-chart.js";
import { archetypeBadge, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initFilterToggle } from "./filter-toggle.js";

const ARCHETYPES = ["aggro", "control", "combo", "tempo", "midrange"];

// Same fixed identity colors as the .badge-archetype-* pills elsewhere on the
// site (see styles.css --accent-*), so an archetype reads as the same color
// in the chart and the badges. Hardcoded here rather than var(--accent-...)
// because the chart needs the real hex to pick readable label text per slice.
const ARCHETYPE_COLORS = {
  aggro: "#dc181c",
  control: "#2f5fdc",
  combo: "#2a2226",
  tempo: "#0aa8bd",
  midrange: "#e0752b",
};

async function fetchEventsData(eventIds) {
  return Promise.all(
    eventIds.map(async (id) => {
      const [entries, matches] = await Promise.all([EventEntries.listByEvent(id), Matches.listByEvent(id)]);
      return { entries, matches };
    })
  );
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
      const winsChartHtml = renderBarChart(
        rows
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

      tableEl.innerHTML = `
        <div class="data-table-wrap"><table class="data-table">
          <thead><tr><th>Archetipo</th><th>Quota</th><th>V-S-P</th><th>Winrate</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td>${archetypeBadge(r.archetype)}</td>
                <td>${r.share.toFixed(1)}%</td>
                <td>${r.wins}-${r.losses}-${r.draws}</td>
                <td>${r.winRate === null ? "—" : `${r.winRate.toFixed(1)}%`}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table></div>`;
    } catch (err) {
      showError(chartEl, err);
    } finally {
      hidePageLoading();
    }
  }

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
