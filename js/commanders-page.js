import { Commanders, Events, EventEntries, Matches } from "./db.js";
import { computeGroupedStats, computeColorShares } from "./stats.js";
import { initScopeFilter } from "./scope-filter.js";
import { renderPieChart, renderBarChart } from "./metagame-chart.js";
import { initChartCarousel } from "./chart-carousel.js";
import { attachHoverTooltips, fullTextIfTruncated } from "./floating-tooltip.js";
import { commanderPairWithColors, bannedBadge, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initFilterToggle } from "./filter-toggle.js";

// Both charts are built from the *current filter's* data only (league /
// event / date): Metashare = its 6 most played commanders + "Altri",
// Winrate = its 7 highest winrates. Colors are assigned per render in that
// same order — the pie's commanders first, then any extra ones only the
// winrate chart shows — so a commander has the same color in both charts.
// Up to 6 + 7 distinct commanders, hence 13 hues; grey is only "Altri".
const PIE_TOP_COUNT = 6;
const WINRATE_TOP_COUNT = 7;
const CHART_COLORS = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300",
  "#8e5bd6", "#d6455d", "#00a3a3", "#b07b24", "#5c6bc0", "#c2185b", "#6d8f00",
];
const OTHER_COLOR = "#9a9a94";

// "Colori più giocati" bars — the same hues as the color-identity pips
// (styles.css .color-pip-*), except white and colorless: the pip's own
// near-white (#f8f6d8) would all but vanish against the bar chart's light
// track, so white gets a deeper cream, and colorless a mid grey.
const MTG_COLOR_BARS = {
  W: { label: "Bianco", color: "#e3d58a" },
  U: { label: "Blu", color: "#0e68ab" },
  B: { label: "Nero", color: "#3a3a3a" },
  R: { label: "Rosso", color: "#d3202a" },
  G: { label: "Verde", color: "#00733e" },
  C: { label: "Incolore", color: "#a8a39d" },
};

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

  // Full commander name on hover for any bar-chart label (Winrate) cut off
  // with an ellipsis — delegated on chartEl, which survives re-renders.
  attachHoverTooltips(chartEl, ".bar-chart-label", fullTextIfTruncated);

  let allCommanders = [];
  let eventDateById = new Map();
  let lastScopeEventIds = [];
  let lastRows = [];
  let lastChartHtml = "";

  try {
    const [commanders, events] = await Promise.all([Commanders.list(), Events.list()]);
    allCommanders = commanders;
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
              <thead><tr><th>Nome</th><th>Giocato</th><th>Metashare</th><th>V-S-P</th><th>Winrate</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `
                  <tr>
                    <td>${commanderPairWithColors(r.commander, r.partner)}${r.isBanned ? bannedBadge() : ""}</td>
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
      const commandersById = new Map(allCommanders.map((c) => [c.id, c]));

      // Grouped by the exact commander+partner pairing (partner_commander_id
      // is part of the key, null for a solo entry) — a commander played with
      // two different partners, or both solo and partnered, shows as
      // separate rows here, each with its own stats and its own color
      // identity (the union of both commanders' colors), rather than being
      // folded into one overall row for the primary commander alone.
      const stats = computeGroupedStats(
        eventsData,
        (e) => `${e.commander_id}_${e.partner_commander_id ?? ""}`,
        (e) => ({ commanderId: e.commander_id, partnerId: e.partner_commander_id ?? null })
      );
      const totalEntries = stats.reduce((sum, s) => sum + s.entries, 0);

      lastRows = stats
        .map((s) => {
          const commander = commandersById.get(s.commanderId);
          const partner = s.partnerId ? commandersById.get(s.partnerId) : null;
          const name = partner ? `${commander.name} / ${partner.name}` : commander.name;
          return {
            id: s.key,
            commander,
            partner,
            name,
            colorIdentity: (commander.color_identity ?? "") + (partner?.color_identity ?? ""),
            isBanned: commander.is_banned || (partner?.is_banned ?? false),
            entries: s.entries,
            share: totalEntries > 0 ? (s.entries / totalEntries) * 100 : 0,
            wins: s.wins,
            draws: s.draws,
            losses: s.losses,
            winRate: s.winRate,
          };
        })
        .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));

      // The charts, unlike the table, don't split a commander by its
      // partner/background: "Thrasios / Tymna" and "Thrasios / Vial Smasher"
      // are one Thrasios slice/bar — grouped by the primary commander alone,
      // each with its own combined entries/winrate across every partner it
      // was played with. Only commanders actually played in this scope.
      const commanderRows = computeGroupedStats(
        eventsData,
        (e) => e.commander_id,
        (e) => ({ commanderId: e.commander_id })
      )
        .filter((s) => s.entries > 0)
        .map((s) => ({
          commanderId: s.commanderId,
          name: commandersById.get(s.commanderId)?.name ?? "—",
          entries: s.entries,
          played: s.played,
          share: totalEntries > 0 ? (s.entries / totalEntries) * 100 : 0,
          winRate: s.winRate,
        }));

      // Colors handed out in chart order (see CHART_COLORS above).
      const colorByCommanderId = new Map();
      const colorFor = (id) => {
        if (!colorByCommanderId.has(id)) {
          colorByCommanderId.set(id, CHART_COLORS[colorByCommanderId.size] ?? OTHER_COLOR);
        }
        return colorByCommanderId.get(id);
      };

      // Metashare: this scope's most played, then "Altri" for everyone else.
      const byUsage = [...commanderRows].sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));
      const chartRows = byUsage
        .slice(0, PIE_TOP_COUNT)
        .map((r) => ({ label: r.name, share: r.share, color: colorFor(r.commanderId) }));
      const otherShare = byUsage.slice(PIE_TOP_COUNT).reduce((sum, r) => sum + r.share, 0);
      if (otherShare > 0) chartRows.push({ label: "Altri", share: otherShare, color: OTHER_COLOR });

      // Winrate: this scope's highest winrates — each bar that commander's
      // own winrate (0-100, independent of every other bar), not a share of
      // total wins. Ties go to whoever played more matches (a bigger sample
      // at the same rate), then alphabetically. A commander with no match
      // played in scope (only a bye/drop) has no winrate and is left out.
      const winsChartRows = commanderRows
        .filter((r) => r.winRate !== null)
        .sort((a, b) => b.winRate - a.winRate || b.played - a.played || a.name.localeCompare(b.name))
        .slice(0, WINRATE_TOP_COUNT)
        .map((r) => ({ label: r.name, value: r.winRate, color: colorFor(r.commanderId) }));

      // Colori più giocati: share of entries whose deck plays each single
      // color (see computeColorShares — a multicolor deck counts toward
      // each of its colors). Colorless only shows up once someone actually
      // played a colorless deck in this scope.
      const colorRows =
        totalEntries === 0
          ? []
          : computeColorShares(eventsData)
              .filter((c) => c.color !== "C" || c.entries > 0)
              .map((c) => ({ label: MTG_COLOR_BARS[c.color].label, value: c.share, color: MTG_COLOR_BARS[c.color].color }))
              .sort((a, b) => b.value - a.value);

      lastChartHtml = `
        <div class="chart-grid">
          ${renderPieChart(chartRows, "Nessun dato per il grafico.", "Metashare")}
          ${renderBarChart(winsChartRows, "Nessun dato per il grafico.", "Winrate")}
          ${renderBarChart(colorRows, "Nessun dato per il grafico.", "Colori più giocati")}
        </div>`;
      chartEl.innerHTML = lastChartHtml;
      initChartCarousel(chartEl);
      renderTable();
    } catch (err) {
      showError(chartEl, err);
    } finally {
      hidePageLoading();
    }
  }

  initFilterToggle("commanders-filter-toggle", "commanders-filter-panel");

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
