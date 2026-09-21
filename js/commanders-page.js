import { Commanders, Events, EventEntries, Matches } from "./db.js";
import { computeGroupedStats } from "./stats.js";
import { initScopeFilter } from "./scope-filter.js";
import { renderPieChart } from "./metagame-chart.js";
import { commanderLabel, colorIdentityPips, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

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

// Highest value first; a null winRate (no games played) always sorts last
// rather than tying with an actual 0%.
const SORTERS = {
  played: (a, b) => b.entries - a.entries,
  winrate: (a, b) => (b.winRate ?? -1) - (a.winRate ?? -1),
  wins: (a, b) => b.wins - a.wins,
};

async function init() {
  const chartEl = document.getElementById("commanders-chart");
  const tableEl = document.getElementById("commanders-table");
  const leagueSelect = document.getElementById("commanders-league-filter");
  const eventSelect = document.getElementById("commanders-event-filter");
  const dateFromInput = document.getElementById("commanders-date-from");
  const searchInput = document.getElementById("commanders-search");
  const sortSelect = document.getElementById("commanders-sort");
  const colorCheckboxes = Array.from(document.querySelectorAll('input[name="commanders-color-filter"]'));
  const colorExactWrap = document.getElementById("commanders-color-exact-wrap");
  const colorExactCheckbox = document.getElementById("commanders-color-exact");

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

  function colorIdentitySet(colorIdentity) {
    return new Set(String(colorIdentity ?? "").toUpperCase().split("").filter((c) => "WUBRG".includes(c)));
  }

  // Colors picked in the swatch row filter to commanders whose identity
  // *contains* every one of them (extra colors beyond that are fine) —
  // "Solo identità esatta" narrows that to an exact match instead
  // (no extra colors either). The exact toggle only makes sense once at
  // least one color is picked, so it's hidden until then.
  function updateColorExactVisibility() {
    const anySelected = colorCheckboxes.some((cb) => cb.checked);
    colorExactWrap.hidden = !anySelected;
    if (!anySelected) colorExactCheckbox.checked = false;
  }

  function matchesColorFilter(r) {
    const selected = colorCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);
    if (selected.length === 0) return true;
    const identity = colorIdentitySet(r.colorIdentity);
    if (colorExactCheckbox.checked && identity.size !== selected.length) return false;
    return selected.every((c) => identity.has(c));
  }

  // The search box only re-filters the already-computed rows (no new
  // network/stat work), so it can react live on every keystroke. animate
  // is false for that keystroke re-render so .data-table-wrap's entrance
  // animation doesn't replay on every character typed.
  function renderTableSection(animate = true) {
    const term = searchInput.value.trim().toLowerCase();
    // Commanders no one has ever played are always left out — an all-"—"
    // row isn't useful, filtered or not.
    const base = lastRows.filter((r) => r.entries > 0);
    const anyFilterActive = Boolean(term) || colorCheckboxes.some((cb) => cb.checked);
    const filtered = base.filter((r) => (!term || r.name.toLowerCase().includes(term)) && matchesColorFilter(r));
    if (filtered.length === 0) {
      return `<p class="page-empty">${anyFilterActive ? "Nessun comandante corrisponde ai filtri." : "Nessun comandante ha ancora dati registrati."}</p>`;
    }
    const sorter = SORTERS[sortSelect.value] ?? SORTERS.played;
    const rows = [...filtered].sort((a, b) => sorter(a, b) || a.name.localeCompare(b.name));
    return `<div class="data-table-wrap${animate ? "" : " no-entrance-anim"}"><table class="data-table">
              <thead><tr><th>Nome</th><th>Identit&agrave; di colore</th><th>Giocato</th><th>Quota</th><th>V-S-P</th><th>Winrate</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `
                  <tr>
                    <td>${commanderLabel(r)}${
                      r.isBanned
                        ? '<span class="icon-badge" data-tooltip="Bannato" aria-label="Bannato" tabindex="0">&#9888;&#65039;</span>'
                        : ""
                    }</td>
                    <td>${colorIdentityPips(r.colorIdentity)}</td>
                    <td>${r.entries}</td>
                    <td>${r.entries > 0 ? `${r.share.toFixed(1)}%` : "—"}</td>
                    <td>${r.wins}-${r.losses}-${r.draws}</td>
                    <td>${r.winRate === null ? "—" : `${r.winRate.toFixed(1)}%`}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table></div>`;
  }

  // Only touches the table, not the chart — search/sort never change the
  // chart's own content (that's keyed off the scope/date filters only), so
  // re-setting chartEl.innerHTML here too would just replay its entrance
  // animation for no reason on every keystroke.
  function renderTable(animate = true) {
    tableEl.innerHTML = renderTableSection(animate);
  }

  async function render(eventIds) {
    chartEl.innerHTML = '<p class="page-loading">Caricamento...</p>';
    tableEl.innerHTML = "";
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
            isBanned: c.is_banned,
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

      // Same donut, same colors per commander as the metashare chart above
      // (so a commander reads as the same color in both) — just sliced by
      // each commander's share of total wins instead of total entries, to
      // show who's actually winning the most rather than who's just played
      // the most.
      const totalWins = lastRows.reduce((sum, r) => sum + r.wins, 0);
      const winsChartRows = [];
      let otherWinsShare = 0;
      for (const r of lastRows) {
        if (r.wins === 0) continue;
        const share = totalWins > 0 ? (r.wins / totalWins) * 100 : 0;
        const color = colorByCommanderId.get(r.id);
        if (color) winsChartRows.push({ label: r.name, share, color });
        else otherWinsShare += share;
      }
      winsChartRows.sort((a, b) => b.share - a.share);
      if (otherWinsShare > 0) winsChartRows.push({ label: "Altri", share: otherWinsShare, color: OTHER_COLOR });

      lastChartHtml = `
        <div class="chart-grid">
          ${renderPieChart(chartRows, "Nessun dato per il grafico.", "Metashare")}
          ${renderPieChart(winsChartRows, "Nessun dato per il grafico.", "Winrate")}
        </div>`;
      chartEl.innerHTML = lastChartHtml;
      renderTable();
    } catch (err) {
      showError(chartEl, err);
    } finally {
      hidePageLoading();
    }
  }

  searchInput.addEventListener("input", () => renderTable(false));
  sortSelect.addEventListener("change", () => renderTable());
  colorCheckboxes.forEach((cb) =>
    cb.addEventListener("change", () => {
      updateColorExactVisibility();
      renderTable(false);
    })
  );
  colorExactCheckbox.addEventListener("change", () => renderTable(false));
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
