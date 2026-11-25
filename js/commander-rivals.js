// commander.html's stat cards (between the "Utilizzo" chart and the
// lists), the look of player.html's rivals (js/player-rivals.js, styles
// .rivals / .rival-card): "Kryptonite" — the opposing deck this commander
// loses to the most, a link to its page — and "Portabandiera" — the pilot who
// played it in the most events (at least MIN_PILOT_EVENTS; at first the best
// winrate, which read oddly on a weak commander — user), a link to the
// player — and "Maestro" — the pilot with the best winrate on it (user,
// 2026-11-24: beside Portabandiera, not instead of it), only a good one
// (MIN_MASTER_WINRATE) over enough matches (MIN_MASTER_MATCHES); when that's
// the Portabandiera too, only the Maestro card (user, 2026-11-25 — before,
// only the Portabandiera's). From the page's match rows
// (js/commander-detail.js renderSections: the pairing shown), so they follow
// the pairing picker. Byes and drops left out, as in the hero's numbers; a
// mirror (the opposing deck has this commander too) isn't a kryptonite. A
// card only once its minimum is reached; none: the section hidden.
import { commanderPairLabel, playerLabel } from "./ui.js";
import { matchWinRate } from "./leaderboard.js";

const MIN_LOSSES = 2;
const MIN_PILOT_EVENTS = 2;
const MIN_MASTER_MATCHES = 8;
const MIN_MASTER_WINRATE = 60;

// Lucide line icons (ISC), like js/player-rivals.js: a gem, a flag, a crown.
const ICONS = {
  nemesis: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  regular:
    '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  master:
    '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
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
  const mostPlayed =
    [...pilots.values()]
      .filter((p) => p.events.size >= MIN_PILOT_EVENTS)
      .sort((a, b) => b.events.size - a.events.size || b.played - a.played || a.player.name.localeCompare(b.player.name))[0] ?? null;

  // The best winrate (js/leaderboard.js matchWinRate); then the most
  // matches, then by name.
  const winRate = (p) => matchWinRate(p.wins, p.draws, p.losses);
  const best =
    [...pilots.values()]
      .filter((p) => p.played >= MIN_MASTER_MATCHES && winRate(p) >= MIN_MASTER_WINRATE)
      .sort((a, b) => winRate(b) - winRate(a) || b.played - a.played || a.player.name.localeCompare(b.player.name))[0] ?? null;
  // The same player: the Maestro card only.
  const master = best;
  const pilot = mostPlayed && mostPlayed.player.id !== best?.player.id ? mostPlayed : null;

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
    master &&
      cardHtml(
        "master",
        "Maestro",
        `player.html?id=${encodeURIComponent(master.player.id)}`,
        playerLabel(master.player, { link: false }),
        master,
        `${Math.round(winRate(master))}%`,
        "winrate"
      ),
  ]
    .filter(Boolean)
    .join("");
}
