// The Meta tab of event.html and league.html (one event's entries, or a
// whole league's): its commanders and archetypes as the Bacheca's bubble
// charts.

import { renderBubbleChart, initBubbleChart, ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { initChartCarousel } from "./chart-carousel.js";

// Meta: how many commanders the chart shows as bubbles (the rest "Altri",
// in the legend only), in the Comandanti page's hue order.
const META_TOP_COMMANDERS = 8;
const META_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#8e5bd6", "#d6455d"];
const META_OTHER_COLOR = "#9a9a94";

// A Meta tab (event.html, league.html): the entries' commanders and archetypes as the Bacheca's
// bubble charts (js/metagame-chart.js), in its light card and carousel —
// side by side when there's room, else one at a time with ‹ • › under the
// card. Counted like the Bacheca: one per entry, the primary commander only
// (a partner counted too would push the shares past 100%).
export function renderMetaCharts(el, cardEl, entries) {
  const counted = entries.filter((e) => e.commander);
  if (counted.length === 0) {
    el.innerHTML = '<p class="page-empty">Nessun dato per il grafico.</p>';
    return;
  }
  const total = counted.length;
  const byCommander = new Map(); // id -> { id, name, count }
  const byArchetype = new Map(ARCHETYPES.map((a) => [a, 0]));
  for (const e of counted) {
    const c = byCommander.get(e.commander.id) ?? { id: e.commander.id, name: e.commander.name, count: 0 };
    c.count += 1;
    byCommander.set(c.id, c);
    if (byArchetype.has(e.archetype)) byArchetype.set(e.archetype, byArchetype.get(e.archetype) + 1);
  }
  const ranked = [...byCommander.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "it"));
  const commanderRows = ranked.slice(0, META_TOP_COMMANDERS).map((c, i) => ({
    label: c.name,
    share: (c.count / total) * 100,
    color: META_COLORS[i],
    href: `commander.html?id=${c.id}`,
    card: c.name,
  }));
  const others = ranked.slice(META_TOP_COMMANDERS).reduce((sum, c) => sum + c.count, 0);
  if (others > 0) commanderRows.push({ label: "Altri", share: (others / total) * 100, color: META_OTHER_COLOR, bubble: false });
  const archetypeRows = ARCHETYPES.map((a) => ({
    label: a,
    share: (byArchetype.get(a) / total) * 100,
    color: ARCHETYPE_COLORS[a],
    href: `archetype.html?id=${a}`,
  })).sort((a, b) => b.share - a.share);

  const subtitle = `${total} ${total === 1 ? "mazzo" : "mazzi"}`;
  el.classList.remove("page-loading");
  el.innerHTML = `
    <div class="chart-grid">
      ${renderBubbleChart(commanderRows, "Nessun dato per il grafico.", "Comandanti", { subtitle })}
      ${renderBubbleChart(archetypeRows, "Nessun dato per il grafico.", "Archetipi", { subtitle })}
    </div>`;
  initBubbleChart(el);
  initChartCarousel(el, { navAfter: cardEl });
}
