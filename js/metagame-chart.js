// Metagame share as a donut chart with a side legend, reused by the
// Commanders and Archetypes pages and the Bacheca.
import { escapeHtml } from "./ui.js";

export const ARCHETYPES = ["aggro", "control", "combo", "tempo", "midrange"];

// Same fixed identity colors as the .badge-archetype-* pills elsewhere on the
// site (see styles.css --accent-*), so an archetype reads as the same color
// in every chart and badge. Hardcoded here rather than var(--accent-...)
// because the charts need real color values (conic-gradient stops, inline
// bar fills). Shared by the Archetipi page and the Bacheca's own chart.
export const ARCHETYPE_COLORS = {
  aggro: "#dc181c",
  control: "#2f5fdc",
  combo: "#2a2226",
  tempo: "#0aa8bd",
  midrange: "#e0752b",
};

/**
 * @param {Array<{label: string, share: number, color: string}>} rows - share is 0-100, sums to ~100.
 * @param {string} emptyMessage
 * @param {string} [title] - shown inside the box itself, above the ring/legend.
 * @param {{subtitle?: string, footer?: string}} [options] - subtitle: small
 *   muted line under the title; footer: trusted HTML at the bottom of the box
 *   (the Bacheca's per-slide "Vedi tutti" link).
 */
export function renderPieChart(rows, emptyMessage, title, { subtitle = "", footer = "" } = {}) {
  const titleHtml =
    (title ? `<h2 class="pie-chart-title">${escapeHtml(title)}</h2>` : "") +
    (subtitle ? `<p class="pie-chart-subtitle">${escapeHtml(subtitle)}</p>` : "");
  const visible = rows.filter((r) => r.share > 0);
  if (visible.length === 0) {
    return `<div class="pie-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p>${footer}</div>`;
  }

  let cursor = 0;
  const stops = visible
    .map((r) => {
      const start = cursor;
      cursor += r.share;
      return `${r.color} ${start}% ${cursor}%`;
    })
    .join(", ");

  const legend = visible
    .map(
      (r, i) => `
    <span class="pie-legend-item" style="animation-delay:${i * 60}ms;">
      <span class="pie-legend-swatch" style="background:${r.color};"></span>
      <span class="pie-legend-label">${escapeHtml(r.label)}</span>
      <strong class="pie-legend-pct">${r.share.toFixed(1)}%</strong>
    </span>`
    )
    .join("");

  return `
    <div class="pie-chart-wrap">
      ${titleHtml}
      <div class="pie-chart-body">
        <div class="pie-chart" style="background: conic-gradient(${stops});" role="img" aria-label="Grafico a torta del metagame"></div>
        <div class="pie-legend">${legend}</div>
      </div>
      ${footer}
    </div>
  `;
}

/**
 * One horizontal bar per row, each independently 0-100% (a real winrate,
 * or a share of decks that play a color — not a share that has to sum to
 * 100 like the pie chart above) — a null value (no games played yet in the
 * current scope) shows as "—" with an empty track instead of a misleading
 * 0% bar.
 * @param {Array<{label: string, value: number|null, color: string}>} rows
 * @param {string} emptyMessage
 * @param {string} [title] - shown inside the box itself, above the bars.
 * @param {object} [options]
 * @param {boolean} [options.spacious] - see below.
 * @param {string} [options.subtitle] - small muted line under the title.
 */
export function renderBarChart(rows, emptyMessage, title, { spacious = false, subtitle = "" } = {}) {
  const titleHtml =
    (title ? `<h2 class="pie-chart-title">${escapeHtml(title)}</h2>` : "") +
    (subtitle ? `<p class="pie-chart-subtitle">${escapeHtml(subtitle)}</p>` : "");
  if (rows.length === 0) {
    return `<div class="pie-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p></div>`;
  }

  const bars = rows
    .map(
      (r, i) => `
    <div class="bar-chart-row" style="animation-delay:${i * 60}ms;">
      <span class="bar-chart-label">${escapeHtml(r.label)}</span>
      <div class="bar-chart-track">
        ${r.value === null ? "" : `<div class="bar-chart-fill" style="width:${Math.min(Math.max(r.value, 0), 100)}%; background:${r.color};"></div>`}
      </div>
      <strong class="bar-chart-pct">${r.value === null ? "—" : `${r.value.toFixed(1)}%`}</strong>
    </div>`
    )
    .join("");

  // `spacious`: for a short, fixed-length list (Archetipi's 5 rows) rather
  // than the Comandanti page's own much longer one — spreads the rows out
  // to actually fill the card's full height (matched to the pie chart
  // beside it via .chart-grid) instead of clustering at the top with a
  // block of empty space below, and bumps up the row/font size to match.
  return `
    <div class="pie-chart-wrap">
      ${titleHtml}
      <div class="bar-chart-body${spacious ? " bar-chart-body-spacious" : ""}">${bars}</div>
    </div>
  `;
}
