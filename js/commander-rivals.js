// commander.html's two stat cards (between the "Utilizzo" chart and the
// lists), the look of player.html's rivals (js/player-rivals.js, styles
// .rivals / .rival-card): "Kryptonite" — the opposing deck this commander
// loses to the most, a link to its page — and "Portabandiera" — the pilot who
// played it in the most events (at least MIN_PILOT_EVENTS; at first the best
// winrate, which read oddly on a weak commander — user), a link to the
// player. From the page's match rows
// (js/commander-detail.js renderSections: the pairing shown), so they follow
// the pairing picker. Byes and drops left out, as in the hero's numbers; a
// mirror (the opposing deck has this commander too) isn't a kryptonite. A
// card only once its minimum is reached; none: the section hidden.
import { commanderPairLabel, playerLabel } from "./ui.js";

const MIN_LOSSES = 2;
const MIN_PILOT_EVENTS = 2;

// Lucide line icons (ISC), like js/player-rivals.js: a gem, a flag.
const ICONS = {
  nemesis: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  regular:
    '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
};

const CHEVRON =
  '<svg class="rival-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

const record = () => ({ wins: 0, draws: 0, losses: 0, played: 0 });
function tally(r, outcome) {
  r.played += 1;
  if (outcome === "win") r.wins += 1;
  else if (outcome === "loss") r.losses += 1;
  else r.draws += 1;
}

function cardHtml(kind, label, href, nameHtml, r, count, unit) {
  return `
    <a class="rival-card is-${kind}" href="${href}">
      <span class="rival-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg></span>
      <span class="rival-text">
        <span class="rival-label">${label}</span>
        <span class="rival-name">${nameHtml}</span>
        <span class="rival-record" title="Vittorie-Sconfitte-Pareggi">${r.wins}-${r.losses}-${r.draws}</span>
      </span>
      <span class="rival-stat"><b>${count}</b><small>${unit}</small></span>
      ${CHEVRON}
    </a>`;
}

/**
 * The cards' HTML ("" when neither qualifies).
 * @param {Array} rows - js/commander-detail.js's: self, outcome, isBye, isDrop, oppCommander, oppPartner
 * @param {string} commanderId - this page's commander
 */
export function commanderRivalsHtml(rows, commanderId) {
  const decks = new Map(); // opposing deck key -> { commander, partner, ...record }
  const pilots = new Map(); // player id -> { player, events: Set of event ids, ...record }
  for (const r of rows) {
    // Its events: any round counts, a bye or a drop too.
    if (r.self) {
      if (!pilots.has(r.self.id)) pilots.set(r.self.id, { player: r.self, events: new Set(), ...record() });
      pilots.get(r.self.id).events.add(r.event?.id);
    }
    if (r.isBye || r.isDrop) continue;
    if (r.self) tally(pilots.get(r.self.id), r.outcome);
    const opp = r.oppCommander;
    if (!opp || opp.id === commanderId || r.oppPartner?.id === commanderId) continue;
    // X + Y is Y + X.
    const key = [opp.id, r.oppPartner?.id ?? ""].sort().join("_");
    if (!decks.has(key)) decks.set(key, { commander: opp, partner: r.oppPartner ?? null, ...record() });
    tally(decks.get(key), r.outcome);
  }

  const deckName = (d) => commanderPairLabel(d.commander, d.partner, { link: false });
  const kryptonite =
    [...decks.values()]
      .filter((d) => d.losses >= MIN_LOSSES)
      .sort((a, b) => b.losses - a.losses || a.wins - b.wins || deckName(a).localeCompare(deckName(b)))[0] ?? null;

  // The most events; then the most matches, then by name.
  const pilot =
    [...pilots.values()]
      .filter((p) => p.events.size >= MIN_PILOT_EVENTS)
      .sort((a, b) => b.events.size - a.events.size || b.played - a.played || a.player.name.localeCompare(b.player.name))[0] ?? null;

  return [
    kryptonite &&
      cardHtml("nemesis", "Kryptonite", `commander.html?id=${encodeURIComponent(kryptonite.commander.id)}`, deckName(kryptonite), kryptonite, kryptonite.losses, "sconfitte"),
    pilot &&
      cardHtml(
        "regular",
        "Portabandiera",
        `player.html?id=${encodeURIComponent(pilot.player.id)}`,
        playerLabel(pilot.player, { link: false }),
        pilot,
        pilot.events.size,
        "eventi"
      ),
  ]
    .filter(Boolean)
    .join("");
}
