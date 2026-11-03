// evolution.html — "Evoluzione", the Meta section's fourth tab: how the meta
// changes over time, in the filters' scope (Lega, Dal — no Evento: a single
// event has no evolution). Five cards, every chart in commander.html's
// "Utilizzo" look (js/line-chart.js: edge to edge in its card, smooth
// monotone curves drawn in from the left, dashed gridlines, the dates in a
// band at the bottom, a guide and a dark tip on hover / tap) — the title,
// a few big numbers and the legend on top, no subtitles (user):
//  - Archetipi nel tempo: each archetype's share, stacked to 100%;
//  - I più giocati: the 6 most played commanders' rank among the most
//    played (cumulative), point after point, their art on the line's end;
//  - Chi sale, chi scende: the 3 biggest risers / fallers, the last points
//    against the ones before, as art tiles with their curve;
//  - Colori nel tempo: the share of decks playing each colour, a tile each
//    (colorless a sixth one, only when some deck in scope is);
//  - Ricambio del meta: two lines, each point's decks and those with a
//    never-seen commander (no gridlines: the values on the left).
// A point is an event; with more than MAX_EVENT_POINTS events in scope, a
// month instead. Chosen 2026-11-01 from two rounds of mockups (a summary
// row and a winners' strip were dropped).

import { Events, Leagues } from "./db.js";
import { initScopeFilter } from "./scope-filter.js";
import { ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { archetypeIcon } from "./archetype-icons.js";
import { escapeHtml, eventTitle, scryfallImages, showError, isoDateYearsAgo, DEFAULT_DATE_FROM_YEARS } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initFilterToggle } from "./filter-toggle.js";
import { savedMetaFilters, rememberMetaFilters, prefetchMetaResults, metaResults } from "./meta-filters.js";
import { locale } from "./locale.js";

// The entries' commanders (names, colour identities) are needed: not slim.
const RESULTS_OPTIONS = { commanders: true };
// Up to this many events in scope, one point per event; more, one per month.
const MAX_EVENT_POINTS = 16;
// The race: how many commanders, and the ranks drawn.
const RACE_COUNT = 6;
const RACE_MAX_RANK = 8;
const RACE_COLORS = ["#dc181c", "#2f5fdc", "#e0752b", "#0aa8bd", "#7b3fc4", "#2e9e5b"];
const MOVERS_COUNT = 3;
// The five colours, then colorless (their lines' colours: css/5
// --colour-W…G / C, light / dark). Colorless only when some deck is.
const COLOURS = [
  ["W", "Bianco"],
  ["U", "Blu"],
  ["B", "Nero"],
  ["R", "Rosso"],
  ["G", "Verde"],
  ["C", "Incolore"],
];
const ARCHETYPE_LABELS = { aggro: "Aggro", control: "Control", combo: "Combo", tempo: "Tempo", midrange: "Midrange" };
// Combo's near-black, for text and dots on the dark tip / light card.
const archetypeInk = (a) => (a === "combo" ? "#8a7d81" : ARCHETYPE_COLORS[a]);
// The charts' viewBox width (stretched to the card, preserveAspectRatio
// none — the y units are px, so the HTML overlays line up with them).
const VW = 1000;
// A tip at least this far from its card's edges (px).
const TIP_MARGIN = 8;
// Two date labels at least this far apart (px), the last one always shown.
const LABEL_GAP = 66;

const pct = (x) => `${Math.round(x * 100)}%`;
const pct1 = (x) => `${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;
const avg = (list) => list.reduce((s, x) => s + x, 0) / (list.length || 1);
const shortName = (name) => name.split(",")[0];
// A trend's arrow and colour: still within `still`, up, down.
const trendArrow = (d, still) => (Math.abs(d) < still ? ["→", "var(--text-muted)"] : d > 0 ? ["↗", "#1d8a4d"] : ["↘", "var(--brand-red)"]);

// js/line-chart.js's monotone cubic curve (Fritsch–Carlson): smooth, never
// overshooting between two points. `move` false: continues the path (a
// band's way back).
function smoothPath(points, move = true) {
  const n = points.length;
  let d = `${move ? "M" : "L"}${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  if (n === 1) return d;
  const h = [];
  const s = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = points[i + 1][0] - points[i][0];
    s[i] = h[i] ? (points[i + 1][1] - points[i][1]) / h[i] : 0;
  }
  const m = [s[0]];
  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1] * s[i] <= 0) m[i] = 0;
    else {
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

// The points: one per event, or per month past MAX_EVENT_POINTS events.
function buildPoints(events, eventsData) {
  const dayLabel = (iso) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
  const perEvent = events.map((ev, i) => ({
    time: new Date(ev.event_date).getTime(),
    label: dayLabel(ev.event_date),
    title: eventTitle(ev),
    events: 1,
    entries: eventsData[i].entries,
  }));
  if (perEvent.length <= MAX_EVENT_POINTS) return { points: perEvent, byMonth: false };
  const months = new Map();
  events.forEach((ev, i) => {
    const key = ev.event_date.slice(0, 7);
    if (!months.has(key)) {
      const first = new Date(`${key}-01T12:00:00`);
      months.set(key, {
        time: first.getTime() + 14 * 86400000,
        label: first.toLocaleDateString(locale(), { month: "short", year: "2-digit" }).replace(".", ""),
        title: first.toLocaleDateString(locale(), { month: "long", year: "numeric" }),
        events: 0,
        entries: [],
      });
    }
    const m = months.get(key);
    m.events += 1;
    m.entries = m.entries.concat(eventsData[i].entries);
  });
  return { points: [...months.values()], byMonth: true };
}

// The sections' HTML from the points (≥ 2) and the card's width. Each card:
// its title (and a few big numbers) and its legend on top, in the flow
// (`head`), then the chart edge to edge under it.
function sectionsHtml({ points, byMonth }, width) {
  const narrow = width < 600;
  const key = (e) => e.commander_id;
  const all = points.flatMap((p) => p.entries);
  const nameOf = new Map(all.map((e) => [key(e), e.commander?.name ?? "?"]));
  const t0 = points[0].time;
  const t1 = points.at(-1).time;
  const xAt = (p) => ((p.time - t0) / (t1 - t0 || 1)) * VW;
  const xs = points.map(xAt);
  const xPct = (x) => `${((x / VW) * 100).toFixed(3)}%`;
  const pointTitle = (p) => `<strong>${escapeHtml(p.title)}</strong><em>${p.entries.length} mazzi</em>`;

  // Which points get a date label: the last always, the others only at
  // least LABEL_GAP px from the one before and from the last.
  function labelled(fractions, inset = 0) {
    const w = Math.max(260, width - inset);
    const keep = new Set([fractions.length - 1]);
    let prev = -Infinity;
    fractions.forEach((f, i) => {
      if (i === fractions.length - 1) return;
      if ((f - prev) * w >= LABEL_GAP && (fractions.at(-1) - f) * w >= LABEL_GAP) {
        keep.add(i);
        prev = f;
      }
    });
    return keep;
  }
  const dateLabels = (inset = 0) => {
    const keep = labelled(xs.map((x) => x / VW), inset);
    return points
      .map((p, i) =>
        keep.has(i)
          ? `<span class="line-chart-x${i === 0 ? " is-start" : i === points.length - 1 ? " is-end" : ""}" style="left:${xPct(xs[i])}">${escapeHtml(p.label)}</span>`
          : ""
      )
      .join("");
  };
  const stat = (value, label, color) =>
    `<div class="line-chart-stat"><span class="line-chart-stat-value"${color ? ` style="color:${color}"` : ""}>${value}</span><span class="line-chart-stat-label">${label}</span></div>`;
  const head = (title, { stats = "", legend = "" } = {}) =>
    `<div class="evo-head"><div class="evo-head-row"><h2 class="pie-chart-title">${title}</h2>${stats ? `<div class="line-chart-stats">${stats}</div>` : ""}</div>${legend ? `<div class="evo-legend">${legend}</div>` : ""}</div>`;
  // Each point's hover strip (the site's .line-chart-hit): a guide, dots on
  // the lines (`dots(i)`: [[y px, colour]]), a tip.
  const hits = (tipHtml, dots = () => []) =>
    xs
      .map((x, i) => {
        const left = i === 0 ? 0 : (xs[i - 1] + x) / 2;
        const right = i === xs.length - 1 ? VW : (x + xs[i + 1]) / 2;
        const w = right - left || VW;
        const inner = `${(((x - left) / w) * 100).toFixed(3)}%`;
        const edge = i === 0 ? " is-first" : i === xs.length - 1 ? " is-last" : "";
        const dotsHtml = dots(i)
          .map(([y, color]) => `<span class="line-chart-dot-html" style="left:${inner};top:${y}px;background:${color}"></span>`)
          .join("");
        return `<span class="line-chart-hit${edge}" style="left:${xPct(left)};width:${xPct(w)}"><span class="line-chart-guide" style="left:${inner}"></span>${dotsHtml}<span class="evo-tip" style="left:${inner}">${tipHtml(i)}</span></span>`;
      })
      .join("");
  // The plots' own margins: room for the tips over the top, the dates under.
  const bottom = 30;
  // The bottom axis (the solid line over the dates' band), drawn over the
  // areas that run on through it (user).
  const axis = (H) => `<line class="evo-grid is-zero" x1="0" x2="${VW}" y1="${H - bottom}" y2="${H - bottom}" vector-effect="non-scaling-stroke"></line>`;

  // --- Archetipi nel tempo ------------------------------------------------
  function archetypes() {
    const H = narrow ? 200 : 230;
    // (2px under the top: the top band's line whole, not cut by the edge.)
    const y = (v) => H - bottom - v * (H - bottom - 2);
    const shares = points.map((p) =>
      Object.fromEntries(ARCHETYPES.map((a) => [a, p.entries.filter((e) => e.archetype === a).length / (p.entries.length || 1)]))
    );
    // Each band a light tint of its archetype with a solid line on top, like
    // the site's other charts; the first one reaching down through the
    // dates' band to the card's edge (commander.html's "Utilizzo" area).
    let base = points.map(() => 0);
    let bands = "";
    let lines = "";
    for (const a of ARCHETYPES) {
      const upTo = base.map((v, i) => v + shares[i][a]);
      const upper = xs.map((x, i) => [x, y(upTo[i])]);
      const lower = a === ARCHETYPES[0] ? [[VW, H], [0, H]] : xs.map((x, i) => [x, y(base[i])]).reverse();
      const back = a === ARCHETYPES[0] ? `L${VW},${H} L0,${H}` : smoothPath(lower, false);
      bands += `<path class="evo-band is-${a}" d="${smoothPath(upper)} ${back} Z" fill="${ARCHETYPE_COLORS[a]}"></path>`;
      lines += `<path class="evo-band-line is-${a}" d="${smoothPath(upper)}" stroke="${ARCHETYPE_COLORS[a]}" vector-effect="non-scaling-stroke"></path>`;
      base = upTo;
    }
    const tip = (i) =>
      pointTitle(points[i]) +
      ARCHETYPES.slice()
        .reverse()
        .map((a) => `<div><i style="background:${archetypeInk(a)}"></i>${ARCHETYPE_LABELS[a]}<span>${pct(shares[i][a])}</span></div>`)
        .join("");
    const legend = ARCHETYPES.map(
      (a) => `<a class="evo-chip" href="archetype.html?id=${a}"><i class="is-${a}" style="background:${ARCHETYPE_COLORS[a]}">${archetypeIcon(a)}</i>${ARCHETYPE_LABELS[a]}</a>`
    ).join("");
    return `<section class="pie-chart-wrap line-chart-wrap is-edge evo-chart evo-archetypes">
      ${head("Archetipi nel tempo", { legend })}
      <div class="evo-plot" style="height:${H}px"><svg viewBox="0 0 ${VW} ${H}" preserveAspectRatio="none" aria-hidden="true">${bands}${axis(H)}${lines}</svg>${dateLabels()}${hits(tip)}</div>
    </section>`;
  }

  // --- I più giocati ------------------------------------------------
  function race() {
    // A rank's row taller than an end disc, so neighbours' discs stand
    // apart; the discs sit on the lines' last point.
    const ROW = narrow ? 42 : 48;
    const TOP = 20;
    const H = TOP + RACE_MAX_RANK * ROW + bottom;
    const counts = new Map();
    const ranksAt = [];
    for (const p of points) {
      for (const e of p.entries) counts.set(key(e), (counts.get(key(e)) ?? 0) + 1);
      const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || nameOf.get(a[0]).localeCompare(nameOf.get(b[0])));
      ranksAt.push(new Map(ordered.map(([k], i) => [k, i + 1])));
    }
    const leaders = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, RACE_COUNT).map(([k]) => k);
    // Rank 1..RACE_MAX_RANK on its row; beyond, on the baseline (a line
    // climbs in from it).
    const y = (r) => (r > RACE_MAX_RANK ? H - bottom : TOP + (r - 1) * ROW + ROW / 2);
    let lines = "";
    let ends = "";
    leaders.forEach((k, idx) => {
      const color = RACE_COLORS[idx];
      const first = ranksAt.findIndex((m) => m.has(k));
      const pts = xs.map((x, i) => [x, y(ranksAt[i].get(k) ?? RACE_MAX_RANK + 1)]).slice(first);
      lines += `<path class="evo-race-line" data-k="${k}" d="${smoothPath(pts)}" stroke="${color}" vector-effect="non-scaling-stroke"></path>`;
      // (No rank chip on the disc — user: the tip gives the ranks.)
      ends += `<a class="evo-race-end" href="commander.html?id=${k}" data-k="${k}" data-card="${escapeHtml(nameOf.get(k))}" style="--c:${color};left:${xPct(pts.at(-1)[0])};top:${pts.at(-1)[1]}px" aria-label="${escapeHtml(nameOf.get(k))}"></a>`;
    });
    const tip = (i) =>
      `<strong>${escapeHtml(points[i].title)}</strong>` +
      leaders
        .map((k, idx) => [k, idx, ranksAt[i].get(k)])
        .filter(([, , r]) => r && r <= RACE_MAX_RANK)
        .sort((a, b) => a[2] - b[2])
        .map(([k, idx, r]) => `<div><i style="background:${RACE_COLORS[idx]}"></i>${escapeHtml(nameOf.get(k))}<span>${r}°</span></div>`)
        .join("");
    // No dots on the lines (user): on hover / tap, one on each line at that
    // point, with the tip.
    const hoverDots = (i) =>
      leaders
        .map((k, idx) => [ranksAt[i].get(k), RACE_COLORS[idx]])
        .filter(([r]) => r && r <= RACE_MAX_RANK)
        .map(([r, color]) => [y(r), color]);
    return {
      html: `<section class="pie-chart-wrap line-chart-wrap is-edge evo-chart evo-race">
        ${head("I più giocati")}
        <div class="evo-plot evo-race-plot" style="height:${H}px"><svg viewBox="0 0 ${VW} ${H}" preserveAspectRatio="none" aria-hidden="true">${axis(H)}${lines}</svg>${dateLabels(30)}${hits(tip, hoverDots)}${ends}</div>
      </section>`,
      names: leaders.map((k) => nameOf.get(k)),
    };
  }

  // --- Chi sale, chi scende -----------------------------------------------
  function movers() {
    const recentN = Math.max(1, Math.min(3, Math.floor(points.length / 3)));
    const share = (list) => {
      const m = new Map();
      for (const e of list) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
      for (const [k, v] of m) m.set(k, v / list.length);
      return m;
    };
    const recent = share(points.slice(-recentN).flatMap((p) => p.entries));
    const before = share(points.slice(0, -recentN).flatMap((p) => p.entries));
    const changes = [...new Set([...recent.keys(), ...before.keys()])].map((k) => {
      const now = recent.get(k) ?? 0;
      const was = before.get(k) ?? 0;
      return { k, name: nameOf.get(k), now, was, d: now - was };
    });
    const up = changes.filter((c) => c.d > 0).sort((a, b) => b.d - a.d).slice(0, MOVERS_COUNT);
    const down = changes.filter((c) => c.d < 0).sort((a, b) => a.d - b.d).slice(0, MOVERS_COUNT);
    const curve = (k) => {
      const s = points.map((p) => p.entries.filter((e) => key(e) === k).length / (p.entries.length || 1));
      const peak = Math.max(0.01, ...s);
      const pts = points.map((p, i) => [(xAt(p) / VW) * 200, 28 - (s[i] / peak) * 22]);
      return `<svg viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true"><path d="${smoothPath(pts)} L200,30 L0,30 Z" fill="rgba(255,255,255,.14)"></path><path d="${smoothPath(pts)}" fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"></path></svg>`;
    };
    const tile = (c, i, dir) =>
      `<a class="evo-mover" href="commander.html?id=${c.k}" data-card="${escapeHtml(c.name)}"><span class="evo-mover-rank">${i + 1}</span><span class="evo-mover-text"><b>${escapeHtml(c.name)}</b><small>${pct1(c.was)} → ${pct1(c.now)}</small>${c.was === 0 ? '<span class="evo-new">nuovo</span>' : ""}</span><span class="evo-mover-delta is-${dir}">${dir === "up" ? "+" : "−"}${pct1(Math.abs(c.d))}</span>${curve(c.k)}</a>`;
    const column = (title, dir, list) =>
      `<div><h3><span class="evo-arrow is-${dir}">${dir === "up" ? "↗" : "↘"}</span>${title}</h3>${list.length ? list.map((c, i) => tile(c, i, dir)).join("") : '<p class="page-empty">Nessuno.</p>'}</div>`;
    return {
      html: `<section class="pie-chart-wrap evo-card">
        ${head("Chi sale, chi scende")}
        <div class="evo-movers">${column("In ascesa", "up", up)}${column("In calo", "down", down)}</div>
      </section>`,
      names: [...up, ...down].map((c) => c.name),
    };
  }

  // --- Colori nel tempo: five tiles, each its latest share, its trend and
  // its curve (one chart with five lines was tried: a tangle); a sixth for
  // colorless decks when there are any (then two lines of three on a
  // computer).
  function colours() {
    const half = Math.floor(points.length / 2);
    const identity = (e) => `${e.commander?.color_identity ?? ""}${e.partner_commander?.color_identity ?? ""}`;
    const plays = (e, c) => (c === "C" ? Boolean(e.commander) && !/[WUBRG]/i.test(identity(e)) : identity(e).includes(c));
    const shown = COLOURS.filter(([c]) => c !== "C" || all.some((e) => plays(e, "C")));
    const tiles = shown.map(([c, name]) => {
      const s = points.map((p) => p.entries.filter((e) => plays(e, c)).length / (p.entries.length || 1));
      const pts = points.map((p, i) => [xAt(p), 58 - s[i] * 54]);
      const d = avg(s.slice(half)) - avg(s.slice(0, half));
      const [arrow, tcolor] = trendArrow(d, 0.02);
      return `<div class="evo-colour" style="--c:var(--colour-${c})"><div class="evo-colour-top"><span class="color-pip color-pip-${c}"></span><span class="evo-colour-name">${name}</span><span class="evo-colour-val">${pct(s.at(-1))}<span class="evo-colour-trend" style="color:${tcolor}">${arrow} ${pct(Math.abs(d))}</span></span></div><svg viewBox="0 0 ${VW} 62" preserveAspectRatio="none" aria-hidden="true"><path class="evo-colour-area" d="${smoothPath(pts)} L${VW},62 L0,62 Z"></path><path class="evo-colour-line" d="${smoothPath(pts)}" vector-effect="non-scaling-stroke"></path></svg></div>`;
    }).join("");
    return `<section class="pie-chart-wrap evo-card">
      ${head("Colori nel tempo")}
      <div class="evo-colours${shown.length > 5 ? " has-six" : ""}">${tiles}</div>
    </section>`;
  }

  // --- Ricambio del meta: two lines, the decks and those with a commander
  // never seen before.
  function turnover() {
    const H = narrow ? 210 : 240;
    const TOP = 16;
    const seen = new Set();
    const rows = points.map((p) => {
      const fresh = new Set(p.entries.map(key).filter((k) => !seen.has(k)));
      for (const e of p.entries) seen.add(key(e));
      return { n: p.entries.length, fresh: p.entries.filter((e) => fresh.has(key(e))).length };
    });
    const most = Math.max(1, ...rows.map((r) => r.n));
    const y = (v) => H - bottom - (v / most) * (H - bottom - TOP);
    const series = [
      { label: "Totale mazzi", color: "var(--turnover-decks)", values: rows.map((r) => r.n), cls: "is-decks" },
      { label: "Nuovi comandanti", color: "var(--brand-red)", values: rows.map((r) => r.fresh), cls: "is-fresh" },
    ];
    const paths = series
      .map((s) => {
        const pts = xs.map((x, i) => [x, y(s.values[i])]);
        // The area down through the dates' band to the card's edge, like
        // commander.html's "Utilizzo".
        return `<path class="evo-turnover-area ${s.cls}" d="${smoothPath(pts)} L${VW},${H} L0,${H} Z"></path><path class="evo-turnover-line ${s.cls}" d="${smoothPath(pts)}" vector-effect="non-scaling-stroke"></path>`;
      })
      .join("");
    // The values at half and the peak on the left, no lines (user); the
    // bottom axis over the areas, which run on through the dates' band.
    const yLabels = [Math.round(most / 2), most].map((v) => `<span class="line-chart-y" style="top:${y(v)}px">${v}</span>`).join("");
    const legend = series.map((s) => `<span class="evo-chip is-line"><i style="background:${s.color}"></i>${s.label}</span>`).join("");
    const tip = (i) =>
      `<strong>${escapeHtml(points[i].title)}</strong>` +
      series.map((s) => `<div><i style="background:${s.color}"></i>${s.label}<span>${s.values[i]}</span></div>`).join("");
    const dots = (i) => series.map((s) => [y(s.values[i]), s.color]);
    return `<section class="pie-chart-wrap line-chart-wrap is-edge evo-chart evo-turnover">
      ${head("Ricambio del meta", { legend })}
      <div class="evo-plot" style="height:${H}px"><svg viewBox="0 0 ${VW} ${H}" preserveAspectRatio="none" aria-hidden="true">${paths}${axis(H)}</svg>${yLabels}${dateLabels()}${hits(tip, dots)}</div>
    </section>`;
  }

  const raceSection = race();
  const moversSection = movers();
  return {
    html: archetypes() + raceSection.html + moversSection.html + colours() + turnover(),
    names: [...new Set([...raceSection.names, ...moversSection.names])].filter((n) => n && n !== "?"),
  };
}

// In-app page (js/router.js): mounted on this page's <main> (data-page), on
// first load and after each in-app navigation; `signal` aborts on leaving.
export async function mount({ signal = new AbortController().signal } = {}) {
  const sectionsEl = document.getElementById("evolution-sections");
  const leagueSelect = document.getElementById("evolution-league-filter");
  const eventSelect = document.getElementById("evolution-event-filter");
  const dateFromInput = document.getElementById("evolution-date-from");
  // The Meta section's shared filter (js/meta-filters.js) — but no event:
  // its select is hidden here (one event has no evolution).
  const shared = savedMetaFilters();
  const savedFilters = shared ? { ...shared, event: "" } : null;
  dateFromInput.value = savedFilters ? savedFilters.dateFrom : isoDateYearsAgo(DEFAULT_DATE_FROM_YEARS);
  const resultsPrefetch = prefetchMetaResults(savedFilters, dateFromInput.value, RESULTS_OPTIONS);
  rememberMetaFilters({ leagueSelect, eventSelect, dateFromInput });
  initFilterToggle("evolution-filter-toggle", "evolution-filter-panel");

  let allEvents = [];
  let allLeagues = [];
  try {
    [allEvents, allLeagues] = await Promise.all([Events.list(), Leagues.list()]);
    if (signal.aborted) return;
  } catch (err) {
    showError(sectionsEl, err);
    hidePageLoading(signal);
    return;
  }
  const eventById = new Map(allEvents.map((e) => [e.id, e]));
  const eventDateById = new Map(allEvents.map((e) => [e.id, e.event_date]));
  let scopeIds = [];
  let shown = null; // { points, byMonth } on screen
  let shownWidth = 0;
  const art = new Map(); // card name (lowercase) → art crop URL, kept across redraws

  async function paintArt(names) {
    const missing = names.filter((n) => !art.has(n.toLowerCase()));
    if (missing.length) {
      const urls = await scryfallImages(missing, "art_crop");
      for (const n of missing) art.set(n.toLowerCase(), urls.get(n.toLowerCase()) ?? urls.get(n.toLowerCase().split(" // ")[0]) ?? null);
    }
    if (signal.aborted) return;
    for (const el of sectionsEl.querySelectorAll("[data-card]")) {
      const url = art.get(el.dataset.card.toLowerCase());
      if (url) el.style.backgroundImage = `url("${url}")`;
    }
  }

  function draw() {
    shownWidth = sectionsEl.clientWidth;
    const { html, names } = sectionsHtml(shown, shownWidth);
    sectionsEl.innerHTML = html;
    paintArt(names).catch((err) => console.error(err));
  }

  async function render() {
    const from = dateFromInput.value;
    const ids = scopeIds.filter((id) => !from || (eventDateById.get(id) ?? "") >= from);
    const events = ids.map((id) => eventById.get(id)).filter(Boolean).sort((a, b) => a.event_date.localeCompare(b.event_date));
    try {
      const eventsData = await metaResults(resultsPrefetch, events.map((e) => e.id), eventDateById, RESULTS_OPTIONS);
      if (signal.aborted) return;
      const withDecks = events.map((ev, i) => [ev, eventsData[i]]).filter(([, d]) => d.entries.length);
      if (withDecks.length < 2) {
        shown = null;
        sectionsEl.innerHTML = `<div class="pie-chart-wrap"><p class="page-empty">Servono almeno due eventi nel periodo scelto per vedere l'evoluzione.</p></div>`;
        return;
      }
      shown = buildPoints(withDecks.map(([ev]) => ev), withDecks.map(([, d]) => d));
      draw();
    } catch (err) {
      showError(sectionsEl, err);
    } finally {
      hidePageLoading(signal);
    }
  }

  // A point's tip kept whole inside its card, which clips it (rounded
  // corners): measured as it shows (hover, or a tap — pointerover fires for
  // both) and moved in (the CSS `translate`, on top of its own centring
  // transform) from a side it would pass — like js/line-chart.js fitTip.
  sectionsEl.addEventListener(
    "pointerover",
    (e) => {
      const hit = e.target.closest?.(".line-chart-hit");
      const tip = hit?.querySelector(".evo-tip");
      const card = hit?.closest(".pie-chart-wrap");
      if (!tip || !card) return;
      tip.style.translate = "";
      const box = card.getBoundingClientRect();
      const r = tip.getBoundingClientRect();
      let dx = 0;
      if (r.left < box.left + TIP_MARGIN) dx = box.left + TIP_MARGIN - r.left;
      else if (r.right > box.right - TIP_MARGIN) dx = box.right - TIP_MARGIN - r.right;
      const dy = r.bottom > box.bottom - TIP_MARGIN ? Math.max(box.top + TIP_MARGIN - r.top, box.bottom - TIP_MARGIN - r.bottom) : 0;
      if (dx || dy) tip.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
    },
    { passive: true, signal }
  );

  // I più giocati: pointing at a commander's disc lights its line.
  sectionsEl.addEventListener(
    "pointerover",
    (e) => {
      const raceEl = e.target.closest(".evo-race");
      if (!raceEl) return;
      const k = e.target.closest("[data-k]")?.dataset.k;
      raceEl.classList.toggle("has-focus", Boolean(k));
      for (const el of raceEl.querySelectorAll("[data-k]")) el.classList.toggle("is-focus", el.dataset.k === k);
    },
    { signal }
  );
  sectionsEl.addEventListener(
    "pointerout",
    (e) => {
      const raceEl = e.target.closest(".evo-race");
      if (raceEl && !raceEl.contains(e.relatedTarget)) raceEl.classList.remove("has-focus");
    },
    { signal }
  );

  // Redrawn (from the same data) when the width changes enough to move the
  // date labels or the phone layout.
  let resizeTimer = 0;
  const resize = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (shown && Math.abs(sectionsEl.clientWidth - shownWidth) > 40) draw();
    }, 150);
  });
  resize.observe(sectionsEl);
  signal.addEventListener("abort", () => resize.disconnect(), { once: true });

  dateFromInput.addEventListener("change", render, { signal });
  initScopeFilter({
    leagueSelect,
    eventSelect,
    initial: savedFilters,
    leagues: allLeagues,
    events: allEvents,
    onChange: (eventIds) => {
      scopeIds = eventIds;
      render();
    },
  });
}
