// A single smooth time-series line (currently just commander-detail's
// "decks played over time"), reusing the same card-wrapper/title
// conventions as js/metagame-chart.js's pie/bar charts but with its own
// drawing: neither of those techniques (conic-gradient, width-percentage
// bars) extends to a curved line through unevenly-spaced points.
import { escapeHtml, formatDate } from "./ui.js";

// A fixed viewBox scaled to the container's actual width via CSS
// (aspect-ratio, see .line-chart in styles.css) rather than stretched
// independently on each axis (e.g. preserveAspectRatio="none") — that would
// scale x/y by different factors and turn the round dots into ellipses and
// the line's stroke width uneven between segments.
const WIDTH = 1000;
const HEIGHT = 280;
const PAD_LEFT = 40;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

// Caps the chart to whatever most recent 2-year window the data has —
// a commander with years of history would otherwise squash the x axis down
// to the point that recent, more relevant activity is hard to read. Anchored
// to the data's own latest point, not "today", so this stays meaningful for
// a commander whose last recorded appearance is itself already old.
const MAX_SPAN_YEARS = 2;

function windowToMaxSpan(points) {
  if (points.length === 0) return points;
  const cutoff = new Date(points[points.length - 1].date);
  cutoff.setFullYear(cutoff.getFullYear() - MAX_SPAN_YEARS);
  const cutoffTime = cutoff.getTime();
  return points.filter((p) => new Date(p.date).getTime() >= cutoffTime);
}

// Same cap as windowToMaxSpan, for renderMultiLineChart's shared date axis
// (every series is aligned to the same `dates` array, so the cutoff only
// needs to be found once against that shared list rather than per series).
function windowDatesToMaxSpan(dates) {
  if (dates.length === 0) return dates;
  const cutoff = new Date(dates[dates.length - 1]);
  cutoff.setFullYear(cutoff.getFullYear() - MAX_SPAN_YEARS);
  const cutoffTime = cutoff.getTime();
  return dates.filter((d) => new Date(d).getTime() >= cutoffTime);
}

// "Nice" calendar tick marks (the 1st of a month) rather than the exact
// dates data happens to exist on — reads as a real timeline (e.g. "2026-06")
// instead of an arbitrary sampling of whichever event dates were picked.
// The step between ticks grows with the total span so a multi-year chart
// doesn't end up with 20 crowded monthly labels — aims for roughly 5-6
// ticks regardless of how wide the (now capped-to-2-years) span actually is.
function monthTicks(minTime, maxTime) {
  const totalMonths =
    (new Date(maxTime).getFullYear() - new Date(minTime).getFullYear()) * 12 +
    (new Date(maxTime).getMonth() - new Date(minTime).getMonth()) +
    1;
  const step = Math.max(1, Math.ceil(totalMonths / 6));

  const cursor = new Date(minTime);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  // The first month boundary at/after minTime — starting from minTime's own
  // month can land slightly before minTime itself once the day is reset to
  // the 1st, so step forward once if that happened.
  if (cursor.getTime() < minTime) cursor.setMonth(cursor.getMonth() + step);

  const ticks = [];
  while (cursor.getTime() <= maxTime) {
    ticks.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + step);
  }
  if (ticks.length === 0) ticks.push(new Date(minTime));
  return ticks;
}

function formatMonthTick(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Catmull-Rom-through-Bezier conversion (tension 1/6, the standard value)
// — turns a plain polyline through the points into a smooth curve that
// still passes exactly through every one of them, unlike e.g. a fitted
// polynomial. Falls back to the segment's own endpoint when there's no
// further neighbor (the curve's two ends), same as the usual "clamped"
// variant of this technique.
function smoothPath(points) {
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/**
 * @param {Array<{date: string, value: number}>} points - ISO dates, ascending, value >= 0 (integer counts).
 * @param {string} emptyMessage
 * @param {string} [title] - shown inside the box itself, above the chart.
 */
export function renderLineChart(rawPoints, emptyMessage, title) {
  const titleHtml = title ? `<h2 class="pie-chart-title">${escapeHtml(title)}</h2>` : "";
  const points = windowToMaxSpan(rawPoints);
  if (points.length === 0) {
    return `<div class="pie-chart-wrap line-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p></div>`;
  }

  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  // Deck counts are small whole numbers — rounding the axis ceiling up to
  // the next integer (rather than the raw max) keeps the top gridline
  // label from ever reading as a non-whole number of decks.
  const yMax = Math.max(Math.ceil(Math.max(...points.map((p) => p.value))), 1);

  const times = points.map((p) => new Date(p.date).getTime());
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const timeSpan = maxTime - minTime || 1;

  const coords = points.map((p, i) => {
    // A single point (or every point sharing one date) has no span to
    // place along — center it instead of dividing by zero.
    const x = points.length === 1 ? PAD_LEFT + innerWidth / 2 : PAD_LEFT + ((times[i] - minTime) / timeSpan) * innerWidth;
    const y = PAD_TOP + innerHeight - (p.value / yMax) * innerHeight;
    return [x, y];
  });

  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${PAD_TOP + innerHeight} L${coords[0][0].toFixed(2)},${PAD_TOP + innerHeight} Z`;

  const GRID_STEPS = 4;
  const gridLines = Array.from({ length: GRID_STEPS + 1 }, (_, i) => {
    const y = PAD_TOP + innerHeight - (i / GRID_STEPS) * innerHeight;
    const value = Math.round((i / GRID_STEPS) * yMax);
    return `<line class="line-chart-grid" x1="${PAD_LEFT}" y1="${y}" x2="${WIDTH - PAD_RIGHT}" y2="${y}"></line>
      <text class="line-chart-axis-label" x="${PAD_LEFT - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${value}</text>`;
  }).join("");

  // Generic calendar ticks (see monthTicks above) rather than the exact
  // dates data happens to fall on, positioned by their own real time value
  // along the same axis the data points use.
  const ticks = monthTicks(minTime, maxTime);
  const xLabels = ticks
    .map((tick, i) => {
      const x = PAD_LEFT + ((tick.getTime() - minTime) / timeSpan) * innerWidth;
      // Inward-anchored at the two ends (a centered label there would
      // extend half its own width past the viewBox edge and get clipped),
      // centered everywhere in between.
      const anchor = i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle";
      return `<text class="line-chart-axis-label" x="${x.toFixed(2)}" y="${HEIGHT - PAD_BOTTOM + 20}" text-anchor="${anchor}">${formatMonthTick(tick)}</text>`;
    })
    .join("");

  const dots = coords
    .map(
      ([x, y], i) =>
        `<circle class="line-chart-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4"><title>${escapeHtml(formatDate(points[i].date))}: ${points[i].value}</title></circle>`
    )
    .join("");

  return `
    <div class="pie-chart-wrap line-chart-wrap">
      ${titleHtml}
      <svg class="line-chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(title ?? "Grafico")}">
        ${gridLines}
        <path class="line-chart-area" d="${areaPath}"></path>
        <path class="line-chart-line" d="${linePath}"></path>
        ${dots}
        ${xLabels}
      </svg>
    </div>
  `;
}

/**
 * Several smooth lines sharing one time axis (e.g. one per archetype) —
 * every series is expected to already carry a value (0 if none) for each
 * entry of the shared `dates` array, so all of them plot against the exact
 * same x positions rather than each interpolating over its own gaps.
 * @param {string[]} dates - ISO dates, ascending, shared by every series.
 * @param {Array<{label: string, color: string, values: number[]}>} series - one `values` entry per date, aligned by index.
 * @param {string} emptyMessage
 * @param {string} [title]
 */
export function renderMultiLineChart(dates, series, emptyMessage, title) {
  const titleHtml = title ? `<h2 class="pie-chart-title">${escapeHtml(title)}</h2>` : "";
  if (dates.length === 0) {
    return `<div class="pie-chart-wrap line-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p></div>`;
  }

  const windowedDates = windowDatesToMaxSpan(dates);
  const startIndex = dates.length - windowedDates.length;
  const windowedSeries = series.map((s) => ({ ...s, values: s.values.slice(startIndex) }));

  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const yMax = Math.max(Math.ceil(Math.max(0, ...windowedSeries.flatMap((s) => s.values))), 1);

  const times = windowedDates.map((d) => new Date(d).getTime());
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const timeSpan = maxTime - minTime || 1;

  const xAt = (i) =>
    windowedDates.length === 1 ? PAD_LEFT + innerWidth / 2 : PAD_LEFT + ((times[i] - minTime) / timeSpan) * innerWidth;
  const yAt = (value) => PAD_TOP + innerHeight - (value / yMax) * innerHeight;

  const seriesCoords = windowedSeries.map((s) => ({
    ...s,
    coords: s.values.map((v, i) => [xAt(i), yAt(v)]),
  }));

  const GRID_STEPS = 4;
  const gridLines = Array.from({ length: GRID_STEPS + 1 }, (_, i) => {
    const y = PAD_TOP + innerHeight - (i / GRID_STEPS) * innerHeight;
    const value = Math.round((i / GRID_STEPS) * yMax);
    return `<line class="line-chart-grid" x1="${PAD_LEFT}" y1="${y}" x2="${WIDTH - PAD_RIGHT}" y2="${y}"></line>
      <text class="line-chart-axis-label" x="${PAD_LEFT - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${value}</text>`;
  }).join("");

  const ticks = monthTicks(minTime, maxTime);
  const xLabels = ticks
    .map((tick, i) => {
      const x = PAD_LEFT + ((tick.getTime() - minTime) / timeSpan) * innerWidth;
      const anchor = i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle";
      return `<text class="line-chart-axis-label" x="${x.toFixed(2)}" y="${HEIGHT - PAD_BOTTOM + 20}" text-anchor="${anchor}">${formatMonthTick(tick)}</text>`;
    })
    .join("");

  // No area fill here (unlike the single-series chart) — five overlapping
  // translucent fills would just muddy each other rather than read as
  // separate trends the way five clean strokes do.
  const lines = seriesCoords
    .map((s) => `<path class="line-chart-line" style="stroke:${s.color};" d="${smoothPath(s.coords)}"></path>`)
    .join("");

  const dots = seriesCoords
    .map((s) =>
      s.coords
        .map(
          ([x, y], i) =>
            `<circle class="line-chart-dot" style="fill:${s.color};" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3"><title>${escapeHtml(s.label)} — ${escapeHtml(formatDate(windowedDates[i]))}: ${s.values[i]}</title></circle>`
        )
        .join("")
    )
    .join("");

  const legend = `
    <div class="line-chart-legend">
      ${series
        .map(
          (s) =>
            `<span class="line-chart-legend-item"><span class="line-chart-legend-swatch" style="background:${s.color};"></span>${escapeHtml(s.label)}</span>`
        )
        .join("")}
    </div>`;

  return `
    <div class="pie-chart-wrap line-chart-wrap">
      ${titleHtml}
      <svg class="line-chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(title ?? "Grafico")}">
        ${gridLines}
        ${lines}
        ${dots}
        ${xLabels}
      </svg>
      ${legend}
    </div>
  `;
}
