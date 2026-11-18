// player.html's rivals (between the league recap and the album): three
// cards, each an opponent picked from the player's matches in the Dove bar's
// scope — "Bestia nera" (lost to the most), "Vittima preferita" (beaten the
// most), "Vecchia conoscenza" (faced the most, among those not already on
// one of the other two). Each card a link to Confronto
// with the two players side by side. Byes and drops aren't against anyone:
// left out. A card only once its number reaches its minimum (a single loss
// doesn't make a nemesis); none at all: the section hidden.
import { escapeHtml } from "./ui.js";

const MIN_LOSSES = 2;
const MIN_WINS = 2;
const MIN_MATCHES = 3;

// Lucide line icons (ISC), like js/archetype-icons.js: a skull, a target,
// two people.
const ICONS = {
  nemesis:
    '<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/>',
  victim: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  regular:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};

const CHEVRON =
  '<svg class="rival-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

// Each opponent's head-to-head record from the player's match rows
// (js/player-detail.js's: opponentId, opponent, outcome, isBye, isDrop) —
// rows newest first, so an opponent's name is from the latest match.
function headToHead(rows) {
  const byOpponent = new Map(); // opponent id -> { opponent, wins, draws, losses, played }
  for (const r of rows) {
    if (r.isBye || r.isDrop || !r.opponentId) continue;
    if (!byOpponent.has(r.opponentId)) {
      byOpponent.set(r.opponentId, { id: r.opponentId, opponent: r.opponent, wins: 0, draws: 0, losses: 0, played: 0 });
    }
    const h = byOpponent.get(r.opponentId);
    h.played += 1;
    if (r.outcome === "win") h.wins += 1;
    else if (r.outcome === "loss") h.losses += 1;
    else h.draws += 1;
  }
  return [...byOpponent.values()];
}

const nameOf = (h) => h.opponent?.name ?? "";

// The best by `compare` among those reaching `min` of `value`, else null.
function pick(list, value, min, compare) {
  return list.filter((h) => value(h) >= min).sort((a, b) => compare(a, b) || nameOf(a).localeCompare(nameOf(b)))[0] ?? null;
}

function cardHtml(kind, label, h, count, unit, playerId) {
  const name = nameOf(h) + (h.opponent?.handle ? ` (${h.opponent.handle})` : "");
  return `
    <a class="rival-card is-${kind}" href="compare.html?a=${encodeURIComponent(playerId)}&b=${encodeURIComponent(h.id)}">
      <span class="rival-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg></span>
      <span class="rival-text">
        <span class="rival-label">${label}</span>
        <span class="rival-name">${escapeHtml(name)}</span>
        <span class="rival-record" title="Vittorie-Sconfitte-Pareggi">${h.wins}-${h.losses}-${h.draws}</span>
      </span>
      <span class="rival-stat"><b>${count}</b><small>${unit}</small></span>
      ${CHEVRON}
    </a>`;
}

/** The cards' HTML for the player's match rows ("" when none qualifies). */
export function rivalsHtml(rows, playerId) {
  const list = headToHead(rows);
  const nemesis = pick(list, (h) => h.losses, MIN_LOSSES, (a, b) => b.losses - a.losses || a.wins - b.wins);
  const victim = pick(list, (h) => h.wins, MIN_WINS, (a, b) => b.wins - a.wins || a.losses - b.losses);
  // Not someone already on a card (often the nemesis is also the one met
  // the most): the most faced among the others.
  const shown = new Set([nemesis?.id, victim?.id]);
  const regular = pick(
    list.filter((h) => !shown.has(h.id)),
    (h) => h.played,
    MIN_MATCHES,
    (a, b) => b.played - a.played
  );
  return [
    nemesis && cardHtml("nemesis", "Bestia nera", nemesis, nemesis.losses, "sconfitte", playerId),
    victim && cardHtml("victim", "Vittima preferita", victim, victim.wins, "vittorie", playerId),
    regular && cardHtml("regular", "Vecchia conoscenza", regular, regular.played, "partite", playerId),
  ]
    .filter(Boolean)
    .join("");
}
