// Metagame share as a donut chart with a side legend, reused by the
// Commanders and Archetypes pages.
import { escapeHtml } from "./ui.js";

/**
 * @param {Array<{label: string, share: number, color: string}>} rows - share is 0-100, sums to ~100.
 * @param {string} emptyMessage
 * @param {string} [title] - shown inside the box itself, above the ring/legend.
 */
export function renderPieChart(rows, emptyMessage, title) {
  const titleHtml = title ? `<h2 class="pie-chart-title">${escapeHtml(title)}</h2>` : "";
  const visible = rows.filter((r) => r.share > 0);
  if (visible.length === 0) {
    return `<div class="pie-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p></div>`;
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
    </div>
  `;
}

/**
 * One horizontal bar per row, each independently 0-100 (a real winrate, not
 * a share that has to sum to 100 like the pie chart above) — a null value
 * (no games played yet in the current scope) shows as "—" with an empty
 * track instead of a misleading 0% bar.
 * @param {Array<{label: string, value: number|null, color: string}>} rows
 * @param {string} emptyMessage
 * @param {string} [title] - shown inside the box itself, above the bars.
 */
export function renderBarChart(rows, emptyMessage, title, { spacious = false } = {}) {
  const titleHtml = title ? `<h2 class="pie-chart-title">${escapeHtml(title)}</h2>` : "";
  if (rows.length === 0) {
    return `<div class="pie-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p></div>`;
  }

  const bars = rows
    .map(
      (r, i) => `
    <div class="bar-chart-row" style="animation-delay:${i * 60}ms;">
      <span class="bar-chart-label">${escapeHtml(r.label)}</span>
      <div class="bar-chart-track">
        ${r.value === null ? "" : `<div class="bar-chart-fill" style="width:${Math.max(r.value, 0)}%; background:${r.color};"></div>`}
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
