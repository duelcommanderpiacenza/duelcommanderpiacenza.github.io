// Shared win/draw/loss tally + stat-tile rendering, used by both the player
// and commander detail pages (each shows the same overall winrate cards,
// updated live as the viewer narrows the scope with a filter).
//
// The "Winrate" figure is on a *match* basis (matches won / matches played),
// not a game basis: a 2-0 and a 2-1 match win both just count as one win,
// same as the Vittorie/Pareggi/Sconfitte tiles below it — those and the
// Winrate figure are now two views of the exact same match-level tally,
// not two different statistics.

export function winRatePct(wins, played) {
  return played > 0 ? ((wins / played) * 100).toFixed(1) : null;
}

export function tallyOutcome(bucket, outcome) {
  if (outcome === "win") bucket.wins += 1;
  else if (outcome === "draw") bucket.draws += 1;
  else bucket.losses += 1;
}

export function renderWinrateTiles(el, bucket) {
  const played = (bucket.wins ?? 0) + (bucket.draws ?? 0) + (bucket.losses ?? 0);
  const rate = winRatePct(bucket.wins ?? 0, played);
  el.innerHTML =
    rate === null
      ? '<p class="page-empty">Non ci sono ancora dati sufficienti.</p>'
      : `
    <div class="stat-tile"><div class="stat-tile-label">Winrate</div><div class="stat-tile-value">${rate}%</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Vittorie</div><div class="stat-tile-value">${bucket.wins}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Pareggi</div><div class="stat-tile-value">${bucket.draws}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Sconfitte</div><div class="stat-tile-value">${bucket.losses}</div></div>
  `;
}
