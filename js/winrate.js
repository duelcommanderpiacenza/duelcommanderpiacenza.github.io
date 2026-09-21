// Shared win/draw/loss tally + stat-tile rendering, used by both the player
// and commander detail pages (each shows the same overall winrate cards,
// updated live as the viewer narrows the scope with a filter).
//
// The "Winrate" figure is deliberately on a *game* basis (games won / games
// played across every match), not a match basis: winning a match 2-0 counts
// more than winning it 2-1, even though both are a single match win. The
// Vittorie/Pareggi/Sconfitte tiles stay match-level counts, which is a
// legitimate, different statistic (the actual match record).

export function winRatePct(gameWins, gameTotal) {
  return gameTotal > 0 ? ((gameWins / gameTotal) * 100).toFixed(1) : null;
}

export function tallyOutcome(bucket, outcome) {
  if (outcome === "win") bucket.wins += 1;
  else if (outcome === "draw") bucket.draws += 1;
  else bucket.losses += 1;
}

export function tallyGames(bucket, gameWins, gameTotal) {
  bucket.gameWins += gameWins;
  bucket.gameTotal += gameTotal;
}

export function renderWinrateTiles(el, bucket) {
  const rate = winRatePct(bucket.gameWins ?? 0, bucket.gameTotal ?? 0);
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
