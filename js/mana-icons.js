// The Magic colours as the real mana symbols — Scryfall's card-symbol SVGs
// (https://svgs.scryfall.io/card-symbols/<C>.svg), copied into icons/mana/
// (W U B R G, C for colorless): the printed cards' pip, its pale disc and
// black glyph, flat. Images, not inline SVG, so the browser caches them
// once for every pip on the page. Everywhere a colour is shown (since
// 2026-11-10, user — after a test on Comandanti): the colour identity pips
// (js/ui.js colorIdentityPips), Comandanti's "Colori più giocati" bars, the
// colour bubbles' legend and bubbles (js/metagame-chart.js), Evoluzione's
// "Colori nel tempo"; the colour pickers (Comandanti's filter, the player
// card's favourite colours, the admin's colour identity) have the same
// images in their HTML.

const COLOR_NAMES = { W: "Bianco", U: "Blu", B: "Nero", R: "Rosso", G: "Verde", C: "Incolore" };

// Resolved from this module's own address, so the same markup works from
// the admin (admin/) too.
const symbolUrl = (color) => new URL(`../icons/mana/${color}.svg`, import.meta.url).href;

// One colour's symbol (W U B R G C); sized by its container's CSS (css/3
// .mana-symbol). `title`: its name on hover (the pips).
export function manaSymbol(color, { title = false } = {}) {
  return `<img class="mana-symbol" src="${symbolUrl(color)}" alt="${title ? COLOR_NAMES[color] : ""}"${
    title ? ` title="${COLOR_NAMES[color]}"` : ' aria-hidden="true"'
  } draggable="false">`;
}
