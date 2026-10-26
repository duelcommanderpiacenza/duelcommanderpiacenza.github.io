import { Events, Leagues } from "./db.js";
import { computeGroupedStats } from "./stats.js";
import { initScopeFilter } from "./scope-filter.js";
import { renderPieChart, renderBarChart, ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { initChartCarousel } from "./chart-carousel.js";
import { archetypeBadge, showError, isoDateYearsAgo, DEFAULT_DATE_FROM_YEARS } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initFilterToggle } from "./filter-toggle.js";
import { savedMetaFilters, rememberMetaFilters, prefetchMetaResults, metaResults } from "./meta-filters.js";
import { historyPanelHtml, historyStatsHtml, winrateTrendHtml, latestPresence } from "./history-list.js";
import { archetypeIcon } from "./archetype-icons.js";

// Entries + matches of the events in scope (js/meta-filters.js metaResults):
// slim — the entries' archetypes and the scores are all it uses.
const RESULTS_OPTIONS = { commanders: false };

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
export async function mount({ signal = new AbortController().signal } = {}) {
  const chartEl = document.getElementById("archetypes-chart");
  const tableEl = document.getElementById("archetypes-table");
  const leagueSelect = document.getElementById("archetypes-league-filter");
  const eventSelect = document.getElementById("archetypes-event-filter");
  const dateFromInput = document.getElementById("archetypes-date-from");
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
  initFilterToggle("archetypes-filter-toggle", "archetypes-filter-panel");

  let eventDateById = new Map();
  let lastScopeEventIds = [];
  // The filters' leagues and events (js/scope-filter.js), loaded together.
  let allLeagues = [];
  let allEvents = [];
  try {
    const [events, leagues] = await Promise.all([Events.list(), Leagues.list()]);
    if (signal.aborted) return;
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

  async function render(eventIds) {
    chartEl.innerHTML = '<p class="page-loading">Caricamento...</p>';
    tableEl.innerHTML = "";
    try {
      const eventsData = await metaResults(resultsPrefetch, eventIds, eventDateById, RESULTS_OPTIONS);
      if (signal.aborted) return;
      const keyOf = (e) => e.archetype;
      const stats = computeGroupedStats(eventsData, keyOf, (e) => ({ name: e.archetype }));
      const byKey = new Map(stats.map((s) => [s.key, s]));
      const totalEntries = stats.reduce((sum, s) => sum + s.entries, 0);

      // The trend arrows, as on Comandanti (js/commanders-page.js — results
      // add up event by event: "before an event" = the numbers minus that
      // event's own):
      //  - Winrate: before the archetype's own latest event in scope
      //    (latestPresence) — its first one there: nothing before (null).
      //  - Metashare: before the latest event in scope, whoever played in
      //    it — down when the archetype had a smaller slice of it than its
      //    average (or none), up when bigger. A single event: nothing before.
      const latestOf = latestPresence(eventIds, eventsData, eventDateById, (d) => d.entries.map(keyOf));
      const latestInScope = latestPresence(eventIds, eventsData, eventDateById, () => ["scope"]).get("scope");
      const statsPerEvent = eventsData.map((d) => new Map(computeGroupedStats([d], keyOf, () => ({})).map((s) => [s.key, s])));
      const decksPerEvent = statsPerEvent.map((byArchetype) => [...byArchetype.values()].reduce((sum, s) => sum + s.entries, 0));
      const decksBeforeLatest = latestInScope === undefined ? 0 : totalEntries - decksPerEvent[latestInScope];
      const winRateBefore = (a) => {
        const s = byKey.get(a);
        const i = latestOf.get(a);
        if (!s || i === undefined) return null;
        const ev = statsPerEvent[i].get(a) ?? { wins: 0, draws: 0, losses: 0 };
        const wins = s.wins - ev.wins;
        const played = wins + (s.draws - ev.draws) + (s.losses - ev.losses);
        return played > 0 ? (wins / played) * 100 : null;
      };
      const shareBefore = (a, entries) => {
        if (decksBeforeLatest <= 0) return null;
        const inLatestEvent = statsPerEvent[latestInScope].get(a)?.entries ?? 0;
        return ((entries - inLatestEvent) / decksBeforeLatest) * 100;
      };

      const rows = ARCHETYPES.map((a) => {
        const s = byKey.get(a);
        const entries = s?.entries ?? 0;
        return {
          archetype: a,
          entries,
          share: totalEntries > 0 ? (entries / totalEntries) * 100 : 0,
          shareBefore: shareBefore(a, entries),
          wins: s?.wins ?? 0,
          draws: s?.draws ?? 0,
          losses: s?.losses ?? 0,
          winRate: s?.winRate ?? null,
          winRateBefore: winRateBefore(a),
          inLatest: latestOf.has(a),
        };
      }).sort((a, b) => b.entries - a.entries);

      const chartHtml = renderPieChart(
        rows.map((r) => ({
          label: r.archetype,
          share: r.share,
          color: ARCHETYPE_COLORS[r.archetype],
          icon: archetypeIcon(r.archetype),
        })),
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
            icon: archetypeIcon(r.archetype),
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
      // (js/history-list.js), the whole card a link to its page
      // (archetype.html): the badge, then Metashare / Winrate, each with its
      // trend arrow (since the latest event, as on Comandanti).
      tableEl.innerHTML = historyPanelHtml(
        rows
          .map(
            (r) => `
          <a class="history-item history-ranked" href="archetype.html?id=${r.archetype}">
            <div class="history-main">${archetypeBadge(r.archetype)}</div>
            ${historyStatsHtml([
              { label: "Metashare", value: `${r.share.toFixed(1)}%${winrateTrendHtml(r.share, r.shareBefore, true)}`, trend: true },
              {
                label: "Winrate",
                value: r.winRate === null ? "—" : `${r.winRate.toFixed(1)}%${winrateTrendHtml(r.winRate, r.winRateBefore, r.inLatest)}`,
                main: true,
                trend: true,
              },
            ])}
          </a>`
          )
          .join(""),
        { scroll: false }
      );
    } catch (err) {
      showError(chartEl, err);
    } finally {
      hidePageLoading(signal);
    }
  }


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
