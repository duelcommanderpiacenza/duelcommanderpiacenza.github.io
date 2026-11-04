// compare.html — "Confronto", Giocatori's second tab: two players side by
// side, over the events in Giocatori's filters (Lega / Evento / Dal, shared
// with it — js/meta-filters.js PLAYERS_FILTERS_KEY; since 2026-11-04, user:
// it had none, the whole history; the default the last 2 years, like
// Giocatori's). Chosen 2026-11-01
// from three rounds of mockups. Everything is computed here from every
// closed event's entries + matches (fetchClosedResultsSince, one paged
// request each, no event ids needed first) and the event_standings cache
// (positions):
//  - the hero: a light card, the two names at its sides (each a button
//    opening the picker, a bar in its player's colour under it — A red on
//    the left, B blue on the right), their most played commanders' art
//    faint behind them, and the matches won against each other between them
//    (draws not shown) as giant numerals filled with that art; one height
//    with or without a pair;
//  - Statistiche: winrate (featured), Eventi, Primi posti, Top 8 (events of
//    20+ players, like the player card's Podio) and Top 4 (smaller events),
//    Comandanti — a tug-of-war bar each;
//  - Scontri diretti: their matches, newest first, as strips of the two
//    decks' art (the loser's greyed), the games won in the middle;
//  - Andamento: commander.html's edge-to-edge chart (js/line-chart.js's
//    look), two lines — the overall winrate after each event, or the places
//    in the events played together;
//  - Archetipi: a ring per player split by archetype, the legend under
//    them, a pick lighting one and giving its winrate and events inside.
// Every commander's art is asked once per visit (one Scryfall request for
// all the names not asked yet) and drawn from the same URL wherever it
// shows — the hero, the numerals, the matches — so the browser downloads
// each picture once (user, 2026-11-03).
// The pair is in the address (?a=&b=, kept up to date, so a comparison can
// be shared); without one, no player is chosen: a line invites to pick two
// (user: no default pair).
// The section's Dove bar (js/where-filter.js — Dal vivo / Online / Tutto)
// picks the events counted, the picker's lists too; online events' places
// computed here (event_standings caches the live ones only).

import { Players, Events, Leagues, EventStandings, fetchClosedResultsSince } from "./db.js";
import { matchRoundOutcome, isBye, isDrop, computeEventLeaderboard } from "./leaderboard.js";
import { ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { archetypeIcon } from "./archetype-icons.js";
import { escapeHtml, eventTitle, formatDate, scryfallImages, showError, isoDateYearsAgo, DEFAULT_DATE_FROM_YEARS } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { locale } from "./locale.js";
import { BIG_EVENT_MIN_PLAYERS } from "./card-progress.js";
import { initWhereFilter, inWhere } from "./where-filter.js";
import { initFilterToggle } from "./filter-toggle.js";
import { initScopeFilter } from "./scope-filter.js";
import { savedMetaFilters, rememberMetaFilters, PLAYERS_FILTERS_KEY } from "./meta-filters.js";

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
// Its short form (each name up to its comma: "Yoshimaru / Breeches"), for
// a line too narrow for the whole one.
const deckShort = (entry) =>
  entry.commander ? [entry.commander.name, entry.partner_commander?.name].filter(Boolean).map((n) => n.split(",")[0]).join(" / ") : "—";

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
        shortA: ea ? deckShort(ea) : "—",
        shortB: eb ? deckShort(eb) : "—",
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


  // Dal vivo / Online / Tutto: the events counted.
  const where = initWhereFilter({ signal });
  // …and Lega / Evento / Dal, shared with Giocatori: as last set on either
  // tab, else the last DEFAULT_DATE_FROM_YEARS years. Set before anything
  // loads, so the funnel shows them from the start.
  const leagueSelect = $("compare-league-filter");
  const eventSelect = $("compare-event-filter");
  const dateFromInput = $("compare-date-from");
  const savedFilters = savedMetaFilters(PLAYERS_FILTERS_KEY);
  dateFromInput.value = savedFilters ? savedFilters.dateFrom : isoDateYearsAgo(DEFAULT_DATE_FROM_YEARS);
  rememberMetaFilters({ leagueSelect, eventSelect, dateFromInput }, PLAYERS_FILTERS_KEY);
  initFilterToggle("compare-filter-toggle", "compare-filter-panel");

  // Everything in one round — online events too, whatever the choice.
  let players, allEvents, allLeagues, results, standings;
  try {
    [players, allEvents, allLeagues, results, standings] = await Promise.all([
      Players.list(),
      Events.list({ withOnline: true }),
      Leagues.list({ withOnline: true }),
      fetchClosedResultsSince(null, { commanders: true, withOnline: true }),
      EventStandings.listAll(),
    ]);
    if (signal.aborted) return;
  } catch (err) {
    showError(grid, err);
    hidePageLoading(signal);
    return;
  }

  // The Dove bar only when there are both live and online events.
  where.setEvents(allEvents);
  const playersById = new Map(players.map((p) => [p.id, p]));
  const nameOf = (pid) => (pid ? playersById.get(pid)?.name ?? "?" : null);
  const posByEvent = new Map();
  for (const r of standings) {
    if (!posByEvent.has(r.event_id)) posByEvent.set(r.event_id, new Map());
    posByEvent.get(r.event_id).set(r.player_id, r.position);
  }
  // An event's places: the cache's, else (an online event) computed as
  // event.html does — the slim rows given the player objects it keys on.
  function placesOf(ev, entries, matches) {
    if (posByEvent.has(ev.id) || !ev.is_online) return posByEvent.get(ev.id) ?? new Map();
    const withPlayer = (id) => (id ? { id } : null);
    const board = computeEventLeaderboard(
      matches.map((m) => ({ ...m, player1: withPlayer(m.player1_id), player2: withPlayer(m.player2_id) })),
      entries.map((en) => ({ ...en, player: withPlayer(en.player_id) }))
    );
    return new Map(board.filter((r) => r.player?.id).map((r, i) => [r.player.id, i + 1]));
  }
  // Closed events, oldest first, with their rows.
  const closedEvs = allEvents
    .filter((ev) => !ev.is_open)
    .sort((x, y) => x.event_date.localeCompare(y.event_date))
    .map((ev) => {
      const entries = results.entriesByEvent.get(ev.id) ?? [];
      const matches = results.matchesByEvent.get(ev.id) ?? [];
      return { ev, entries, matches, pos: placesOf(ev, entries, matches) };
    });
  // The ones the Dove bar and the filters count (the league / event picked
  // — null until the scope filter reports, every one —, from "Dal" on),
  // and over them: how often each pair met (the picker's "most faced"),
  // each player's events (the picker's list: players with one). Again on a
  // change of either.
  let scopeIds = null;
  let allEvs = [];
  const pairCounts = new Map();
  const eventsByPlayer = new Map();
  function scopeEvents() {
    const from = dateFromInput.value;
    allEvs = closedEvs.filter(
      (e) => inWhere(where.value, e.ev) && (!scopeIds || scopeIds.has(e.ev.id)) && (!from || e.ev.event_date >= from)
    );
    pairCounts.clear();
    eventsByPlayer.clear();
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
  }
  scopeEvents();
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
  // The hero's art: its side's wash and its numeral both read the hero's
  // --art-a / --art-b (styles.css), set once the picture has loaded.
  async function paintHeroArt(side, name) {
    const el = $(`compare-art-${side}`);
    const hero = $("compare-hero");
    const key = name?.toLowerCase() ?? "";
    if (el.dataset.name === key) return;
    el.dataset.name = key;
    el.classList.remove("is-loaded");
    hero.style.removeProperty(`--art-${side}`);
    if (!key) return;
    ensureArts([name]);
    const url = await artCache.get(key);
    if (!url || el.dataset.name !== key || signal.aborted) return;
    const img = new Image();
    img.onload = () => {
      if (el.dataset.name !== key) return;
      hero.style.setProperty(`--art-${side}`, `url("${url}")`);
      el.classList.add("is-loaded");
    };
    img.src = url;
  }

  // --- The hero ----------------------------------------------------------

  // A deck's name kept on one line (Scontri diretti — user): shrunk until
  // it fits (down to 75%); still too long, its short form (data-short:
  // the names up to their commas), shrunk the same way; then cut with an
  // ellipsis. The whole name stays in its title.
  function fitLine(el) {
    const shrink = () => {
      el.style.fontSize = "";
      const max = parseFloat(getComputedStyle(el).fontSize);
      let size = max;
      while (el.scrollWidth > el.clientWidth + 1 && size > max * 0.75) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
      return el.scrollWidth <= el.clientWidth + 1;
    };
    el.textContent = el.title;
    if (!shrink() && el.dataset.short && el.dataset.short !== el.title) {
      el.textContent = el.dataset.short;
      shrink();
    }
  }
  const fitLines = () => grid.querySelectorAll(".cmp-match-deck").forEach(fitLine);

  // The names (up to two lines), the bar in each one's colour under them;
  // in the middle the matches won against each other — no pair yet: a
  // hollow VS; never met: "–" and "Mai affrontati" (wins only, a pair that
  // only drew still met). The card's height is fixed (styles.css): it
  // never changes between these states (user).
  function renderHero(sa, sb, h2h) {
    const { a, b, d } = h2h.tally;
    const met = a + b + d > 0;
    const pair = Boolean(state.a && state.b);
    for (const [side, s] of [["a", sa], ["b", sb]]) {
      const pid = state[side];
      const btn = document.querySelector(`.cmp-pick[data-side="${side}"]`);
      btn.classList.toggle("is-empty", !pid);
      btn.innerHTML = `<span class="cmp-pick-name">${pid ? escapeHtml(nameOf(pid)) : "Scegli un giocatore"}</span>`;
      paintHeroArt(side, s.topDecks[0]?.commander?.name);
    }
    const score = $("compare-score");
    score.classList.toggle("is-ghost", !pair);
    if (!pair) score.innerHTML = '<b aria-hidden="true">VS</b>';
    else if (met)
      score.innerHTML = `<b class="is-a${a < b ? " is-behind" : ""}">${a}</b><i>–</i><b class="is-b${b < a ? " is-behind" : ""}">${b}</b>`;
    else score.innerHTML = "<i>–</i>";
    $("compare-vs").hidden = !pair;
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

  // --- Scontri diretti: a strip per match — the two decks' art side by
  // side (a straight line between them; the loser's greyed, the winner's
  // side tinted in its colour), the event and round and the date on top,
  // each deck's name on one line at the bottom (fitLine), the games won in
  // the middle, the winner's box in its colour. Never met: one strip on
  // the two players' most played decks with the line.
  function renderH2H(h2h, sa, sb) {
    const { games, shared } = h2h;
    const list = $("compare-h2h");
    if (!state.a || !state.b) {
      list.innerHTML = '<p class="page-empty">Scegli due giocatori.</p>';
      return;
    }
    const art = (side, name) => `<span class="cmp-match-art is-${side}" data-art="${escapeHtml(name ?? "")}"></span>`;
    if (!games.length) {
      list.innerHTML = `
        <div class="cmp-matches is-empty"><div class="cmp-match">${art("a", sa.topDecks[0]?.commander?.name)}${art("b", sb.topDecks[0]?.commander?.name)}<span class="cmp-match-shade"></span>
          <span class="cmp-match-msg"><b>Non si sono ancora affrontati.</b>${
            shared.length
              ? `<span><span>Eventi giocati insieme:</span> <b>${shared.length}</b></span>`
              : "<span>Nessun evento giocato insieme.</span>"
          }</span>
        </div></div>`;
      return;
    }
    const shown = state.h2hAll ? games : games.slice(0, H2H_SHOWN);
    list.innerHTML = `
      <div class="cmp-matches">${shown
        .map((g) => {
          const deck = (side) =>
            `<span class="cmp-match-deck is-${side}" title="${escapeHtml(g[`deck${side.toUpperCase()}`])}" data-short="${escapeHtml(g[`short${side.toUpperCase()}`])}">${escapeHtml(g[`deck${side.toUpperCase()}`])}</span>`;
          return `
            <a class="cmp-match ${g.winner ? `is-win-${g.winner}` : "is-draw"}" href="event.html?id=${g.e.ev.id}">
              ${art("a", g.artA)}${art("b", g.artB)}<span class="cmp-match-shade"></span>
              <span class="cmp-match-top"><span><span>${escapeHtml(eventTitle(g.e.ev))}</span> · <span>Turno ${g.round}</span></span><span>${shortDate(g.e.ev.event_date)}</span></span>
              ${deck("a")}${deck("b")}
              <span class="cmp-match-score"><b class="is-a${g.winner === "a" ? " is-win" : ""}">${g.ga}</b><b class="is-b${g.winner === "b" ? " is-win" : ""}">${g.gb}</b></span>
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
      renderH2H(h2h, sa, sb);
      paintArts(list);
      fitLines();
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

  // --- Archetipi: a ring per player split by archetype (the archetypes'
  // colours, the player's first name inside), the legend under them — icon,
  // name, the two shares. A piece or a legend tile picks an archetype: its
  // pieces thicker, the rest faded, and inside each ring that player's
  // winrate and events with it (no icon there — user).
  const RING_R = 46;
  const RING_C = 2 * Math.PI * RING_R;
  let archetypeData = null;
  function renderArchetypes(sa, sb) {
    const share = (s, a) => (s.archN ? (s.arch[a].n / s.archN) * 100 : 0);
    const ring = (side, s) => {
      let off = 0;
      const pieces = ARCHETYPES.filter((a) => s.arch[a].n)
        .map((a) => {
          const len = (share(s, a) / 100) * RING_C;
          // (A hair of space between pieces; none round a single one.)
          const gap = s.archN > s.arch[a].n ? 2 : 0;
          const piece = `<circle class="cmp-don-seg is-${a}" data-arch="${a}" r="${RING_R}" cx="60" cy="60" stroke="${ARCHETYPE_COLORS[a]}" stroke-dasharray="${Math.max(0.1, len - gap).toFixed(2)} ${RING_C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"></circle>`;
          off += len;
          return piece;
        })
        .join("");
      return `<div class="cmp-don is-${side}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="cmp-don-track" r="${RING_R}" cx="60" cy="60"></circle>${pieces}</svg><span class="cmp-don-c" data-side="${side}"></span></div>`;
    };
    const legend = ARCHETYPES.map(
      (a) =>
        `<button type="button" class="cmp-don-leg${sa.arch[a].n + sb.arch[a].n ? "" : " is-unused"}" data-arch="${a}"><i class="is-${a}" style="background:${ARCHETYPE_COLORS[a]}">${archetypeIcon(a)}</i><span class="cmp-don-ln">${ARCHETYPE_LABELS[a]}</span><span class="cmp-don-v"><b class="is-a">${Math.round(share(sa, a))}%</b><b class="is-b">${Math.round(share(sb, a))}%</b></span></button>`
    ).join("");
    $("compare-archetypes").innerHTML = `<div class="cmp-dons">${ring("a", sa)}${ring("b", sb)}</div><div class="cmp-don-legend">${legend}</div>`;
    archetypeData = { sa, sb };
    pickArchetype(state.openArch);
  }

  function pickArchetype(a) {
    state.openArch = a;
    const box = $("compare-archetypes");
    box.classList.toggle("has-pick", Boolean(a));
    box.querySelectorAll("[data-arch]").forEach((el) => el.classList.toggle("is-picked", el.dataset.arch === a));
    if (!archetypeData) return;
    for (const side of ["a", "b"]) {
      const centre = box.querySelector(`.cmp-don-c[data-side="${side}"]`);
      centre.classList.toggle("is-pick", Boolean(a));
      if (!a) {
        centre.innerHTML = `<b>${escapeHtml(firstName(nameOf(state[side])))}</b>`;
        continue;
      }
      const r = archetypeData[side === "a" ? "sa" : "sb"].arch[a];
      const wr = r.n ? winrate(r) : null;
      centre.innerHTML = `<b>${wr == null ? "—" : `${wr.toFixed(0)}%`}</b><span>winrate</span><span>${plural(r.n, "evento", "eventi")}</span>`;
    }
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
    renderH2H(h2h, sa, sb);
    chartData = { sa, sb, h2h };
    renderChart();
    renderArchetypes(sa, sb);
    // All the art in one request, the hero's included.
    ensureArts([
      sa.topDecks[0]?.commander?.name,
      sb.topDecks[0]?.commander?.name,
      ...[...grid.querySelectorAll("[data-art]")].map((el) => el.dataset.art),
    ]);
    paintArts(grid);
    renderHero(sa, sb, h2h);
    requestAnimationFrame(fitLines);
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

  // Redrawn when the width changes: the chart (its date labels), the deck
  // names' fit.
  let chartWidth = 0;
  const resize = new ResizeObserver(() => {
    fitLines();
    if (chartData && Math.abs(plot.clientWidth - chartWidth) > 20) {
      chartWidth = plot.clientWidth;
      renderChart();
    }
  });
  resize.observe(grid);
  signal.addEventListener("abort", () => resize.disconnect(), { once: true });

  where.onChange(() => {
    scopeEvents();
    render();
  });
  dateFromInput.addEventListener("change", () => {
    scopeEvents();
    render();
  });
  initScopeFilter({
    leagueSelect,
    eventSelect,
    where,
    initial: savedFilters,
    leagues: allLeagues,
    events: allEvents,
    onChange: (eventIds) => {
      scopeIds = new Set(eventIds);
      scopeEvents();
      render();
    },
  });

  render();
  hidePageLoading(signal);
  // Measured again once the site's font is in (a first fit in the fallback
  // font can cut a name that fits).
  document.fonts?.ready.then(() => !signal.aborted && fitLines());
}
