import { Commanders, Events, EventEntries, Matches } from "./db.js";
import { computeGroupedStats } from "./stats.js";
import { initScopeFilter } from "./scope-filter.js";
import { renderPieChart } from "./metagame-chart.js";
import { commanderLabel, colorIdentityPips, showError } from "./ui.js";

// Fixed hue order, assigned once by each commander's overall popularity
// across the whole site (not the current filter), so a commander keeps the
// same color no matter which league/event is selected — only its share %
// changes. Anyone outside the top 6 overall folds into a neutral "Altri"
// rather than the chart repainting survivors when the filter changes.
const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "#9a9a94";

async function fetchEventsData(eventIds) {
  return Promise.all(
    eventIds.map(async (id) => {
      const [entries, matches] = await Promise.all([EventEntries.listByEvent(id), Matches.listByEvent(id)]);
      return { entries, matches };
    })
  );
}

async function init() {
  const listEl = document.getElementById("commanders-list");
  const leagueSelect = document.getElementById("commanders-league-filter");
  const eventSelect = document.getElementById("commanders-event-filter");
  const dateFromInput = document.getElementById("commanders-date-from");
  const searchInput = document.getElementById("commanders-search");

  let allCommanders = [];
  const colorByCommanderId = new Map();
  let eventDateById = new Map();
  let lastScopeEventIds = [];
  let lastRows = [];
  let lastChartHtml = "";

  try {
    const [commanders, allEntries, events] = await Promise.all([
      Commanders.list(),
      EventEntries.listAll(),
      Events.list(),
    ]);
    allCommanders = commanders;
    eventDateById = new Map(events.map((e) => [e.id, e.event_date]));

    const globalCounts = new Map();
    for (const e of allEntries) {
      globalCounts.set(e.commander_id, (globalCounts.get(e.commander_id) ?? 0) + 1);
    }
    Array.from(globalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, CHART_COLORS.length)
      .forEach(([id], i) => colorByCommanderId.set(id, CHART_COLORS[i]));
  } catch (err) {
    showError(listEl, err);
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

  // The search box only re-filters the already-computed rows (no new
  // network/stat work), so it can react live on every keystroke.
  function renderTableSection() {
    const term = searchInput.value.trim().toLowerCase();
    const rows = term ? lastRows.filter((r) => r.name.toLowerCase().includes(term)) : lastRows;
    if (rows.length === 0) {
      return `<p class="page-empty">${term ? "Nessun comandante corrisponde alla ricerca." : "Nessun comandante inserito ancora."}</p>`;
    }
    return `<div class="data-table-wrap"><table class="data-table">
              <thead><tr><th>Nome</th><th>Identit&agrave; di colore</th><th>Quota</th><th>V-S-P</th><th>Winrate</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `
                  <tr>
                    <td>${commanderLabel(r)}</td>
                    <td>${colorIdentityPips(r.colorIdentity)}</td>
                    <td>${r.entries > 0 ? `${r.share.toFixed(1)}%` : "—"}</td>
                    <td>${r.wins}-${r.losses}-${r.draws}</td>
                    <td>${r.winRate === null ? "—" : `${r.winRate.toFixed(1)}%`}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table></div>`;
  }

  function renderAll() {
    listEl.innerHTML = `${lastChartHtml}${renderTableSection()}`;
  }

  async function render(eventIds) {
    listEl.innerHTML = '<p class="page-loading">Caricamento...</p>';
    try {
      const eventsData = await fetchEventsData(eventIds);
      const stats = computeGroupedStats(
        eventsData,
        (e) => e.commander_id,
        (e) => ({ name: e.commander?.name, colorIdentity: e.commander?.color_identity })
      );
      const byId = new Map(stats.map((s) => [s.key, s]));
      const totalEntries = stats.reduce((sum, s) => sum + s.entries, 0);

      lastRows = allCommanders
        .map((c) => {
          const s = byId.get(c.id);
          const entries = s?.entries ?? 0;
          return {
            id: c.id,
            name: c.name,
            colorIdentity: c.color_identity,
            entries,
            share: totalEntries > 0 ? (entries / totalEntries) * 100 : 0,
            wins: s?.wins ?? 0,
            draws: s?.draws ?? 0,
            losses: s?.losses ?? 0,
            winRate: s?.winRate ?? null,
          };
        })
        .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));

      const chartRows = [];
      let otherShare = 0;
      for (const r of lastRows) {
        if (r.entries === 0) continue;
        const color = colorByCommanderId.get(r.id);
        if (color) chartRows.push({ label: r.name, share: r.share, color });
        else otherShare += r.share;
      }
      chartRows.sort((a, b) => b.share - a.share);
      if (otherShare > 0) chartRows.push({ label: "Altri", share: otherShare, color: OTHER_COLOR });
      lastChartHtml = renderPieChart(chartRows, "Nessun dato per il grafico.");

      renderAll();
    } catch (err) {
      showError(listEl, err);
    }
  }

  searchInput.addEventListener("input", renderAll);
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
