// Metagame share as a pie chart with a side legend, reused by the
// Commanders and Archetypes pages.
import { escapeHtml } from "./ui.js";

/**
 * @param {Array<{label: string, share: number, color: string}>} rows - share is 0-100, sums to ~100.
 * @param {string} emptyMessage
 */
export function renderPieChart(rows, emptyMessage) {
  const visible = rows.filter((r) => r.share > 0);
  if (visible.length === 0) {
    return `<div class="pie-chart-wrap"><p class="page-empty">${emptyMessage}</p></div>`;
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
      (r) => `
    <span class="pie-legend-item">
      <span class="pie-legend-swatch" style="background:${r.color};"></span>
      ${escapeHtml(r.label)} <strong>${r.share.toFixed(1)}%</strong>
    </span>`
    )
    .join("");

  return `
    <div class="pie-chart-wrap">
      <div class="pie-chart" style="background: conic-gradient(${stops});" role="img" aria-label="Grafico a torta del metagame"></div>
      <div class="pie-legend">${legend}</div>
    </div>
  `;
}
