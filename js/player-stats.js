// player.html's "Statistiche" tab (since 2026-11-25, user — chosen from a
// mockup, `_mockup-player-stats.html`): the Andamento Elo chart and the
// player's records. **Live events only**, like the Elo (whatever the Dove
// bar says). Computed from what the page already loads (its matches,
// entries and cached standings) plus two small requests of its own — the
// played events in order, the Elo ranking —; no DOM but the returned HTML.
//
// The Elo before / after each event and the best win in it are stored by
// the admin's sync in event_standings (migration 049, js/elo.js); without
// them, no chart (nor "Il balzo più grande" / "Lo scalpo più pesante"), the
// other records still.
import { escapeHtml, eventTitle, formatDate } from "./ui.js";
import { locale } from "./locale.js";
import { renderRatingChart } from "./line-chart.js";

// A run of wins / of events attended counts from this long.
const MIN_RUN = 2;

// Lucide line icons (ISC), each meaning only its record (docs/icons.md):
// footprints, a hash sign, an axe, a rocket, two arrows going round, a
// network of boxes.
const ICONS = {
  streak:
    '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
  place: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
  scalp: '<path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9"/><path d="M15 13 9 7l4-4 6 6h3a8 8 0 0 1-7 7z"/>',
  leap:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  attend: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  opponents:
    '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
};

// "nov 2026"; a span "ott 2026 → nov 2026", one month when both are in it.
const monthYear = (iso) => new Date(iso).toLocaleDateString(locale(), { month: "short", year: "numeric" });
const monthSpan = (a, b) => (monthYear(a) === monthYear(b) ? monthYear(a) : `${monthYear(a)} → ${monthYear(b)}`);
// "+12", "−8", "±0".
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");

/**
 * The tab's HTML ("" when there's nothing to show: no live event).
 * @param {Object} data
 * @param {Array} data.rows - the player's match rows (js/player-detail.js's
 *   buildRows: event, round, opponent, opponentId, isBye, isDrop, outcome).
 * @param {Array} data.entries - the player's entries, each with its `event`.
 * @param {Map} data.standings - event id → the cached standing
 *   (position, wins / draws / losses, elo_before / elo_after, best_win_elo /
 *   best_win_opponent).
 * @param {Array} data.played - every closed live event, oldest first
 *   (Events.listPlayed).
 * @param {Map} data.entryCounts - event id → its number of players.
 * @param {Array} data.ratings - every rated player's Elo (PlayerProgress.listElo).
 */
export function playerStatsHtml(data) {
  const order = new Map(data.played.map((ev, i) => [ev.id, i]));
  const live = (event) => event && !event.is_online;
  // Oldest first, as the Elo counts them; an event missing from `played`
  // (not expected) by its date, after the others.
  const rank = (event) => order.get(event?.id) ?? data.played.length;
  const eventOf = new Map(data.entries.filter((e) => live(e.event)).map((e) => [e.event_id, e.event]));
  if (!eventOf.size) return "";

  const history = [...data.standings]
    .filter(([eventId, s]) => eventOf.has(eventId) && s.elo_after != null && s.elo_before != null)
    .map(([eventId, s]) => ({ event: eventOf.get(eventId), ...s }))
    .sort((a, b) => rank(a.event) - rank(b.event) || (a.event.event_date ?? "").localeCompare(b.event.event_date ?? ""));

  const records = recordCards(data, { live, rank, eventOf, history });
  const chart = history.length ? eloChartHtml(history, data.ratings) : "";
  if (!chart && !records) return "";
  return `${chart}${records ? `<div class="rivals player-records">${records}</div>` : ""}`;
}

// The chart: the 1500 everyone starts from, then the rating after each
// event; Attuale / Picco / Posizione (among every rated player) beside the
// title.
function eloChartHtml(history, ratings) {
  const first = history[0];
  const points = [
    { value: first.elo_before, date: first.event.event_date, tip: `<span>Partenza</span> · <strong>${first.elo_before}</strong>` },
    ...history.map((h) => {
      const delta = h.elo_after - h.elo_before;
      return {
        value: h.elo_after,
        date: h.event.event_date,
        tip: `${escapeHtml(formatDate(h.event.event_date))} · ${escapeHtml(eventTitle(h.event))}<br><strong>${h.elo_after}</strong> <span class="elo-delta ${
          delta >= 0 ? "is-up" : "is-down"
        }">${signed(delta)}</span> · ${h.wins}-${h.losses}-${h.draws}`,
      };
    }),
  ];
  const current = history[history.length - 1].elo_after;
  const peak = history.reduce((best, h) => (h.elo_after > best.elo_after ? h : best), history[0]);
  const stats = [
    ["Attuale", current],
    ["Picco", Math.max(peak.elo_after, first.elo_before)],
  ];
  if (ratings.length) {
    const position = ratings.filter((r) => r.elo > current).length + 1;
    stats.push(["Posizione", `${position}°`, `${position}° su ${ratings.length}`]);
  }
  return renderRatingChart(points, { title: "Andamento Elo", baseline: first.elo_before, stats });
}

// The records, in this order, each only once it means something.
function recordCards(data, { live, rank, eventOf, history }) {
  const cards = [];
  // The live matches, oldest first; byes and drops aren't against anyone.
  const rows = data.rows
    .filter((r) => live(r.event))
    .sort((a, b) => rank(a.event) - rank(b.event) || (a.round ?? 0) - (b.round ?? 0));
  const played = rows.filter((r) => !r.isBye && !r.isDrop && r.opponentId);

  // Serie di vittorie: matches won in a row (a draw or a loss ends it).
  let run = 0;
  let runFrom = null;
  let streak = null;
  for (const r of played) {
    if (r.outcome !== "win") {
      run = 0;
      continue;
    }
    if (run === 0) runFrom = r.event;
    run += 1;
    if (run > (streak?.n ?? 0)) streak = { n: run, from: runFrom, to: r.event };
  }
  if (streak && streak.n >= MIN_RUN) {
    cards.push({
      key: "streak",
      label: "Serie di vittorie",
      value: streak.n,
      unit: "di fila",
      sub:
        streak.from.id === streak.to.id
          ? escapeHtml(eventTitle(streak.from))
          : escapeHtml(monthSpan(streak.from.event_date, streak.to.event_date)),
    });
  }

  // Miglior piazzamento: the best place; the same place again — in the
  // biggest event, then the latest (and how many times).
  const places = [...data.standings]
    .filter(([eventId, s]) => eventOf.has(eventId) && s.position)
    .map(([eventId, s]) => ({ event: eventOf.get(eventId), position: s.position, players: data.entryCounts.get(eventId) ?? 0 }))
    .sort((a, b) => a.position - b.position || b.players - a.players || rank(b.event) - rank(a.event));
  if (places.length) {
    const best = places[0];
    const times = places.filter((p) => p.position === best.position).length;
    cards.push({
      key: "place",
      label: "Miglior piazzamento",
      value: `${best.position}°`,
      unit: best.players ? `su ${best.players}` : "",
      sub: `<span>${escapeHtml(eventTitle(best.event))}</span>${times > 1 ? ` · <span>${times} volte</span>` : ""}`,
    });
  }

  // Lo scalpo più pesante: the win over the highest-rated opponent — their
  // Elo at the time of the match (each event's best, from the sync); the
  // same Elo: the latest.
  let scalp = null;
  for (const [eventId, s] of data.standings) {
    if (!eventOf.has(eventId) || s.best_win_elo == null) continue;
    const event = eventOf.get(eventId);
    if (!scalp || s.best_win_elo > scalp.elo || (s.best_win_elo === scalp.elo && rank(event) > rank(scalp.event))) {
      scalp = { elo: s.best_win_elo, event, opponentId: s.best_win_opponent };
    }
  }
  if (scalp) {
    const opponent = rows.find((r) => r.event.id === scalp.event.id && r.opponentId === scalp.opponentId)?.opponent;
    cards.push({
      key: "scalp",
      label: "Lo scalpo più pesante",
      value: scalp.elo,
      unit: "Elo",
      sub: `${opponent ? `<span>${escapeHtml(opponent.name)}</span> · ` : ""}<span>${escapeHtml(monthYear(scalp.event.event_date))}</span>`,
    });
  }

  // Il balzo più grande: the most Elo gained in one event.
  const leap = history.reduce((best, h) => (h.elo_after - h.elo_before > (best ? best.elo_after - best.elo_before : 0) ? h : best), null);
  if (leap) {
    cards.push({
      key: "leap",
      label: "Il balzo più grande",
      value: signed(leap.elo_after - leap.elo_before),
      unit: "Elo",
      sub: `<span>${escapeHtml(eventTitle(leap.event))}</span> · ${leap.wins}-${leap.losses}-${leap.draws}`,
    });
  }

  // Presenze di fila: our (closed, live) events attended one after another.
  let attendRun = 0;
  let attendFrom = null;
  let attend = null;
  for (const ev of data.played) {
    if (!eventOf.has(ev.id)) {
      attendRun = 0;
      continue;
    }
    if (attendRun === 0) attendFrom = ev;
    attendRun += 1;
    if (attendRun > (attend?.n ?? 0)) attend = { n: attendRun, from: attendFrom, to: ev };
  }
  if (attend && attend.n >= MIN_RUN) {
    cards.push({
      key: "attend",
      label: "Presenze di fila",
      value: attend.n,
      unit: "eventi",
      sub: escapeHtml(monthSpan(attend.from.event_date, attend.to.event_date)),
    });
  }

  // Avversari diversi: everyone faced at least once.
  const opponents = new Set(played.map((r) => r.opponentId));
  if (opponents.size) {
    cards.push({
      key: "opponents",
      label: "Avversari diversi",
      value: opponents.size,
      unit: "giocatori",
      sub: `in ${played.length} partite`,
    });
  }

  return cards.map(recordCardHtml).join("");
}

// The rival cards' look (js/player-rivals.js): an icon disc, the label
// over its detail, the number big on the right — not links (user).
function recordCardHtml(r) {
  return `
    <div class="rival-card is-record">
      <span class="rival-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[r.key]}</svg></span>
      <span class="rival-text">
        <span class="rival-label">${r.label}</span>
        <span class="rival-detail">${r.sub}</span>
      </span>
      <span class="rival-stat"><b>${r.value}</b>${r.unit ? `<small>${r.unit}</small>` : ""}</span>
    </div>`;
}
