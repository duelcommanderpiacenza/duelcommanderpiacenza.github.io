// league.html's "Statistiche" tab (user, 2026-11-25 — from a mockup): the
// league's records over its closed events, from the results the page has
// already loaded (js/league-detail.js), no request of its own.
//
// Giocatori: three cards in player.html's rivals' look (.rivals /
// .rival-card) — Miglior winrate (stats.js computeLeagueWrapped's: at least
// half the matches of the most active player), Il più costante (the best
// average place in the events played, at least half of them and 2; shown
// rounded, picked on the exact average), La scalata (the most places gained
// since a player's first event, only someone in today's top RACE_TOP — a
// climb from 38th to 18th isn't one; none, or a Topdeck series without
// standings: Più partite vinte) — never one player on two cards (picked in
// that order: Miglior winrate, La scalata, Il più costante); then La corsa
// al titolo (today's top RACE_TOP's place after each event; not for a
// Topdeck series) and the Albo d'oro (each event's winner and deck, newest
// first). Comandanti: Il più giocato, Il
// più vincente (at least MIN_DECK_MATCHES matches), Più spesso in top 8
// (the best share of finishes in the top cut — top 4 in a Topdeck series'
// small events —, at least MIN_DECK_ENTRIES decks, never a deck already on
// the other two cards); then I mazzi della lega (every deck: decks, V-S-P,
// winrate, best place; the first DECKS_SHOWN, then "Mostra tutti").
// A deck is the commander + partner pairing (the Comandanti page's);
// byes and drops aren't matches. An online league's players by their
// endstep username (js/ui.js onlinePlayer), as its Classifica.
import { computeEventLeaderboard, computeLeaguePoints } from "./leaderboard.js";
import { computeGroupedStats, computeLeagueWrapped } from "./stats.js";
import { commanderPairLabel, commanderPairWithColors, escapeHtml, eventTitle, formatDate, onlinePlayer, playerLabel } from "./ui.js";
import { historyPanelHtml, historyStatsHtml } from "./history-list.js";
import { locale } from "./locale.js";

const RACE_TOP = 8;
// La corsa al titolo's lines, in standings order.
const RACE_COLORS = ["#dc181c", "#2f5fdc", "#14914a", "#e0752b", "#7c3aed", "#0aa8bd", "#b7791f", "#d63384"];
// Below this width the names go in a legend under the chart.
const RACE_NARROW = 600;
// Places 1..RACE_TOP get this share of the chart's height, so the top 8's
// ends (one place apart) leave room for their names; the places below share
// the rest.
const RACE_TOP_SHARE = 0.62;
const MIN_DECK_MATCHES = 6;
const MIN_DECK_ENTRIES = 3;
const DECKS_SHOWN = 10;
const TIP_MARGIN = 8;

// Lucide line icons (ISC) — each one's meaning listed in docs/icons.md (an
// icon means one thing site-wide). award / swords: the Top 8 / Vittorie
// achievements'; pie: Meta and the Bacheca's Più giocati.
const ICONS = {
  crown:
    '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  anchor: '<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  swords:
    '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4M7 17l-3 3M3 19l2 2"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9Z"></path><path d="M15 3.5A9 9 0 0 1 20.5 9H15Z"></path>',
  award:
    '<path d="m15.48 12.89 1.51 8.53a.5.5 0 0 1-.81.47l-3.58-2.69a1 1 0 0 0-1.2 0l-3.59 2.69a.5.5 0 0 1-.81-.47l1.51-8.53"/><circle cx="12" cy="8" r="6"/>',
};
const svg = (path) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const CHEVRON =
  '<svg class="rival-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

const deckKey = (e) => `${e.commander_id}_${e.partner_commander_id ?? ""}`;
const deckName = (d) => commanderPairLabel(d.commander, d.partner, { link: false });
const vsp = (r) => `${r.wins}-${r.losses}-${r.draws}`;
const pct = (n) => (n === null || n === undefined ? "—" : `${Math.round(n)}%`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function cardHtml({ kind, icon, label, href, name, sub, stat, unit }) {
  return `<a class="rival-card is-${kind}" href="${href}">
      <span class="rival-icon" aria-hidden="true">${svg(ICONS[icon])}</span>
      <span class="rival-text"><span class="rival-label">${label}</span><span class="rival-name">${name}</span><span class="rival-record">${sub}</span></span>
      <span class="rival-stat"><b>${stat}</b><small>${unit}</small></span>
      ${CHEVRON}
    </a>`;
}

// The event's day over its month ("22" / "nov").
function dateChipHtml(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const month = d.toLocaleDateString(locale(), { month: "short" }).replace(".", "");
  return `<span class="league-stats-date" title="${formatDate(iso)}"><b>${d.getDate()}</b>${escapeHtml(month)}</span>`;
}

// A league's leg ("Tappa 3/7") as "T3", else the event's day ("22/11").
function raceLabel(ev, k) {
  const m = /Tappa (\d+)/.exec(ev.name ?? "");
  if (m) return `T${m[1]}`;
  return ev.event_date ? `${ev.event_date.slice(8, 10)}/${ev.event_date.slice(5, 7)}` : String(k + 1);
}

/**
 * Draws the tab into `el`.
 * @param {HTMLElement} el
 * @param {Object} options
 * @param {Object} options.league - the league's row.
 * @param {Array} options.eventsData - fetchEventsResults(events)'s, one per closed event (with `event`).
 * @param {Array} options.standings - computeLeaguePoints(eventsData, …)'s.
 * @param {number} options.scheduledEvents - the league's total event count (computeLeaguePoints's X).
 * @param {AbortSignal} options.signal - the page's.
 */
export function renderLeagueStats(el, { league, eventsData, standings, scheduledEvents, signal }) {
  el.classList.remove("page-loading");
  if (!eventsData.length) {
    el.innerHTML = '<p class="page-empty">Nessun evento giocato.</p>';
    return;
  }
  // Oldest first (the race needs the standings event after event).
  const when = (d) => `${d.event?.event_date ?? ""}T${d.event?.start_time ?? ""}${d.event?.created_at ?? ""}`;
  const data = [...eventsData].sort((a, b) => when(a).localeCompare(when(b)));
  const events = data.map((d) => d.event);
  const boards = data.map((d) => computeEventLeaderboard(d.matches, d.entries, d.event));
  const show = (p) => (league.is_online ? onlinePlayer(p) : p);
  const nameOf = (p) => escapeHtml(show(p)?.name ?? "?");

  // --- Giocatori ---------------------------------------------------------
  const best = computeLeagueWrapped(data, standings).bestWinrate;
  const shown = new Set(best ? best.players.map((p) => p.id) : []);

  // Each player's place after every event (a Topdeck series: none).
  const positions = league.no_points
    ? null
    : data.map((_, k) => {
        const st = computeLeaguePoints(data.slice(0, k + 1), { scheduledEvents });
        return new Map(st.map((r, i) => [r.player.id, i + 1]));
      });

  let climb = null;
  if (positions && positions.length >= 2) {
    const now = positions.at(-1);
    for (const s of standings) {
      if (shown.has(s.player.id)) continue;
      const first = positions.find((p) => p.has(s.player.id))?.get(s.player.id);
      const today = now.get(s.player.id);
      const gain = first - today;
      if (today <= RACE_TOP && gain > 0 && (!climb || gain > climb.gain || (gain === climb.gain && today < climb.today)))
        climb = { player: s.player, first, today, gain };
    }
  }
  const mostWins = climb
    ? null
    : standings
        .filter((s) => s.wins > 0 && !shown.has(s.player.id))
        .sort((a, b) => b.wins - a.wins || a.player.name.localeCompare(b.player.name))[0];
  if (climb) shown.add(climb.player.id);
  if (mostWins) shown.add(mostWins.player.id);

  const places = new Map(); // player id -> { player, sum, n }
  for (const board of boards)
    board.forEach((row, i) => {
      if (!row.player?.id) return;
      const r = places.get(row.player.id) ?? { player: row.player, sum: 0, n: 0 };
      r.sum += i + 1;
      r.n += 1;
      places.set(row.player.id, r);
    });
  const minEvents = Math.max(2, Math.ceil(events.length / 2));
  const steady = [...places.values()]
    .filter((r) => r.n >= minEvents && !shown.has(r.player.id))
    .map((r) => ({ ...r, avg: r.sum / r.n }))
    .sort((a, b) => a.avg - b.avg || b.n - a.n || a.player.name.localeCompare(b.player.name))[0];

  const playerHref = (p) => `player.html?id=${encodeURIComponent(p.id)}`;
  const playerCards = [
    best &&
      cardHtml({
        kind: "master",
        icon: "crown",
        label: "Miglior winrate",
        href: playerHref(best.players[0]),
        name: best.players.map(nameOf).join(", "),
        sub: best.players.length === 1 ? `${best.wins}-${best.losses}-${best.draws}` : "",
        stat: pct(best.winRate),
        unit: "winrate",
      }),
    steady &&
      cardHtml({
        kind: "victim",
        icon: "anchor",
        label: "Il più costante",
        href: playerHref(steady.player),
        name: nameOf(steady.player),
        sub: `su ${steady.n} eventi giocati`,
        stat: `${Math.round(steady.avg)}°`,
        unit: "posto medio",
      }),
    climb &&
      cardHtml({
        kind: "regular",
        icon: "mountain",
        label: "La scalata",
        href: playerHref(climb.player),
        name: nameOf(climb.player),
        sub: `dal ${climb.first}° al ${climb.today}°`,
        stat: `+${climb.gain}`,
        unit: climb.gain === 1 ? "posizione" : "posizioni",
      }),
    mostWins &&
      cardHtml({
        kind: "regular",
        icon: "swords",
        label: "Più partite vinte",
        href: playerHref(mostWins.player),
        name: nameOf(mostWins.player),
        sub: vsp(mostWins),
        stat: mostWins.wins,
        unit: mostWins.wins === 1 ? "vittoria" : "vittorie",
      }),
  ].filter(Boolean);

  const honours = data
    .map((d, k) => {
      const w = boards[k][0];
      if (!w?.player) return "";
      const e = d.entries.find((x) => x.player_id === w.player.id);
      return `<a class="history-item history-ranked" href="event.html?id=${encodeURIComponent(events[k].id)}">
        <div class="history-lead">
          ${dateChipHtml(events[k].event_date)}
          <div class="history-main">
            <span class="history-title"><span class="history-name">${playerLabel(show(w.player), { link: false })}</span></span>
            <span class="history-meta">${e ? commanderPairWithColors(e.commander, e.partner_commander, { link: false }) : ""}</span>
          </div>
        </div>
        ${historyStatsHtml([
          { label: "Punti", value: w.points, main: true },
          { label: "V-S-P", value: vsp(w) },
          { label: "Giocatori", value: d.entries.length },
        ])}
      </a>`;
    })
    .reverse()
    .join("");

  // --- Comandanti --------------------------------------------------------
  const decks = computeGroupedStats(data, deckKey, (e) => ({ commander: e.commander, partner: e.partner_commander ?? null }));
  const deckOf = new Map(decks.map((d) => [d.key, d]));
  for (const d of decks) Object.assign(d, { pilots: new Set(), eventWins: 0, tops: 0, best: null });
  // A league's events (~25 players): the top 8; a Topdeck series' (~12): the top 4.
  const topCut = league.no_points ? 4 : 8;
  data.forEach((d, k) => {
    const entryOf = new Map(d.entries.map((e) => [e.player_id, e]));
    boards[k].forEach((row, i) => {
      const e = entryOf.get(row.player?.id);
      const deck = e && deckOf.get(deckKey(e));
      if (!deck) return;
      deck.pilots.add(row.player.id);
      if (i === 0) deck.eventWins += 1;
      if (i < topCut) deck.tops += 1;
      deck.best = Math.min(deck.best ?? Infinity, i + 1);
    });
  });
  const byUsage = (a, b) => b.entries - a.entries || (b.winRate ?? -1) - (a.winRate ?? -1) || deckName(a).localeCompare(deckName(b));
  const mostPlayed = [...decks].sort(byUsage)[0];
  const bestDeck = decks
    .filter((d) => d.played >= MIN_DECK_MATCHES)
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played)[0];
  const mostTops = decks
    .filter((d) => d.tops && d.entries >= MIN_DECK_ENTRIES && d !== mostPlayed && d !== bestDeck)
    .sort((a, b) => b.tops / b.entries - a.tops / a.entries || b.tops - a.tops || b.winRate - a.winRate)[0];
  const deckHref = (d) => `commander.html?id=${encodeURIComponent(d.commander.id)}`;
  const commanderCards = [
    mostPlayed &&
      cardHtml({
        kind: "regular",
        icon: "pie",
        label: "Il più giocato",
        href: deckHref(mostPlayed),
        name: deckName(mostPlayed),
        sub: `${plural(mostPlayed.pilots.size, "pilota", "piloti")} · ${pct(mostPlayed.winRate)}`,
        stat: mostPlayed.entries,
        unit: mostPlayed.entries === 1 ? "mazzo" : "mazzi",
      }),
    bestDeck &&
      cardHtml({
        kind: "master",
        icon: "crown",
        label: "Il più vincente",
        href: deckHref(bestDeck),
        name: deckName(bestDeck),
        sub: `${vsp(bestDeck)} · min. ${MIN_DECK_MATCHES} partite`,
        stat: pct(bestDeck.winRate),
        unit: "winrate",
      }),
    mostTops &&
      cardHtml({
        kind: "nemesis",
        icon: "award",
        label: `Più spesso in top ${topCut}`,
        href: deckHref(mostTops),
        name: deckName(mostTops),
        sub: `${mostTops.tops} volte su ${mostTops.entries}`,
        stat: pct((mostTops.tops / mostTops.entries) * 100),
        unit: `in top ${topCut}`,
      }),
  ].filter(Boolean);

  const deckRows = [...decks]
    .sort(byUsage)
    .map(
      (d, i) => `<a class="history-item history-ranked${i >= DECKS_SHOWN ? " is-more" : ""}" href="${deckHref(d)}">
        <div class="history-lead">
          <span class="history-pos">${i + 1}°</span>
          <div class="history-main">
            <span class="history-title"><span class="history-name">${commanderPairWithColors(d.commander, d.partner, { link: false })}</span></span>
            <span class="history-meta">${plural(d.pilots.size, "pilota", "piloti")}${d.eventWins ? ` · 🏆 ${d.eventWins}` : ""}</span>
          </div>
        </div>
        ${historyStatsHtml([
          { label: "Mazzi", value: d.entries, main: true },
          { label: "V-S-P", value: vsp(d) },
          { label: "Winrate", value: pct(d.winRate) },
          { label: "Miglior", value: d.best ? `${d.best}°` : "—" },
        ])}
      </a>`
    )
    .join("");

  const race =
    positions && events.length >= 2
      ? `<section class="card league-stats-card league-race-card" id="league-race">
          <h3>La corsa al titolo</h3>
          <div class="league-race-plot"></div>
        </section>`
      : "";

  el.innerHTML = `
    <h2 class="league-stats-heading">Giocatori</h2>
    ${playerCards.length ? `<div class="rivals league-stats-cards">${playerCards.join("")}</div>` : ""}
    ${race}
    <section class="card league-stats-card">
      <h3>Albo d'oro</h3>
      ${historyPanelHtml(honours, { scroll: false })}
    </section>
    <h2 class="league-stats-heading">Comandanti</h2>
    ${commanderCards.length ? `<div class="rivals league-stats-cards">${commanderCards.join("")}</div>` : ""}
    <section class="card league-stats-card league-stats-decks">
      <h3>I mazzi della lega <span class="history-count">${decks.length}</span></h3>
      ${historyPanelHtml(deckRows, { scroll: false })}
      ${decks.length > DECKS_SHOWN ? `<button type="button" class="league-stats-all">Mostra tutti i ${decks.length} mazzi</button>` : ""}
    </section>`;

  el.querySelector(".league-stats-all")?.addEventListener("click", (e) => {
    e.currentTarget.closest(".league-stats-decks").classList.add("is-all");
    e.currentTarget.remove();
  });

  // The race: drawn for the width it has (names at the lines' ends, or in a
  // legend under it on a narrow one), again when that changes sides. The
  // panel may be hidden behind another tab: the tabs' width then.
  const plot = el.querySelector(".league-race-plot");
  if (!plot) return;
  const top = standings.slice(0, RACE_TOP);
  const widthOf = () => el.clientWidth || el.closest(".league-lists")?.clientWidth || 0;
  let narrow = null;
  const draw = () => {
    const isNarrow = widthOf() < RACE_NARROW;
    if (isNarrow === narrow) return;
    narrow = isNarrow;
    plot.innerHTML = raceHtml({ events, positions, top, narrow, nameOf });
  };
  draw();
  const resize = new ResizeObserver(draw);
  resize.observe(el.closest(".league-lists") ?? el);
  signal?.addEventListener("abort", () => resize.disconnect(), { once: true });

  // A point's tip kept whole inside its card (like js/evolution-page.js's).
  plot.addEventListener(
    "pointerover",
    (e) => {
      const tip = e.target.closest?.(".line-chart-hit")?.querySelector(".evo-tip");
      if (!tip) return;
      tip.style.translate = "";
      const box = plot.closest(".league-stats-card").getBoundingClientRect();
      const r = tip.getBoundingClientRect();
      let dx = 0;
      if (r.left < box.left + TIP_MARGIN) dx = box.left + TIP_MARGIN - r.left;
      else if (r.right > box.right - TIP_MARGIN) dx = box.right - TIP_MARGIN - r.right;
      if (dx) tip.style.translate = `${Math.round(dx)}px 0`;
    },
    { passive: true, signal }
  );
}

// La corsa al titolo: one line per player of today's top 8, their place
// after each event (from their first). An SVG scaled to the width (its
// viewBox), the site's hover strips over it (.line-chart-hit, a guide and a
// tip listing the places at that event — js/chart-scrub.js on touch screens).
function raceHtml({ events, positions, top, narrow, nameOf }) {
  const W = narrow ? 360 : 640;
  const H = narrow ? 230 : 260;
  const L = 34;
  const R = narrow ? 14 : 150;
  const T = 14;
  const B = 30;
  const maxPos = Math.max(RACE_TOP, ...top.flatMap((s) => positions.map((p) => p.get(s.player.id) ?? 0)));
  const span = H - T - B;
  const topSpan = maxPos > RACE_TOP ? span * RACE_TOP_SHARE : span;
  const y = (pos) =>
    pos <= RACE_TOP
      ? T + ((pos - 1) * topSpan) / (Math.min(maxPos, RACE_TOP) - 1)
      : T + topSpan + ((pos - RACE_TOP) * (span - topSpan)) / (maxPos - RACE_TOP);
  const x = (k) => L + (k * (W - L - R)) / (events.length - 1);

  // The axis: 1°, 4°, the top 8's edge, then every 5th and the lowest, apart.
  const grid = Array.from({ length: maxPos }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === 4 || p === RACE_TOP || (p >= RACE_TOP + 4 && p % 5 === 0 && maxPos - p >= 2) || (p === maxPos && p > RACE_TOP + 1))
    .map(
      (p) =>
        `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="league-race-grid"></line><text x="${L - 8}" y="${y(p) + 4}" class="league-race-axis" text-anchor="end">${p}°</text>`
    )
    .join("");
  const xs = events
    .map((ev, k) => `<text x="${x(k)}" y="${H - 8}" class="league-race-axis" text-anchor="middle">${escapeHtml(raceLabel(ev, k))}</text>`)
    .join("");
  const lines = top
    .map((s, i) => {
      const pts = positions.map((p, k) => [k, p.get(s.player.id)]).filter(([, p]) => p);
      const path = pts.map(([k, p], j) => `${j ? "L" : "M"}${x(k)},${y(p)}`).join(" ");
      const [lk, lp] = pts.at(-1);
      const label = narrow ? "" : `<text x="${x(lk) + 10}" y="${y(lp) + 4}" class="league-race-label">${i + 1}° ${nameOf(s.player)}</text>`;
      return `<g class="league-race-line" style="--c:${RACE_COLORS[i]}"><path d="${path}"></path>${pts
        .map(([k, p]) => `<circle cx="${x(k)}" cy="${y(p)}" r="4.5"></circle>`)
        .join("")}${label}</g>`;
    })
    .join("");

  // The hover strips, one per event, across the plot (in % of the viewBox,
  // which the SVG keeps at its width).
  const xPct = (v) => `${((v / W) * 100).toFixed(3)}%`;
  const hits = events
    .map((ev, k) => {
      const left = k === 0 ? L - 16 : (x(k - 1) + x(k)) / 2;
      const right = k === events.length - 1 ? x(k) + 16 : (x(k) + x(k + 1)) / 2;
      const inner = `${(((x(k) - left) / (right - left)) * 100).toFixed(3)}%`;
      const rows = top
        .map((s, i) => [s, i, positions[k].get(s.player.id)])
        .filter(([, , p]) => p)
        .sort((a, b) => a[2] - b[2])
        .map(([s, i, p]) => `<div><i style="background:${RACE_COLORS[i]}"></i>${nameOf(s.player)}<span>${p}°</span></div>`)
        .join("");
      return `<span class="line-chart-hit" style="left:${xPct(left)};width:${xPct(right - left)}"><span class="line-chart-guide" style="left:${inner}"></span><span class="evo-tip" style="left:${inner}"><strong>${escapeHtml(
        eventTitle(ev)
      )}</strong>${rows}</span></span>`;
    })
    .join("");

  const legend = narrow
    ? `<ol class="league-race-legend">${top.map((s, i) => `<li style="--c:${RACE_COLORS[i]}">${i + 1}° ${nameOf(s.player)}</li>`).join("")}</ol>`
    : "";
  return `<div class="league-race-chart"><svg class="league-race" viewBox="0 0 ${W} ${H}" role="img" aria-label="Posizioni dopo ogni evento">${grid}${xs}${lines}</svg>${hits}</div>${legend}`;
}
