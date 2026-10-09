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

// Monotone cubic interpolation (Fritsch–Carlson, same as d3's
// curveMonotoneX) — a smooth curve through every point that never
// overshoots between two of them: a segment joining two equal values stays
// flat, and peaks/dips only ever sit on an actual data point. (A
// Catmull-Rom spline was used before; it sets each point's tangent from its
// two neighbors, so after a drop the curve kept heading down past the next
// point's value — e.g. 2 → 1 → 1 dipped below 1 between the last two.)
function smoothPath(points) {
  const n = points.length;
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  if (n === 1) return d;

  // Per-segment width and slope.
  const h = [];
  const s = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = points[i + 1][0] - points[i][0];
    s[i] = h[i] ? (points[i + 1][1] - points[i][1]) / h[i] : 0;
  }

  // Tangent at each point: 0 at a local extremum or next to a flat
  // segment (neighboring slopes of opposite sign, or either one 0);
  // otherwise a weighted average of the two slopes, capped so the curve
  // can't overshoot. The two ends just follow their only segment's slope.
  const m = [s[0]];
  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1] * s[i] <= 0) {
      m[i] = 0;
    } else {
      const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
      m[i] = Math.sign(s[i]) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), Math.abs(p) / 2) * 2;
    }
  }
  m[n - 1] = s[n - 2];

  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = h[i] / 3;
    d += ` C${(x1 + dx).toFixed(2)},${(y1 + m[i] * dx).toFixed(2)} ${(x2 - dx).toFixed(2)},${(y2 - m[i + 1] * dx).toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }
  return d;
}

// renderLineChart's own geometry (commander.html's "Utilizzo"): the plot
// spans the card edge to edge (styles.css .line-chart-wrap.is-edge) and is
// stretched to it (preserveAspectRatio="none" — the strokes keep their width
// with vector-effect: non-scaling-stroke, and there are no round shapes in
// the SVG to turn into ellipses: the hover dot is HTML). EDGE_HEIGHT is the
// plot's CSS height in px, so y units are pixels: the HTML overlays (y
// labels, hover dots) sit at the same px. Above EDGE_TOP: the title and the
// numbers, overlaid; below the zero line: the months' band, the area
// filling it down to the card's edge.
const EDGE_WIDTH = 1000;
const EDGE_HEIGHT = 240;
const EDGE_TOP = 84;
const EDGE_BOTTOM = 30;

const decksLabel = (n) => `${n} ${n === 1 ? "mazzo" : "mazzi"}`;

/**
 * @param {Array<{date: string, value: number}>} points - ISO dates, ascending, value >= 0 (integer counts).
 * @param {string} emptyMessage
 * @param {string} [title] - shown inside the box itself, over the chart.
 */
export function renderLineChart(rawPoints, emptyMessage, title) {
  const titleHtml = title ? `<h2 class="pie-chart-title">${escapeHtml(title)}</h2>` : "";
  const points = windowToMaxSpan(rawPoints);
  if (points.length === 0) {
    return `<div class="pie-chart-wrap line-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p></div>`;
  }

  // Deck counts are small whole numbers — rounding the axis ceiling up to
  // the next integer (rather than the raw max) keeps the top gridline
  // label from ever reading as a non-whole number of decks.
  const values = points.map((p) => p.value);
  const peak = Math.max(...values);
  const yMax = Math.max(Math.ceil(peak), 1);
  const yZero = EDGE_HEIGHT - EDGE_BOTTOM;
  const yAt = (value) => yZero - (value / yMax) * (yZero - EDGE_TOP);

  const times = points.map((p) => new Date(p.date).getTime());
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const timeSpan = maxTime - minTime || 1;
  const xAt = (time) => ((time - minTime) / timeSpan) * EDGE_WIDTH;
  const pct = (x) => `${((x / EDGE_WIDTH) * 100).toFixed(3)}%`;

  // A single point (or every point sharing one date) has no span to place
  // along — centred instead of dividing by zero.
  const coords = points.map((p, i) => [points.length === 1 ? EDGE_WIDTH / 2 : xAt(times[i]), yAt(p.value)]);

  const linePath = smoothPath(coords);
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${EDGE_HEIGHT} L${coords[0][0].toFixed(2)},${EDGE_HEIGHT} Z`;

  // Capped to yMax itself (not a flat 4) — yMax is a small whole number
  // (a deck-count axis rarely exceeds single digits), so 4 evenly-spaced
  // steps rounded to whole numbers could land on the same integer twice
  // (e.g. yMax=2 rounds to 0, 1, 1, 2, 2). Capping the step count keeps
  // the raw step size at 1 or more, so every rounded label is distinct.
  // The lines the whole width; their values small, on the left just above
  // each line (none for the zero line).
  const GRID_STEPS = Math.min(4, yMax);
  const grid = Array.from({ length: GRID_STEPS + 1 }, (_, i) => {
    const value = Math.round((i / GRID_STEPS) * yMax);
    return { y: yAt(value), value };
  });
  const gridLines = grid
    .map(
      ({ y, value }) =>
        `<line class="line-chart-grid${value === 0 ? " is-zero" : ""}" x1="0" y1="${y}" x2="${EDGE_WIDTH}" y2="${y}" vector-effect="non-scaling-stroke"></line>`
    )
    .join("");
  const yLabels = grid
    .filter(({ value }) => value > 0)
    .map(({ y, value }) => `<span class="line-chart-y" style="top:${y}px">${value}</span>`)
    .join("");

  // Generic calendar ticks (see monthTicks above) rather than the exact
  // dates data happens to fall on, in the band under the zero line; one too
  // close to either edge is anchored inward rather than cut off.
  const xLabels = monthTicks(minTime, maxTime)
    .map((tick) => {
      const x = xAt(tick.getTime());
      const edge = x < 60 ? " is-start" : x > EDGE_WIDTH - 60 ? " is-end" : "";
      return `<span class="line-chart-x${edge}" style="left:${pct(x)}">${formatMonthTick(tick)}</span>`;
    })
    .join("");

  // Hover (or tap): each point owns the strip from halfway to the previous
  // point to halfway to the next — a guide line, a dot on the curve and the
  // date with its count over it. Pure CSS (:hover), no script.
  const hits = coords
    .map(([x, y], i) => {
      const left = i === 0 ? 0 : (coords[i - 1][0] + x) / 2;
      const right = i === coords.length - 1 ? EDGE_WIDTH : (x + coords[i + 1][0]) / 2;
      const width = right - left || EDGE_WIDTH;
      const inner = `${(((x - left) / width) * 100).toFixed(3)}%`;
      const side = x < 150 ? " is-start" : x > EDGE_WIDTH - 150 ? " is-end" : "";
      return `<span class="line-chart-hit" style="left:${pct(left)};width:${pct(width)}">
        <span class="line-chart-guide" style="left:${inner}"></span>
        <span class="line-chart-dot-html" style="left:${inner};top:${y}px"></span>
        <span class="line-chart-tip${side}" style="left:${inner};top:${y}px">${escapeHtml(formatDate(points[i].date))} · <strong>${decksLabel(points[i].value)}</strong></span>
      </span>`;
    })
    .join("");

  // The numbers beside the title: the latest event's decks, the peak, and
  // the total over the whole history (not just the 2 years drawn).
  const total = rawPoints.reduce((sum, p) => sum + p.value, 0);
  const stats = [
    ["Ultimo", values[values.length - 1]],
    ["Picco", peak],
    ["Totale", total],
  ]
    .map(
      ([label, value]) =>
        `<div class="line-chart-stat"><span class="line-chart-stat-value">${value}</span><span class="line-chart-stat-label">${label}</span></div>`
    )
    .join("");

  return `
    <div class="pie-chart-wrap line-chart-wrap is-edge">
      <div class="line-chart-head">
        ${titleHtml}
        <div class="line-chart-stats">${stats}</div>
      </div>
      <div class="line-chart-plot">
        <svg class="line-chart" viewBox="0 0 ${EDGE_WIDTH} ${EDGE_HEIGHT}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(title ?? "Grafico")}">
          ${gridLines}
          <path class="line-chart-area" d="${areaPath}"></path>
          <path class="line-chart-line" d="${linePath}" vector-effect="non-scaling-stroke"></path>
        </svg>
        ${yLabels}
        ${xLabels}
        ${hits}
      </div>
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

  // Capped to yMax itself (not a flat 4) — yMax is a small whole number
  // (a deck-count axis rarely exceeds single digits), so 4 evenly-spaced
  // steps rounded to whole numbers could land on the same integer twice
  // (e.g. yMax=2 rounds to 0, 1, 1, 2, 2). Capping the step count keeps
  // the raw step size at 1 or more, so every rounded label is distinct.
  const GRID_STEPS = Math.min(4, yMax);
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
