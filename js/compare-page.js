// compare.html — "Confronto", Giocatori's second tab: two players side by
// side, over their whole history (no filters — user). Chosen 2026-11-01
// from three rounds of mockups. Everything is computed here from every
// closed event's entries + matches (fetchClosedResultsSince, one paged
// request each, no event ids needed first) and the event_standings cache
// (positions):
//  - the hero: the two names (each a button opening the picker, underlined
//    in its player's colour — A red on the left, B blue on the right), on
//    their most played commanders' art, the matches won against each other
//    between them (draws not shown); on touch screens a scoreboard;
//  - Statistiche: winrate (featured), Eventi, Primi posti, Top 8 (events of
//    20+ players, like the player card's Podio) and Top 4 (smaller events),
//    Comandanti — a tug-of-war bar each;
//  - Scontri diretti: their matches, newest first, as scoreboard rows;
//  - Andamento: commander.html's edge-to-edge chart (js/line-chart.js's
//    look), two lines — the overall winrate after each event, or the places
//    in the events played together;
//  - Archetipi: a strip per player split by archetype, the legend under
//    them, a pick lighting one and giving its events and winrate;
//  - Comandanti: each one's 3 most played decks as art tiles.
// The pair is in the address (?a=&b=, kept up to date, so a comparison can
// be shared); without one, no player is chosen: a line invites to pick two
// (user: no default pair).

import { Players, Events, EventStandings, fetchClosedResultsSince } from "./db.js";
import { matchRoundOutcome, isBye, isDrop } from "./leaderboard.js";
import { ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { archetypeIcon } from "./archetype-icons.js";
import { escapeHtml, eventTitle, formatDate, scryfallImages, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { locale } from "./locale.js";
import { BIG_EVENT_MIN_PLAYERS } from "./card-progress.js";

const ARCHETYPE_LABELS = { aggro: "Aggro", control: "Control", combo: "Combo", tempo: "Tempo", midrange: "Midrange" };
// The two players' colours (the CSS's --pa / --pb), for the chart's tips.
const COLOR = { a: "#dc181c", b: "#2f5fdc" };
// Scontri diretti: rows shown before "Mostra tutte".
const H2H_SHOWN = 4;
// The chart: its viewBox width (stretched to the card, preserveAspectRatio
// none — the y units are px, so the HTML overlays line up), the plot's least
// top (under the head — measured, see renderChart) and its bottom band (the
// dates), two date labels' least distance (px), the tip's height.
const VW = 1000;
const PLOT_TOP_MIN = 92;
const PLOT_BOTTOM = 30;
const LABEL_GAP = 70;
const TIP_H = 66;

const pct = (v) => (v == null ? "—" : `${v.toFixed(1)}%`);
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const firstName = (name) => (name ?? "").split(" ")[0];
const winrate = (r) => (r.w + r.d + r.l ? (r.w / (r.w + r.d + r.l)) * 100 : null);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
// A deck = commander + partner (the site's convention).
const deckKey = (entry) => `${entry.commander_id ?? "?"}|${entry.partner_commander_id ?? ""}`;
const deckLabel = (entry) =>
  entry.commander ? [entry.commander.name, entry.partner_commander?.name].filter(Boolean).join(" / ") : "—";

// js/line-chart.js's monotone cubic curve (Fritsch–Carlson): smooth, never
// overshooting between two points.
function smoothPath(points) {
  const n = points.length;
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
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

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

// A player's numbers over `evs` (oldest first): the record (a bye a win, a
// drop nothing — like Giocatori), places, archetypes, decks, and the winrate
// after each event.
function playerStats(pid, evs) {
  const s = {
    events: 0, w: 0, d: 0, l: 0, firsts: 0, top8: 0, top4: 0,
    arch: Object.fromEntries(ARCHETYPES.map((a) => [a, { n: 0, w: 0, d: 0, l: 0 }])),
    archN: 0,
    decks: new Map(),
    timeline: [],
  };
  if (pid) {
    for (const e of evs) {
      const entry = e.entries.find((x) => x.player_id === pid);
      if (!entry) continue;
      s.events += 1;
      let w = 0;
      let d = 0;
      let l = 0;
      for (const m of e.matches) {
        if (isDrop(m) || (m.player1_id !== pid && m.player2_id !== pid)) continue;
        if (isBye(m)) {
          w += 1;
          continue;
        }
        const out = matchRoundOutcome(m);
        if (out === "draw") d += 1;
        else if ((out === "player1") === (m.player1_id === pid)) w += 1;
        else l += 1;
      }
      s.w += w;
      s.d += d;
      s.l += l;
      const arch = s.arch[entry.archetype];
      if (arch) {
        arch.n += 1;
        arch.w += w;
        arch.d += d;
        arch.l += l;
        s.archN += 1;
      }
      const key = deckKey(entry);
      if (!s.decks.has(key)) s.decks.set(key, { key, label: deckLabel(entry), commander: entry.commander, n: 0, w: 0, d: 0, l: 0 });
      const deck = s.decks.get(key);
      deck.n += 1;
      deck.w += w;
      deck.d += d;
      deck.l += l;
      // A top 8 only counts in an event of BIG_EVENT_MIN_PLAYERS or more, a
      // top 4 in a smaller one.
      const pos = e.pos.get(pid);
      if (pos) {
        if (pos === 1) s.firsts += 1;
        if (e.entries.length >= BIG_EVENT_MIN_PLAYERS) {
          if (pos <= 8) s.top8 += 1;
        } else if (pos <= 4) s.top4 += 1;
      }
      s.timeline.push({ e, t: new Date(e.ev.event_date).getTime(), v: winrate(s) });
    }
  }
  s.wr = winrate(s);
  s.topDecks = [...s.decks.values()].sort((x, y) => y.n - x.n || y.w - x.w);
  return s;
}

// The two players' matches against each other (newest first, byes and drops
// left out), the events they both played, and the tally.
function headToHead(a, b, evs) {
  const games = [];
  const shared = [];
  for (const e of evs) {
    const ea = e.entries.find((x) => x.player_id === a);
    const eb = e.entries.find((x) => x.player_id === b);
    if (ea && eb) shared.push({ e, pa: e.pos.get(a), pb: e.pos.get(b) });
    for (const m of e.matches) {
      if (isDrop(m) || isBye(m)) continue;
      const aFirst = m.player1_id === a && m.player2_id === b;
      if (!aFirst && !(m.player1_id === b && m.player2_id === a)) continue;
      const out = matchRoundOutcome(m);
      games.push({
        e,
        round: m.round,
        winner: out === "draw" ? null : (out === "player1") === aFirst ? "a" : "b",
        ga: aFirst ? m.player1_wins : m.player2_wins,
        gb: aFirst ? m.player2_wins : m.player1_wins,
        deckA: ea ? deckLabel(ea) : "—",
        deckB: eb ? deckLabel(eb) : "—",
        artA: ea?.commander?.name ?? "",
        artB: eb?.commander?.name ?? "",
      });
    }
  }
  const tally = { a: 0, b: 0, d: 0 };
  for (const g of games) tally[g.winner ?? "d"] += 1;
  return { games: games.reverse(), shared, tally };
}

// In-app page (js/router.js): mounted on this page's <main> (data-page), on
// first load and after each in-app navigation; `signal` aborts on leaving.
export async function mount({ signal = new AbortController().signal } = {}) {
  const $ = (id) => document.getElementById(id);
  const grid = $("compare-grid");
  const plot = $("compare-plot");
  // The picker on <body>: a fixed popover / bottom sheet, out of any
  // stacking context of the page's; taken away again on leaving.
  const picker = $("compare-picker");
  const backdrop = $("compare-picker-backdrop");
  document.body.append(backdrop, picker);
  signal.addEventListener("abort", () => {
    picker.remove();
    backdrop.remove();
    document.documentElement.classList.remove("cmp-picker-open");
  }, { once: true });


  // Everything in one round.
  let players, allEvents, results, standings;
  try {
    [players, allEvents, results, standings] = await Promise.all([
      Players.list(),
      Events.list(),
      fetchClosedResultsSince(null, { commanders: true }),
      EventStandings.listAll(),
    ]);
    if (signal.aborted) return;
  } catch (err) {
    showError(grid, err);
    hidePageLoading(signal);
    return;
  }

  const playersById = new Map(players.map((p) => [p.id, p]));
  const nameOf = (pid) => (pid ? playersById.get(pid)?.name ?? "?" : null);
  const posByEvent = new Map();
  for (const r of standings) {
    if (!posByEvent.has(r.event_id)) posByEvent.set(r.event_id, new Map());
    posByEvent.get(r.event_id).set(r.player_id, r.position);
  }
  // Closed events, oldest first, with their rows.
  const allEvs = allEvents
    .filter((ev) => !ev.is_open)
    .sort((x, y) => x.event_date.localeCompare(y.event_date))
    .map((ev) => ({
      ev,
      entries: results.entriesByEvent.get(ev.id) ?? [],
      matches: results.matchesByEvent.get(ev.id) ?? [],
      pos: posByEvent.get(ev.id) ?? new Map(),
    }));
  // Over the whole history: how often each pair met (the picker's "most
  // faced"), each player's events (the picker's list: players with one).
  const pairCounts = new Map();
  const eventsByPlayer = new Map();
  for (const e of allEvs) {
    for (const en of e.entries) eventsByPlayer.set(en.player_id, (eventsByPlayer.get(en.player_id) ?? 0) + 1);
    for (const m of e.matches) {
      if (isDrop(m) || isBye(m)) continue;
      for (const [p, q] of [[m.player1_id, m.player2_id], [m.player2_id, m.player1_id]]) {
        if (!pairCounts.has(p)) pairCounts.set(p, new Map());
        pairCounts.get(p).set(q, (pairCounts.get(p).get(q) ?? 0) + 1);
      }
    }
  }
  const rivalsOf = (pid) => [...(pairCounts.get(pid) ?? new Map()).entries()].sort((x, y) => y[1] - x[1]);

  const state = { a: null, b: null, view: "winrate", h2hAll: false, openArch: null };
  {
    const params = new URLSearchParams(location.search);
    for (const side of ["a", "b"]) if (playersById.has(params.get(side))) state[side] = params.get(side);
    if (state.a === state.b) state.b = null;
  }

  let chartData = null;

  // --- Commander art (Scryfall art crops): every name not asked yet, in
  // one request (several at once get rate-limited), kept for the visit.
  const artCache = new Map(); // lowercase name → Promise<url | null>
  function ensureArts(names) {
    const missing = [...new Set(names.filter(Boolean))].filter((n) => !artCache.has(n.toLowerCase()));
    if (!missing.length) return;
    const request = scryfallImages(missing, "art_crop");
    for (const n of missing) artCache.set(n.toLowerCase(), request.then((m) => m.get(n.toLowerCase()) ?? null));
  }
  function paintArts(root) {
    const els = [...root.querySelectorAll("[data-art]")].filter((el) => el.dataset.art);
    ensureArts(els.map((el) => el.dataset.art));
    for (const el of els) {
      artCache.get(el.dataset.art.toLowerCase()).then((url) => {
        if (url && !signal.aborted) el.style.backgroundImage = `url("${url}")`;
      });
    }
  }
  async function paintHeroArt(side, name) {
    const el = $(`compare-art-${side}`);
    const key = name?.toLowerCase() ?? "";
    if (el.dataset.name === key) return;
    el.dataset.name = key;
    el.classList.remove("is-loaded");
    if (!key) return;
    ensureArts([name]);
    const url = await artCache.get(key);
    if (!url || el.dataset.name !== key || signal.aborted) return;
    const img = new Image();
    img.onload = () => {
      if (el.dataset.name !== key) return;
      el.style.backgroundImage = `url("${url}")`;
      el.classList.add("is-loaded");
    };
    img.src = url;
  }

  // --- The hero ----------------------------------------------------------

  // A name on one line: shrunk until it fits (down to 60%), then cut.
  function fitName(btn) {
    btn.style.fontSize = "";
    const max = parseFloat(getComputedStyle(btn).fontSize);
    let size = max;
    while (btn.scrollWidth > btn.clientWidth + 1 && size > max * 0.6) {
      size -= 1;
      btn.style.fontSize = `${size}px`;
    }
  }
  const fitNames = () => document.querySelectorAll(".cmp-pick").forEach(fitName);

  function renderHero(sa, sb, h2h) {
    // Wins only (no draws); a pair that only drew still met. No pair yet:
    // no score at all.
    const { a, b, d } = h2h.tally;
    const met = a + b + d > 0;
    const pair = Boolean(state.a && state.b);
    for (const [side, s] of [["a", sa], ["b", sb]]) {
      const pid = state[side];
      const btn = document.querySelector(`.cmp-pick[data-side="${side}"]`);
      btn.classList.toggle("is-empty", !pid);
      btn.innerHTML = `<span class="cmp-pick-name">${pid ? escapeHtml(nameOf(pid)) : "Scegli un giocatore"}</span>`;
      const mine = side === "a" ? a : b;
      const theirs = side === "a" ? b : a;
      const score = document.querySelector(`[data-score="${side}"]`);
      score.textContent = pair ? (met ? mine : "–") : "";
      score.classList.toggle("is-behind", !met || mine < theirs);
      paintHeroArt(side, s.topDecks[0]?.commander?.name);
    }
    requestAnimationFrame(fitNames);
    $("compare-score").innerHTML = !pair
      ? ""
      : met
        ? `<span class="${a >= b ? "" : "is-behind"}">${a}</span><span class="sep">–</span><span class="${b >= a ? "" : "is-behind"}">${b}</span>`
        : '<span class="is-behind">–</span>';
    $("compare-score-note").textContent = pair && !met ? "Mai affrontati" : "";
    $("compare-score-note").hidden = !pair || met;
  }

  // --- Statistiche: a tug-of-war bar per number — A's share from the left,
  // B's from the right, a notch at the middle, the side ahead in full colour.
  function renderStats(sa, sb) {
    const rows = [
      { label: "Winrate", a: sa.wr, b: sb.wr, fmt: pct, main: true },
      { label: "Eventi", a: sa.events, b: sb.events },
      { label: "Primi posti", a: sa.firsts, b: sb.firsts },
      { label: `Top 8 · ${BIG_EVENT_MIN_PLAYERS}+ giocatori`, a: sa.top8, b: sb.top8 },
      { label: `Top 4 · meno di ${BIG_EVENT_MIN_PLAYERS} giocatori`, a: sa.top4, b: sb.top4 },
      { label: "Comandanti", a: sa.decks.size, b: sb.decks.size },
    ];
    $("compare-stats").innerHTML = rows
      .map((r) => {
        const fmt = r.fmt ?? ((v) => (v == null ? "—" : String(v)));
        let lead = null;
        if (r.a != null && r.b != null && r.a !== r.b) lead = r.a > r.b ? "a" : "b";
        const va = r.a ?? 0;
        const vb = r.b ?? 0;
        let share = 50;
        if (va + vb) share = (va / (va + vb)) * 100;
        const is = (side) => (lead === side ? " is-lead" : "");
        return `
          <div class="cmp-stat${r.main ? " is-main" : ""}${lead ? "" : " is-even"}">
            <span class="cmp-stat-val is-a${is("a")}">${fmt(r.a)}</span>
            <div class="cmp-stat-mid">
              <span class="cmp-stat-label">${r.label}</span>
              <div class="cmp-stat-bar"><i class="is-a${is("a")}" data-w="${share.toFixed(1)}"></i><i class="is-b${is("b")}"></i></div>
            </div>
            <span class="cmp-stat-val is-b${is("b")}">${fmt(r.b)}</span>
          </div>`;
      })
      .join("");
    // Grown from the middle once drawn.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        $("compare-stats").querySelectorAll("[data-w]").forEach((el) => el.style.setProperty("--w", `${el.dataset.w}%`))
      )
    );
  }

  // --- Scontri diretti: a scoreboard row per match — the event and round
  // on top, then the date beside the two lines (art, deck, games won), the
  // winner's in its colour.
  function renderH2H(h2h) {
    const { games, shared } = h2h;
    const list = $("compare-h2h");
    const ga = games.reduce((s, g) => s + g.ga, 0);
    const gb = games.reduce((s, g) => s + g.gb, 0);
    $("compare-h2h-stats").innerHTML = games.length
      ? `<div class="line-chart-stat"><span class="line-chart-stat-value is-n"><span class="is-a">${ga}</span><span class="sep"> – </span><span class="is-b">${gb}</span></span><span class="line-chart-stat-label">Game</span></div>
         <div class="line-chart-stat"><span class="line-chart-stat-value is-n">${games.length}</span><span class="line-chart-stat-label">${games.length === 1 ? "Partita" : "Partite"}</span></div>`
      : "";
    if (!state.a || !state.b) {
      list.innerHTML = '<p class="page-empty">Scegli due giocatori.</p>';
      return;
    }
    if (!games.length) {
      list.innerHTML = `<p class="page-empty">Non si sono ancora affrontati.</p>${
        shared.length
          ? `<p class="cmp-shared"><span>Eventi giocati insieme:</span> <b>${shared.length}</b></p>`
          : '<p class="cmp-shared">Nessun evento giocato insieme.</p>'
      }`;
      return;
    }
    const line = (side, g) =>
      `<span class="cmp-match-line is-${side}${g.winner === side ? " is-win" : ""}"><span class="cmp-match-art" data-art="${escapeHtml(
        side === "a" ? g.artA : g.artB
      )}"></span><span class="cmp-match-deck">${escapeHtml(side === "a" ? g.deckA : g.deckB)}</span><span class="cmp-match-games">${side === "a" ? g.ga : g.gb}</span></span>`;
    const shown = state.h2hAll ? games : games.slice(0, H2H_SHOWN);
    list.innerHTML = `
      <div class="cmp-matches">${shown
        .map((g) => {
          const date = new Date(g.e.ev.event_date);
          return `
            <a class="cmp-match${g.winner ? "" : " is-draw"}" href="event.html?id=${g.e.ev.id}">
              <span class="cmp-match-kicker"><span>${escapeHtml(eventTitle(g.e.ev))}</span> · <span>Turno ${g.round}</span></span>
              <span class="cmp-match-date"><b>${date.getDate()}</b><span>${date.toLocaleDateString(locale(), { month: "short" }).replace(".", "")}</span></span>
              <span class="cmp-match-lines">${line("a", g)}${line("b", g)}</span>
            </a>`;
        })
        .join("")}</div>
      ${
        games.length > H2H_SHOWN
          ? `<button type="button" class="cmp-more" id="compare-h2h-more">${state.h2hAll ? "Mostra meno" : `Mostra tutte (${games.length})`}</button>`
          : ""
      }`;
    $("compare-h2h-more")?.addEventListener("click", () => {
      state.h2hAll = !state.h2hAll;
      renderH2H(h2h);
      paintArts(list);
    });
  }

  // --- Andamento: commander.html's edge-to-edge chart — smooth lines, each
  // with its area down to the card's bottom edge (the dates inside it), the
  // values on the left (no gridlines), the dates in the bottom band, a
  // guide, the two values and a dark tip on hover / tap (no dots).
  function renderChart() {
    const { sa, sb, h2h } = chartData;
    const W = plot.clientWidth;
    const H = plot.clientHeight;
    const zero = H - PLOT_BOTTOM;
    // The lines start under the head (the title, the selector).
    const head = plot.parentElement.querySelector(".line-chart-head");
    const PLOT_TOP = Math.max(PLOT_TOP_MIN, (head?.offsetHeight ?? 0) + 14);
    const nA = escapeHtml(nameOf(state.a) ?? "");
    const nB = escapeHtml(nameOf(state.b) ?? "");
    const xPct = (x) => `${((x / VW) * 100).toFixed(3)}%`;
    const tipRow = (side, name, value) => `<div><i style="background:${COLOR[side]}"></i>${name}<span>${value}</span></div>`;

    let lines; // [{ side, pts: [[x, y]] }]
    let gridLines; // [{ y, label, zero }]
    let keys; // hover strips: [{ x, dots: [[y, side]], tip, label }]
    let area = false;

    if (state.view === "winrate") {
      const pa = sa.timeline.filter((p) => p.v != null);
      const pb = sb.timeline.filter((p) => p.v != null);
      const all = [...pa, ...pb];
      if (!all.length) {
        plot.innerHTML = '<p class="page-empty cmp-plot-empty">Nessun evento nel periodo.</p>';
        return;
      }
      const times = [...new Set(all.map((p) => p.t))].sort((x, y) => x - y);
      const t0 = times[0];
      const t1 = times.at(-1);
      const X = (t) => (times.length === 1 ? VW / 2 : ((t - t0) / (t1 - t0)) * VW);
      const values = all.map((p) => p.v);
      const lo = Math.max(0, Math.floor((Math.min(...values) - 8) / 20) * 20);
      const hi = Math.min(100, Math.ceil((Math.max(...values) + 4) / 20) * 20);
      const Y = (v) => zero - ((v - lo) / (hi - lo || 1)) * (zero - PLOT_TOP);
      gridLines = [];
      for (let v = lo; v <= hi; v += 20) gridLines.push({ y: Y(v), label: v > lo ? `${v}%` : "", zero: v === lo });
      lines = [
        { side: "a", pts: pa.map((p) => [X(p.t), Y(p.v)]) },
        { side: "b", pts: pb.map((p) => [X(p.t), Y(p.v)]) },
      ];
      area = true;
      // At each date, each player's latest value.
      const at = (list, t) => {
        let last = null;
        for (const p of list) if (p.t <= t) last = p;
        return last;
      };
      keys = times.map((t) => {
        const ha = at(pa, t);
        const hb = at(pb, t);
        const ev = (ha?.t === t ? ha : hb?.t === t ? hb : null)?.e.ev;
        return {
          x: X(t),
          dots: [ha && [Y(ha.v), "a"], hb && [Y(hb.v), "b"]].filter(Boolean),
          tip: `<strong>${escapeHtml(ev ? eventTitle(ev) : formatDate(new Date(t).toISOString().slice(0, 10)))}</strong>${tipRow("a", nA, ha ? pct(ha.v) : "—")}${tipRow("b", nB, hb ? pct(hb.v) : "—")}`,
          label: ev ? shortDate(ev.event_date) : "",
        };
      });
    } else {
      const shared = h2h.shared.filter((s) => s.pa && s.pb);
      if (!shared.length) {
        plot.innerHTML = '<p class="page-empty cmp-plot-empty">Nessun evento giocato insieme nel periodo.</p>';
        return;
      }
      const lowest = Math.max(...shared.flatMap((s) => [s.pa, s.pb]));
      const bottomRank = Math.max(8, Math.ceil(lowest / 4) * 4);
      const Y = (p) => PLOT_TOP + ((p - 1) / (bottomRank - 1)) * (zero - PLOT_TOP - 8);
      const n = shared.length;
      const X = (i) => (n === 1 ? VW / 2 : (i / (n - 1)) * VW);
      const step = Math.max(4, Math.ceil(bottomRank / 16) * 4);
      gridLines = [{ y: Y(1), label: "1°" }];
      for (let v = step; v <= bottomRank; v += step) gridLines.push({ y: Y(v), label: `${v}°` });
      gridLines.push({ y: zero, label: "", zero: true });
      lines = [
        { side: "a", pts: shared.map((s, i) => [X(i), Y(s.pa)]) },
        { side: "b", pts: shared.map((s, i) => [X(i), Y(s.pb)]) },
      ];
      area = true;
      keys = shared.map((s, i) => ({
        x: X(i),
        dots: [[Y(s.pa), "a"], [Y(s.pb), "b"]],
        tip: `<strong>${escapeHtml(eventTitle(s.e.ev))}</strong>${tipRow("a", nA, `${s.pa}°`)}${tipRow("b", nB, `${s.pb}°`)}`,
        label: shortDate(s.e.ev.event_date),
      }));
    }

    // The dates: the last always, the others at least LABEL_GAP px apart.
    const keep = new Set([keys.length - 1]);
    let prev = -Infinity;
    keys.forEach((k, i) => {
      const px = (k.x / VW) * W;
      if (i < keys.length - 1 && px - prev >= LABEL_GAP && W - px >= LABEL_GAP) {
        keep.add(i);
        prev = px;
      }
    });
    const xLabels = keys
      .map((k, i) =>
        keep.has(i) && k.label
          ? `<span class="line-chart-x${i === 0 ? " is-start" : i === keys.length - 1 ? " is-end" : ""}" style="left:${xPct(k.x)}">${escapeHtml(k.label)}</span>`
          : ""
      )
      .join("");
    // No dotted gridlines (user): the baseline only, the values on the left.
    const gridSvg = gridLines
      .filter((g) => g.zero)
      .map((g) => `<line class="line-chart-grid is-zero" x1="0" x2="${VW}" y1="${g.y}" y2="${g.y}" vector-effect="non-scaling-stroke"></line>`)
      .join("");
    const yLabels = gridLines
      .filter((g) => g.label)
      .map((g) => `<span class="line-chart-y" style="top:${g.y}px">${g.label}</span>`)
      .join("");
    const paths = lines
      .filter((l) => l.pts.length)
      .map((l) => {
        const d = smoothPath(l.pts);
        const fill =
          area && l.pts.length > 1
            ? `<path class="line-chart-area is-${l.side}" d="${d} L${l.pts.at(-1)[0]},${H} L${l.pts[0][0]},${H} Z"></path>`
            : "";
        return `${fill}<path class="line-chart-line is-${l.side}" d="${d}" vector-effect="non-scaling-stroke"></path>`;
      })
      .join("");
    // Each point's strip: from halfway to the one before to halfway to the
    // next — its guide, the two values on the lines, the tip beside the
    // guide (on its left in the chart's right half), level with the values
    // but always under the head (the title, the selector).
    const hits = keys
      .map((k, i) => {
        const left = i === 0 ? 0 : (keys[i - 1].x + k.x) / 2;
        const right = i === keys.length - 1 ? VW : (k.x + keys[i + 1].x) / 2;
        const w = right - left || VW;
        const inner = `${(((k.x - left) / w) * 100).toFixed(3)}%`;
        const dots = k.dots.map(([y, side]) => `<span class="line-chart-dot-html is-${side}" style="left:${inner};top:${y}px"></span>`).join("");
        const ys = k.dots.map(([y]) => y);
        const tipTop = Math.round(Math.min(zero - TIP_H - 6, Math.max(PLOT_TOP - 6, (Math.min(...ys) + Math.max(...ys)) / 2 - TIP_H / 2)));
        return `<span class="line-chart-hit" style="left:${xPct(left)};width:${xPct(w)}"><span class="line-chart-guide" style="left:${inner}"></span>${dots}<span class="cmp-tip${
          k.x > VW / 2 ? " is-left" : ""
        }" style="left:${inner};top:${tipTop}px">${k.tip}</span></span>`;
      })
      .join("");
    plot.innerHTML = `<svg viewBox="0 0 ${VW} ${H}" preserveAspectRatio="none" aria-hidden="true">${gridSvg}${paths}</svg>${yLabels}${xLabels}${hits}`;
  }

  // --- Archetipi: a strip per player — its events split by archetype, in
  // the archetypes' colours (icon and share inside a piece wide enough),
  // the legend under them. A piece or a legend chip picks an archetype: it
  // stays lit in both strips (the rest dimmed) and a line under them gives
  // each player's events and winrate with it.
  function renderArchetypes(sa, sb) {
    const share = (s, a) => (s.archN ? (s.arch[a].n / s.archN) * 100 : 0);
    const strip = (side, s) => {
      const pieces = ARCHETYPES.filter((a) => s.arch[a].n)
        .map((a) => {
          const v = share(s, a);
          const label = v >= 14 ? `${archetypeIcon(a)}<span>${Math.round(v)}%</span>` : v >= 6 ? archetypeIcon(a) : "";
          return `<button type="button" class="cmp-dna-piece is-${a}" data-arch="${a}" data-s="${v.toFixed(2)}" style="background:${ARCHETYPE_COLORS[a]}" aria-label="${ARCHETYPE_LABELS[a]} ${Math.round(v)}%">${label}</button>`;
        })
        .join("");
      return `<div class="cmp-dna-row is-${side}"><span class="cmp-dna-name">${escapeHtml(nameOf(state[side]) ?? "")}</span><div class="cmp-dna-bar">${
        pieces || '<span class="cmp-dna-none">—</span>'
      }</div></div>`;
    };
    const legend = ARCHETYPES.map(
      (a) =>
        `<button type="button" class="cmp-dna-chip${sa.arch[a].n + sb.arch[a].n ? "" : " is-unused"}" data-arch="${a}"><i class="is-${a}" style="background:${ARCHETYPE_COLORS[a]}">${archetypeIcon(a)}</i>${ARCHETYPE_LABELS[a]}</button>`
    ).join("");
    $("compare-archetypes").innerHTML = `
      <div class="cmp-dna">${strip("a", sa)}${strip("b", sb)}</div>
      <div class="cmp-dna-legend">${legend}</div>
      <div class="cmp-dna-detail" id="compare-arch-detail"></div>`;
    archetypeData = { sa, sb };
    pickArchetype(state.openArch);
    // Grown in once drawn.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        $("compare-archetypes").querySelectorAll("[data-s]").forEach((el) => el.style.setProperty("--s", el.dataset.s))
      )
    );
  }

  let archetypeData = null;
  function pickArchetype(a) {
    state.openArch = a;
    const box = $("compare-archetypes");
    box.classList.toggle("has-pick", Boolean(a));
    box.querySelectorAll("[data-arch]").forEach((el) => el.classList.toggle("is-picked", el.dataset.arch === a));
    const detail = $("compare-arch-detail");
    if (!a || !archetypeData) {
      detail.classList.remove("is-open");
      return;
    }
    // A row per player (the archetype already lit above: not repeated), in
    // columns — name, events, winrate — so the two line up.
    const line = (side, s) => {
      const r = s.arch[a];
      const wr = winrate(r);
      return `<span class="cmp-dna-line is-${side}"><b>${escapeHtml(firstName(nameOf(state[side])))}</b><span>${plural(r.n, "evento", "eventi")}</span><span>${
        r.n ? `<b>${wr == null ? "—" : `${wr.toFixed(0)}%`}</b> <span>winrate</span>` : "—"
      }</span></span>`;
    };
    detail.innerHTML = line("a", archetypeData.sa) + line("b", archetypeData.sb);
    detail.classList.add("is-open");
  }

  // --- Comandanti: each one's 3 most played decks as art tiles (the first
  // bigger), the winrate pill in the player's colour, "in comune" on a deck
  // both played.
  function renderDecks(sa, sb) {
    const column = (side, s, other) => {
      const top = s.topDecks.slice(0, 3);
      const tiles = top.length
        ? top
            .map((d, i) => {
              const wr = winrate(d);
              return `<a class="cmp-deck${i === 0 ? " is-top" : ""}" href="commander.html?id=${d.commander?.id ?? ""}" data-art="${escapeHtml(d.commander?.name ?? "")}">
                ${other.decks.has(d.key) ? '<span class="cmp-deck-shared">in comune</span>' : ""}
                <span class="cmp-deck-text"><span class="cmp-deck-name">${escapeHtml(d.label)}</span><span class="cmp-deck-meta"><span>${plural(d.n, "evento", "eventi")}</span> · ${d.w}-${d.d}-${d.l}</span></span>
                <span class="cmp-deck-pill">${wr == null ? "—" : `${wr.toFixed(0)}%`}</span>
              </a>`;
            })
            .join("")
        : '<p class="page-empty">—</p>';
      return `<div class="cmp-decks-col is-${side}"><div class="cmp-decks-head">${escapeHtml(nameOf(state[side]) ?? "")}</div>${tiles}</div>`;
    };
    $("compare-decks").innerHTML = `<div class="cmp-decks">${column("a", sa, sb)}${column("b", sb, sa)}</div>`;
  }

  // --- Everything, for the pair ------------------------------------------

  function render() {
    const evs = allEvs;
    const sa = playerStats(state.a, evs);
    const sb = playerStats(state.b, evs);
    const h2h = state.a && state.b ? headToHead(state.a, state.b, evs) : { games: [], shared: [], tally: { a: 0, b: 0, d: 0 } };
    // Without two players: the line inviting to pick, no cards.
    const pair = Boolean(state.a && state.b);
    grid.hidden = !pair;
    $("compare-empty").hidden = pair;
    if (!pair) {
      chartData = null;
      renderHero(sa, sb, h2h);
      return;
    }
    renderStats(sa, sb);
    renderH2H(h2h);
    chartData = { sa, sb, h2h };
    renderChart();
    renderArchetypes(sa, sb);
    renderDecks(sa, sb);
    // All the art in one request, the hero's included.
    ensureArts([
      sa.topDecks[0]?.commander?.name,
      sb.topDecks[0]?.commander?.name,
      ...[...grid.querySelectorAll("[data-art]")].map((el) => el.dataset.art),
    ]);
    paintArts(grid);
    renderHero(sa, sb, h2h);
    rememberPair();
  }

  function rememberPair() {
    const url = new URL(location.href);
    for (const side of ["a", "b"]) {
      if (state[side]) url.searchParams.set(side, state[side]);
      else url.searchParams.delete(side);
    }
    history.replaceState(history.state, "", url);
  }

  // --- The picker --------------------------------------------------------

  let pickerSide = null;
  const input = $("compare-picker-input");
  const pickerList = $("compare-picker-list");
  const isTouch = () => document.documentElement.classList.contains("nav-mobile");

  function fillPicker(query) {
    const other = state[pickerSide === "a" ? "b" : "a"];
    const current = state[pickerSide];
    const q = fold(query.trim());
    const item = (p, count) =>
      `<button type="button" class="cmp-picker-item${p.id === current ? " is-current" : ""}" data-id="${p.id}"><span>${escapeHtml(p.name)}</span><span class="cmp-picker-count">${count}</span></button>`;
    let html = "";
    if (!q && other) {
      const rivals = rivalsOf(other).filter(([id]) => playersById.has(id)).slice(0, 5);
      if (rivals.length) {
        html += `<div class="cmp-picker-group">Affrontati più spesso da ${escapeHtml(nameOf(other))}</div>`;
        html += rivals.map(([id, n]) => item(playersById.get(id), plural(n, "partita", "partite"))).join("");
      }
    }
    const everyone = players
      .filter((p) => p.id !== other && (eventsByPlayer.get(p.id) ?? 0) > 0 && (!q || fold(p.name).includes(q)))
      .sort((x, y) => x.name.localeCompare(y.name, locale()));
    if (!q) html += '<div class="cmp-picker-group">Tutti i giocatori</div>';
    html += everyone.map((p) => item(p, plural(eventsByPlayer.get(p.id), "evento", "eventi"))).join("");
    if (!everyone.length) html += '<p class="page-empty">Nessun giocatore trovato.</p>';
    pickerList.innerHTML = html;
    pickerList.querySelector("button.cmp-picker-item")?.classList.toggle("is-focus", Boolean(q));
  }

  function openPicker(side, btn) {
    pickerSide = side;
    input.value = "";
    fillPicker("");
    picker.hidden = false;
    backdrop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    // Touch screens: full screen (styles.css), the page behind it still.
    document.documentElement.classList.toggle("cmp-picker-open", isTouch());
    if (!isTouch()) {
      const r = btn.getBoundingClientRect();
      const w = picker.offsetWidth;
      const left = side === "a" ? r.left : r.right - w;
      picker.style.left = `${Math.max(12, Math.min(left, innerWidth - w - 12))}px`;
      picker.style.top = `${r.bottom + 8}px`;
    }
    input.focus();
  }

  function closePicker() {
    if (pickerSide === null) return;
    picker.hidden = true;
    backdrop.hidden = true;
    document.documentElement.classList.remove("cmp-picker-open");
    input.blur();
    document.querySelectorAll(".cmp-pick").forEach((b) => b.setAttribute("aria-expanded", "false"));
    pickerSide = null;
  }

  document.querySelectorAll(".cmp-pick").forEach((btn) =>
    btn.addEventListener("click", () => (pickerSide === btn.dataset.side ? closePicker() : openPicker(btn.dataset.side, btn)))
  );
  backdrop.addEventListener("click", closePicker);
  input.addEventListener("input", () => {
    fillPicker(input.value);
    // The matches from the top, right under the field.
    pickerList.scrollTop = 0;
  });
  $("compare-picker-close").addEventListener("click", closePicker);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") pickerList.querySelector("button.cmp-picker-item")?.click();
  });
  pickerList.addEventListener("click", (e) => {
    const it = e.target.closest("button.cmp-picker-item");
    if (!it) return;
    const other = pickerSide === "a" ? "b" : "a";
    // The other player picked: the two swap.
    if (state[other] === it.dataset.id) state[other] = state[pickerSide];
    state[pickerSide] = it.dataset.id;
    state.h2hAll = false;
    closePicker();
    render();
    rememberPair();
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && closePicker(), { signal });
  // A computer's popover hangs under its name: closed on scrolling.
  window.addEventListener("scroll", () => !isTouch() && closePicker(), { passive: true, signal });
  document.addEventListener("app:navigate", closePicker, { signal });

  // --- The cards' own controls -------------------------------------------

  document.querySelector(".cmp-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn || btn.dataset.view === state.view) return;
    state.view = btn.dataset.view;
    document.querySelectorAll(".cmp-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    renderChart();
  });
  $("compare-archetypes").addEventListener("click", (e) => {
    const el = e.target.closest("[data-arch]");
    if (el) pickArchetype(state.openArch === el.dataset.arch ? null : el.dataset.arch);
  });

  // Redrawn when the width changes: the chart (its date labels), the names'
  // fit.
  let chartWidth = 0;
  const resize = new ResizeObserver(() => {
    fitNames();
    if (chartData && Math.abs(plot.clientWidth - chartWidth) > 20) {
      chartWidth = plot.clientWidth;
      renderChart();
    }
  });
  resize.observe(grid);
  signal.addEventListener("abort", () => resize.disconnect(), { once: true });

  render();
  hidePageLoading(signal);
}
