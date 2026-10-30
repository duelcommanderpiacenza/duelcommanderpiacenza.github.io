import { Commanders, Events, Leagues } from "./db.js";
import { computeGroupedStats, computeColorShares } from "./stats.js";
import { initScopeFilter } from "./scope-filter.js";
import { renderPieChart, renderBarChart } from "./metagame-chart.js";
import { initChartCarousel } from "./chart-carousel.js";
import { attachHoverTooltips, fullTextIfTruncated } from "./floating-tooltip.js";
import { commanderPairLabel, colorIdentityPips, commanderBadgesHtml, showError, isoDateYearsAgo, DEFAULT_DATE_FROM_YEARS } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initFilterToggle } from "./filter-toggle.js";
import { savedMetaFilters, rememberMetaFilters, prefetchMetaResults, metaResults } from "./meta-filters.js";
import { historyPanelHtml, historyStatsHtml, winrateTrendHtml, latestPresence } from "./history-list.js";
import { initBackToTop } from "./back-to-top.js";

// Both charts are built from the *current filter's* data only (league /
// event / date): Metashare = its 6 most played commanders + "Altri",
// Winrate = its 7 highest winrates (touch screens: 5 and 6). Colors are assigned per render in that
// same order — the pie's commanders first, then any extra ones only the
// winrate chart shows — so a commander has the same color in both charts.
// Up to 6 + 7 distinct commanders, hence 13 hues; grey is only "Altri".
// Touch screens one line fewer in each (the charts' carousel a bit shorter).
const SHORTER = document.documentElement.classList.contains("nav-mobile") ? 1 : 0;
const PIE_TOP_COUNT = 6 - SHORTER;
const WINRATE_TOP_COUNT = 7 - SHORTER;
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

// Entries + matches of the events in scope (js/meta-filters.js metaResults):
// slim, no player embeds — only the commanders (the colours chart).
const RESULTS_OPTIONS = { commanders: true };

// A winrate counts (the Winrate chart, sorting by winrate) only with a real
// sample: at least this share of the matches the most played commander has
// in the same scope — relative, not a fixed number, so it scales from one
// event to the whole history (like the auto badges' and the league
// summary's thresholds). Below it a single lucky run would sit at the top
// for good; those rows keep their place in the list, their winrate greyed
// ("Pochi dati").
const MIN_PLAYED_RATIO = 0.3;
const minPlayed = (rows) => Math.max(1, Math.ceil(MIN_PLAYED_RATIO * Math.max(0, ...rows.map((r) => r.played ?? 0))));

// Highest value first; a null winRate (no games played) always sorts last
// rather than tying with an actual 0%. By winrate: those with enough
// matches first.
const SORTERS = {
  played: (a, b) => b.entries - a.entries,
  winrate: (a, b) => Number(b.enough) - Number(a.enough) || (b.winRate ?? -1) - (a.winRate ?? -1),
  wins: (a, b) => b.wins - a.wins,
};

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
export async function mount({ signal = new AbortController().signal } = {}) {
  const chartEl = document.getElementById("commanders-chart");
  const tableEl = document.getElementById("commanders-table");
  const leagueSelect = document.getElementById("commanders-league-filter");
  const eventSelect = document.getElementById("commanders-event-filter");
  const dateFromInput = document.getElementById("commanders-date-from");
  // The filters first — before any request, so the button (and its "set"
  // dot) is already as it should be when the page appears.
  // Default "Dal": the last DEFAULT_DATE_FROM_YEARS years (js/ui.js) — set before the
  // first load, so that load already fetches only that window.
  // (Or the Meta section's shared filter, as last set on any of its pages.)
  const savedFilters = savedMetaFilters();
  dateFromInput.value = savedFilters ? savedFilters.dateFrom : isoDateYearsAgo(DEFAULT_DATE_FROM_YEARS);
  // The results of the default scope, started now with the first requests
  // (js/meta-filters.js prefetchMetaResults) — served from it below.
  const resultsPrefetch = prefetchMetaResults(savedFilters, dateFromInput.value, RESULTS_OPTIONS);
  rememberMetaFilters({ leagueSelect, eventSelect, dateFromInput });
  initFilterToggle("commanders-filter-toggle", "commanders-filter-panel");
  const searchInput = document.getElementById("commanders-search");
  const sortSelect = document.getElementById("commanders-sort");
  const colorCheckboxes = Array.from(document.querySelectorAll('input[name="commanders-color-filter"]'));
  const colorExactWrap = document.getElementById("commanders-color-exact-wrap");
  const colorExactCheckbox = document.getElementById("commanders-color-exact");
  const countEl = document.getElementById("commanders-count");
  // The title reads "Meta" (styles.css), so this count goes in the search
  // field's placeholder instead (below).
  // A long list: a round button back to the top once scrolled down.
  initBackToTop({ signal });

  // A commander's full name for a label cut off with an ellipsis — the
  // Winrate bars' and the Metashare legend's (phones: beside the ring) — on
  // hover, or a tap on touch screens. Delegated on chartEl, which survives
  // re-renders.
  attachHoverTooltips(chartEl, ".bar-chart-label, .pie-legend-label", fullTextIfTruncated, { signal });

  let allCommanders = [];
  let eventDateById = new Map();
  let lastScopeEventIds = [];
  let lastRows = [];
  let lastChartHtml = "";
  // The filters' leagues and events (js/scope-filter.js), loaded with the rest.
  let allLeagues = [];
  let allEvents = [];

  try {
    const [commanders, events, leagues] = await Promise.all([Commanders.list(), Events.list(), Leagues.list()]);
    allCommanders = commanders;
    allLeagues = leagues;
    allEvents = events;
    eventDateById = new Map(events.map((e) => [e.id, e.event_date]));
  } catch (err) {
    showError(chartEl, err);
    hidePageLoading(signal);
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
  // is false for that keystroke re-render so .history-panel's entrance
  // animation doesn't replay on every character typed.
  function renderTableSection(animate = true) {
    const term = searchInput.value.trim().toLowerCase();
    // Commanders no one has ever played are always left out — an all-"—"
    // row isn't useful, filtered or not.
    const base = lastRows.filter((r) => r.entries > 0);
    // Table rows (commander + partner pairs) matching the filter panel —
    // Lega/Evento/Dal and colors; like players.html's, not the search box.
    const total = base.filter(matchesColorFilter).length;
    countEl.textContent = `${total} totali`;
    searchInput.placeholder = `Cerca tra ${total} ${total === 1 ? "comandante" : "comandanti"}…`;
    const anyFilterActive = Boolean(term) || colorCheckboxes.some((cb) => cb.checked);
    const filtered = base.filter((r) => (!term || r.name.toLowerCase().includes(term)) && matchesColorFilter(r));
    if (filtered.length === 0) {
      return `<p class="page-empty">${anyFilterActive ? "Nessun comandante corrisponde ai filtri." : "Nessun comandante ha ancora dati registrati."}</p>`;
    }
    // One sub-card per deck (js/history-list.js), the whole card a link to
    // the (primary) commander's page: name with its colours, the numbers on
    // the right.
    const sorter = SORTERS[sortSelect.value] ?? SORTERS.played;
    const rows = [...filtered].sort((a, b) => sorter(a, b) || a.name.localeCompare(b.name));
    return historyPanelHtml(
      rows
        .map(
          (r) => `
      <a class="history-item history-ranked" href="${r.href}">
        <div class="history-main">
          <span class="history-title commanders-row-title"><span class="commanders-row-name">${commanderPairLabel(r.commander, r.partner, { link: false })}${
            commanderBadgesHtml({ banned: r.isBanned, isNew: r.isNew })
          }</span><span class="color-identity-inline">${colorIdentityPips(`${r.commander?.color_identity ?? ""}${r.partner?.color_identity ?? ""}`)}</span></span>
        </div>
        ${historyStatsHtml([
          { label: "Giocato", value: r.entries },
          { label: "Piloti", value: r.pilots },
          { label: "Metashare", value: `${r.share.toFixed(1)}%${winrateTrendHtml(r.share, r.shareBefore, true)}`, trend: true },
          {
            label: "Winrate",
            value:
              r.winRate === null
                ? "—"
                : `<span class="${r.enough ? "" : "wr-few"}"${r.enough ? "" : ' title="Pochi dati: troppe poche partite per un winrate affidabile"'}>${r.winRate.toFixed(1)}%</span>${winrateTrendHtml(r.winRate, r.winRateBefore, r.inLatest)}`,
            main: true,
            trend: true,
          },
        ])}
      </a>`
        )
        .join(""),
      { animate, scroll: false }
    );
  }

  // Only touches the list, not the chart — search/sort never change the
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
      const eventsData = await metaResults(resultsPrefetch, eventIds, eventDateById, RESULTS_OPTIONS);
      const commandersById = new Map(allCommanders.map((c) => [c.id, c]));

      // Grouped by the commander + partner pairing — a commander played with
      // two different partners, or both solo and partnered, shows as
      // separate rows here, each with its own stats and its own color
      // identity (the union of both commanders' colors), rather than being
      // folded into one overall row for the primary commander alone. X + Y
      // is the same pair as Y + X, whichever seat each was entered in: one
      // row, led (its name first, the page its link opens) by the one
      // entered as the main commander more often — ties alphabetical.
      const pairKey = (e) =>
        e.partner_commander_id ? [e.commander_id, e.partner_commander_id].sort().join("_") : `${e.commander_id}_`;
      const leadCount = new Map(); // `${pair key}|${commander id}` -> times entered as the main one
      for (const { entries } of eventsData) {
        for (const e of entries) {
          if (!e.partner_commander_id) continue;
          const k = `${pairKey(e)}|${e.commander_id}`;
          leadCount.set(k, (leadCount.get(k) ?? 0) + 1);
        }
      }
      const stats = computeGroupedStats(eventsData, pairKey, (e) => ({
        commanderId: e.commander_id,
        partnerId: e.partner_commander_id ?? null,
      }));
      // The trend arrows (results add up event by event: "before an event"
      // = the numbers minus that event's own):
      //  - Winrate: before the pairing's own latest event in scope
      //    (latestPresence) — its first one there: nothing before (null).
      //  - Metashare (its decks out of every deck in scope): global — before
      //    the latest event in scope, whoever played in it: down when it had
      //    a smaller slice of that event than its average, or wasn't in it;
      //    up when bigger (from 0% if that was its first). With a single
      //    event in scope: nothing before (null).
      const latestOf = latestPresence(eventIds, eventsData, eventDateById, (d) => d.entries.map(pairKey));
      const latestInScope = latestPresence(eventIds, eventsData, eventDateById, () => ["scope"]).get("scope");
      const statsPerEvent = eventsData.map((d) => new Map(computeGroupedStats([d], pairKey, () => ({})).map((s) => [s.key, s])));
      const decksPerEvent = statsPerEvent.map((byKey) => [...byKey.values()].reduce((sum, s) => sum + s.entries, 0));
      const allDecks = decksPerEvent.reduce((sum, n) => sum + n, 0);
      const decksBeforeLatest = latestInScope === undefined ? 0 : allDecks - decksPerEvent[latestInScope];
      const winRateBefore = new Map();
      const shareBefore = new Map();
      for (const s of stats) {
        const i = latestOf.get(s.key);
        if (i !== undefined) {
          const ev = statsPerEvent[i].get(s.key) ?? { wins: 0, draws: 0, losses: 0 };
          const wins = s.wins - ev.wins;
          const played = wins + (s.draws - ev.draws) + (s.losses - ev.losses);
          winRateBefore.set(s.key, played > 0 ? (wins / played) * 100 : null);
        }
        if (decksBeforeLatest > 0) {
          const inLatestEvent = statsPerEvent[latestInScope].get(s.key)?.entries ?? 0;
          shareBefore.set(s.key, ((s.entries - inLatestEvent) / decksBeforeLatest) * 100);
        }
      }
      // How many different players piloted each pairing in scope.
      const pilotsByKey = new Map();
      for (const { entries } of eventsData) {
        for (const e of entries) {
          const k = pairKey(e);
          if (!pilotsByKey.has(k)) pilotsByKey.set(k, new Set());
          pilotsByKey.get(k).add(e.player_id);
        }
      }
      for (const s of stats) {
        if (!s.partnerId) continue;
        const a = leadCount.get(`${s.key}|${s.commanderId}`) ?? 0;
        const b = leadCount.get(`${s.key}|${s.partnerId}`) ?? 0;
        const nameA = commandersById.get(s.commanderId)?.name ?? "";
        const nameB = commandersById.get(s.partnerId)?.name ?? "";
        if (b > a || (b === a && nameB.localeCompare(nameA) < 0)) [s.commanderId, s.partnerId] = [s.partnerId, s.commanderId];
      }
      const totalEntries = stats.reduce((sum, s) => sum + s.entries, 0);
      // Commanders that also have a partnered row: their solo row opens their
      // page's "Da solo" view.
      const partnered = new Set(stats.filter((s) => s.partnerId).flatMap((s) => [s.commanderId, s.partnerId]));

      lastRows = stats
        .map((s) => {
          const commander = commandersById.get(s.commanderId);
          const partner = s.partnerId ? commandersById.get(s.partnerId) : null;
          const name = partner ? `${commander.name} / ${partner.name}` : commander.name;
          return {
            id: s.key,
            commander,
            partner,
            // The commander's page, on this row's pairing (js/commander-detail.js).
            href: `commander.html?id=${commander.id}${
              partner ? `&partner=${partner.id}` : partnered.has(commander.id) ? "&partner=none" : ""
            }`,
            name,
            colorIdentity: (commander.color_identity ?? "") + (partner?.color_identity ?? ""),
            isBanned: commander.is_banned || (partner?.is_banned ?? false),
            isNew: Boolean(commander.is_new || partner?.is_new),
            entries: s.entries,
            pilots: pilotsByKey.get(s.key)?.size ?? 0,
            share: totalEntries > 0 ? (s.entries / totalEntries) * 100 : 0,
            shareBefore: shareBefore.get(s.key) ?? null,
            wins: s.wins,
            draws: s.draws,
            losses: s.losses,
            played: s.played,
            winRate: s.winRate,
            winRateBefore: winRateBefore.get(s.key) ?? null,
            inLatest: latestOf.has(s.key),
          };
        })
        .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));
      // Enough matches for its winrate to count (MIN_PLAYED_RATIO).
      const listMin = minPlayed(lastRows);
      for (const r of lastRows) r.enough = r.played >= listMin;

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
      // played in scope (only a bye/drop) has no winrate and is left out —
      // and so is one with too few matches for it to count
      // (MIN_PLAYED_RATIO).
      const chartMin = minPlayed(commanderRows);
      const winsChartRows = commanderRows
        .filter((r) => r.winRate !== null && r.played >= chartMin)
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
          ${renderBarChart(winsChartRows, "Nessun dato per il grafico.", "Winrate", {
            note: `min. ${chartMin} ${chartMin === 1 ? "partita" : "partite"}`,
          })}
          ${renderBarChart(colorRows, "Nessun dato per il grafico.", "Colori più giocati", { spacious: true })}
        </div>`;
      chartEl.innerHTML = lastChartHtml;
      initChartCarousel(chartEl);
      renderTable();
    } catch (err) {
      showError(chartEl, err);
    } finally {
      hidePageLoading(signal);
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
    initial: savedFilters,
    leagues: allLeagues,
    events: allEvents,
    onChange: (eventIds) => {
      lastScopeEventIds = eventIds;
      render(effectiveEventIds());
    },
  });
}
