import { EventEntries, Matches } from "./db.js";
import { computeGroupedStats } from "./stats.js";
import { initScopeFilter } from "./scope-filter.js";
import { renderPieChart } from "./metagame-chart.js";
import { archetypeBadge, showError } from "./ui.js";

const ARCHETYPES = ["aggro", "control", "combo", "tempo", "midrange"];

// Same fixed identity colors as the .badge-archetype-* pills elsewhere on the
// site (see styles.css --accent-*), so an archetype reads as the same color
// in the chart and the badges. Hardcoded here rather than var(--accent-...)
// because the chart needs the real hex to pick readable label text per slice.
const ARCHETYPE_COLORS = {
  aggro: "#e0752b",
  control: "#7c3aed",
  combo: "#dc181c",
  tempo: "#b8860b",
  midrange: "#0f8b8d",
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
  const listEl = document.getElementById("archetypes-list");
  const leagueSelect = document.getElementById("archetypes-league-filter");
  const eventSelect = document.getElementById("archetypes-event-filter");

  async function render(eventIds) {
    listEl.innerHTML = '<p class="page-loading">Caricamento...</p>';
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
        "Nessun dato per il grafico."
      );

      listEl.innerHTML = `
        ${chartHtml}
        <div class="data-table-wrap"><table class="data-table">
          <thead><tr><th>Archetipo</th><th>Quota</th><th>V-P-S</th><th>Winrate</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td>${archetypeBadge(r.archetype)}</td>
                <td>${r.share.toFixed(1)}%</td>
                <td>${r.wins}-${r.draws}-${r.losses}</td>
                <td>${r.winRate === null ? "—" : `${r.winRate.toFixed(1)}%`}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table></div>`;
    } catch (err) {
      showError(listEl, err);
    }
  }

  initScopeFilter({ leagueSelect, eventSelect, onChange: render });
}

init();
