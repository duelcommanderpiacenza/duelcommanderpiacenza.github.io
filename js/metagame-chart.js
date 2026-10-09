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
 * Metagame share as scattered bubbles (the Bacheca's "Commander più
 * giocati"): one circle per row, its AREA proportional to its share, filled
 * with the commander's art (hydrateBubbleArt, after it's in the page) — the
 * biggest in the middle, the others placed round it on a widening spiral,
 * each at the first spot where it touches none of those already placed (a
 * gap between them). Laid out once in abstract units, then written as
 * percentages of the group's bounding box (the box keeps that box's
 * proportions), so it scales with the card. Just the % on each bubble (its
 * name on hover, and its coloured ring matches its legend row); all of them in
 * the donut's own legend below. A row with `href` is a link (the commander page),
 * one with `card` gets that card's art (without: filled with its colour —
 * the archetypes); one with `bubble: false` ("Altri")
 * is in the legend only.
 * @param {Array<{label: string, share: number, color: string, href?: string, card?: string, bubble?: boolean}>} rows
 * @param {string} emptyMessage
 * @param {string} [title]
 * @param {{subtitle?: string, footer?: string}} [options] - as renderPieChart's.
 */
export function renderBubbleChart(rows, emptyMessage, title, { subtitle = "", footer = "" } = {}) {
  const titleHtml =
    (title ? `<h2 class="pie-chart-title">${escapeHtml(title)}</h2>` : "") +
    (subtitle ? `<p class="pie-chart-subtitle">${escapeHtml(subtitle)}</p>` : "");
  const visible = rows.filter((r) => r.share > 0);
  if (visible.length === 0) {
    return `<div class="pie-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p>${footer}</div>`;
  }

  // Biggest first (it takes the middle). A row with bubble: false ("Altri",
  // often the biggest share of all) is in the legend only.
  const items = visible
    .filter((r) => r.bubble !== false)
    .map((r) => ({ ...r, r: Math.sqrt(r.share) }))
    .sort((a, b) => b.r - a.r);
  if (items.length === 0) {
    return `<div class="pie-chart-wrap">${titleHtml}<p class="page-empty">${emptyMessage}</p>${footer}</div>`;
  }
  const GAP = 0.55;
  const placed = [];
  for (const item of items) {
    if (!placed.length) {
      placed.push({ ...item, x: 0, y: 0 });
      continue;
    }
    // A spiral, a little wider than tall (the card is), out from the middle.
    for (let t = 0; ; t += 0.1) {
      const d = 0.32 * t;
      const x = Math.cos(t) * d * 1.35;
      const y = Math.sin(t) * d;
      if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + item.r + GAP)) {
        placed.push({ ...item, x, y });
        break;
      }
    }
  }
  const PAD = 0.4;
  const minX = Math.min(...placed.map((p) => p.x - p.r)) - PAD;
  const maxX = Math.max(...placed.map((p) => p.x + p.r)) + PAD;
  const minY = Math.min(...placed.map((p) => p.y - p.r)) - PAD;
  const maxY = Math.max(...placed.map((p) => p.y + p.r)) + PAD;
  const W = maxX - minX;
  const H = maxY - minY;
  const pct = (n) => `${n.toFixed(3)}%`;

  // Each bubble drifts on its own (styles.css bubble-float): a direction,
  // a length and a pace of its own — from its index, so the same chart
  // always moves the same way — never all in step.
  const drift = (i) => {
    const angle = i * 2.399; // the golden angle: directions well spread out
    const dist = 4 + (i % 3) * 1.5;
    return `--float-x:${(Math.cos(angle) * dist).toFixed(1)}px;--float-y:${(Math.sin(angle) * dist).toFixed(1)}px;--float-turn:${
      i % 2 ? 2.5 : -2.5
    }deg;--float-time:${(5.5 + (i % 4) * 1.03).toFixed(1)}s;--float-delay:${(-i * 1.4).toFixed(1)}s;`;
  };

  const bubbles = placed
    .map((p, i) => {
      const style = `left:${pct(((p.x - p.r - minX) / W) * 100)};top:${pct(((p.y - p.r - minY) / H) * 100)};width:${pct(
        ((2 * p.r) / W) * 100
      )};--bubble-color:${p.color};--enter-delay:${i * 90}ms;${drift(i)}`;
      const inner = `${p.card ? `<span class="bubble-art" data-card="${escapeHtml(p.card)}"></span>` : ""}
        <span class="bubble-label"><strong>${Math.round(p.share)}%</strong></span>`;
      const label = `${escapeHtml(p.label)}: ${p.share.toFixed(1)}%`;
      const key = `data-bubble="${escapeHtml(p.label)}"`;
      // No art (an archetype): filled with its colour instead.
      const cls = `bubble${p.card ? "" : " is-solid"}`;
      return p.href
        ? `<a class="${cls}" ${key} href="${escapeHtml(p.href)}" style="${style}" title="${label}" aria-label="${label}">${inner}</a>`
        : `<span class="${cls}" ${key} style="${style}" title="${label}">${inner}</span>`;
    })
    .join("");

  // The donut's legend rows (swatch, name, %), the swatch the commander's
  // art (hydrateBubbleArt; "Altri" its colour), and under the name a bar in
  // that colour filled to its share (12% → 12% of the track).
  const legend = visible
    .map(
      (r, i) => `
    <span class="pie-legend-item bubble-legend-item" data-bubble-for="${escapeHtml(r.label)}" style="animation-delay:${i * 60}ms;">
      ${
        r.card
          ? `<span class="pie-legend-swatch bubble-legend-swatch" data-card="${escapeHtml(r.card)}" style="--bubble-color:${r.color};"></span>`
          : `<span class="pie-legend-swatch" style="background:${r.color};"></span>`
      }
      <span class="pie-legend-label">${escapeHtml(r.label)}</span>
      <strong class="pie-legend-pct">${r.share.toFixed(1)}%</strong>
      <span class="bubble-legend-bar" aria-hidden="true"><span style="width:${Math.min(100, r.share).toFixed(1)}%;background:${r.color};"></span></span>
    </span>`
    )
    .join("");

  return `
    <div class="pie-chart-wrap bubble-chart-wrap">
      ${titleHtml}
      <div class="bubble-chart" style="aspect-ratio:${W.toFixed(3)} / ${H.toFixed(3)};" role="img" aria-label="Grafico a bolle del metagame">${bubbles}</div>
      <div class="pie-legend bubble-legend">${legend}</div>
      ${footer}
    </div>
  `;
}

// After a bubble chart is in the page: its art (hydrateBubbleArt), and a
// legend row pointed at, touched (scrolling over it too) or tapped makes its
// bubble pulse, to find it: it swells for a moment with a ring in its
// colour. A Web Animation (not a CSS class): it plays over the bubble's CSS
// drift (translate / rotate) without restarting it, and a new pulse on the
// same bubble cancels the one still running, so every pulse shows whole.
// Touch screens: an empty touchstart listener, so a tapped bubble gets its
// :active press (iOS shows :active only with one).
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// The bubble's own shadow (styles.css .bubble), kept under the ring.
const BUBBLE_SHADOW = "0 8px 22px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(255, 255, 255, 0.35)";
const pulses = new WeakMap();

export function initBubbleChart(rootEl) {
  hydrateBubbleArt(rootEl);
  // The pulse settles into whatever the bubble's resting look is (no last
  // keyframe): hovered, styles.css's ring and grown size; else none.
  const pulseBubble = (bubble) => {
    if (reducedMotion() || !bubble) return;
    pulses.get(bubble)?.cancel();
    const color = bubble.style.getPropertyValue("--bubble-color") || "#dc181c";
    pulses.set(
      bubble,
      bubble.animate(
        [
          { scale: 1, boxShadow: `${BUBBLE_SHADOW}, 0 0 0 3px ${color}` },
          { scale: 1.14, boxShadow: `${BUBBLE_SHADOW}, 0 0 0 7px ${color}`, offset: 0.4 },
        ],
        { duration: 900, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.3)" }
      )
    );
  };
  // A legend row's bubble, in its own chart (a carousel can hold several).
  const bubbleFor = (row) => {
    const chart = row.closest(".bubble-chart-wrap") ?? rootEl;
    return [...chart.querySelectorAll(".bubble[data-bubble]")].find((b) => b.dataset.bubble === row.dataset.bubbleFor);
  };
  // Entering a legend row — the mouse, or a finger landing on it (scrolling
  // over the legend included) — or a bubble itself with the mouse. While on
  // a row, its bubble stays highlighted (.is-highlighted: the hover ring and
  // size), set before the pulse so the pulse settles into it.
  rootEl.addEventListener("pointerover", (e) => {
    const row = e.target.closest("[data-bubble-for]");
    if (row && !row.contains(e.relatedTarget)) {
      const bubble = bubbleFor(row);
      bubble?.classList.add("is-highlighted");
      pulseBubble(bubble);
    }
    const bubble = e.pointerType === "mouse" ? e.target.closest(".bubble[data-bubble]") : null;
    if (bubble && !bubble.contains(e.relatedTarget)) pulseBubble(bubble);
  });
  rootEl.addEventListener("pointerout", (e) => {
    const row = e.target.closest("[data-bubble-for]");
    if (row && !row.contains(e.relatedTarget)) bubbleFor(row)?.classList.remove("is-highlighted");
  });
  // A tap on a row already pulsed: a fresh pulse.
  rootEl.addEventListener("click", (e) => {
    const row = e.target.closest("[data-bubble-for]");
    if (row) pulseBubble(bubbleFor(row));
  });
  rootEl.addEventListener("touchstart", () => {}, { passive: true });
}

// The bubbles' art (Scryfall's art crop of each card, one batch request for
// all of them), faded in as it arrives; a bubble whose card isn't found keeps
// its colour. Never rejects.
export async function hydrateBubbleArt(rootEl) {
  const arts = [...rootEl.querySelectorAll(".bubble-art[data-card], .bubble-legend-swatch[data-card]")];
  if (!arts.length) return;
  const names = [...new Set(arts.map((el) => el.dataset.card))];
  const urls = new Map();
  try {
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identifiers: names.slice(0, 75).map((name) => ({ name })) }),
    });
    if (res.ok) {
      for (const card of (await res.json()).data ?? []) {
        const url = (card.image_uris ?? card.card_faces?.[0]?.image_uris)?.art_crop;
        if (!url) continue;
        for (const name of [card.name, ...(card.card_faces ?? []).map((f) => f.name)]) urls.set(name.toLowerCase(), url);
      }
    }
  } catch (err) {
    console.error(err);
    return;
  }
  for (const el of arts) {
    const url = urls.get(el.dataset.card.toLowerCase());
    if (!url) continue;
    const img = new Image();
    img.onload = () => {
      el.style.backgroundImage = `url("${url}")`;
      el.classList.add("is-loaded");
    };
    img.src = url;
  }
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
