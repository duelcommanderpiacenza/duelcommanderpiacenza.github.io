// The player card's shared pieces, used by account.html's own editable card
// (js/account-page.js) and the public one on player.html
// (js/player-detail.js): the border/glow colours, the commander art
// (Scryfall), and the public card's markup. Its look is styles.css's
// .player-card / .pc-* rules.
import { escapeHtml, colorIdentityPips } from "./ui.js";

// The card border's gradient and the avatar's glow, per favourite colour —
// brighter than the color-pip fills, since they glow on a dark card. No
// colours: silver.
const ACCENT = { W: "#f3ead0", U: "#3b8ae0", B: "#8f8288", R: "#e8492f", G: "#33a866" };
const NO_ACCENT = ["#d6dbe0", "#8d959c"];

// Border gradient + glow from the colours (a WUBRG-ordered string); one
// colour fades into a darker shade of itself.
export function applyCardAccents(cardEl, colors) {
  const accents = colors ? [...colors].map((c) => ACCENT[c]) : NO_ACCENT;
  const stops = accents.length === 1 ? [accents[0], `color-mix(in srgb, ${accents[0]} 55%, #000)`] : accents;
  cardEl.style.setProperty("--pc-gradient", `linear-gradient(135deg, ${stops.join(", ")})`);
  cardEl.style.setProperty("--pc-glow", accents[0]);
}

export const archetypeLabel = (archetype) => archetype.charAt(0).toUpperCase() + archetype.slice(1);

// Displayed as a placeholder wherever a fact isn't set.
export const EMPTY_VALUE = '<span class="profile-empty">—</span>';

// Scryfall's art-only crop of the commander's front face. null when there's
// no match or Scryfall can't be reached — the card just keeps its colour
// glow. Cached per commander, so switching back and forth in edit mode
// doesn't ask again.
const artCache = new Map();

function fetchCardArt(name) {
  if (!artCache.has(name)) {
    artCache.set(
      name,
      fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((card) => (card?.image_uris ?? card?.card_faces?.[0]?.image_uris)?.art_crop ?? null)
        .catch(() => null)
    );
  }
  return artCache.get(name);
}

// Returns a function painting a commander's art (by name, or null for none)
// on a card's .pc-art. The newest call wins: picking several commanders
// quickly in edit mode never ends with an older one's art. Loaded first,
// then shown, so it fades in whole (.is-loaded) instead of painting in.
export function createArtPainter(artEl) {
  let latest = 0;
  return async function paintArt(commanderName) {
    const request = ++latest;
    const url = commanderName ? await fetchCardArt(commanderName) : null;
    if (request !== latest) return;
    if (!url) {
      artEl.style.backgroundImage = "";
      artEl.classList.remove("is-loaded");
      return;
    }
    if (artEl.dataset.url === url && artEl.classList.contains("is-loaded")) return;
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      // Shown anyway: the browser just paints it as it arrives.
    }
    if (request !== latest) return;
    artEl.dataset.url = url;
    artEl.style.backgroundImage = `url("${url}")`;
    artEl.classList.remove("is-loaded");
    void artEl.offsetWidth;
    artEl.classList.add("is-loaded");
  };
}

// player.html's card, view only: the same layout as account.html's card
// outside edit mode. `card` is db.js's PlayerCards.get() row, `name` the
// player's name, `since` the year of their first event (or null). The
// avatar: the Google picture when shown; hidden by the owner → no circle at
// all; no Google picture → the initial. No description → no description
// line (account.html's "premi ✎" invitation is for the owner only).
// Returns the card element.
export function renderPublicPlayerCard(containerEl, card, { name, since }) {
  let avatar = "";
  if (card.avatar_url) {
    avatar = `<div class="pc-avatar"><img src="${escapeHtml(card.avatar_url)}" alt="" referrerpolicy="no-referrer"></div>`;
  } else if (!card.has_picture) {
    avatar = `<div class="pc-avatar"><span aria-hidden="true">${escapeHtml((name.trim()[0] ?? "?").toUpperCase())}</span></div>`;
  }
  const description = card.description?.trim();
  containerEl.innerHTML = `<article class="player-card" aria-label="La carta di ${escapeHtml(name)}">
    <div class="pc-frame">
      <div class="pc-surface">
        <div class="pc-art" aria-hidden="true"></div>
        <div class="pc-content">
          <div class="pc-art-space" aria-hidden="true"></div>
          <div class="pc-nameplate">
            ${avatar}
            <div class="pc-nameplate-text"><p class="pc-name">${escapeHtml(name)}</p></div>
          </div>
          <div class="pc-panel">
            <div class="pc-field-row">
              <div class="pc-field">
                <p class="pc-label">Archetipo preferito</p>
                <p class="pc-value">${card.fav_archetype ? escapeHtml(archetypeLabel(card.fav_archetype)) : EMPTY_VALUE}</p>
              </div>
              <div class="pc-field">
                <p class="pc-label">Colori preferiti</p>
                <p class="pc-value">${card.fav_colors ? colorIdentityPips(card.fav_colors) : EMPTY_VALUE}</p>
              </div>
            </div>
            ${description ? `<p class="pc-description">${escapeHtml(description)}</p>` : ""}
          </div>
          <div class="pc-foot">
            <span class="pc-since">${since ? `Dal ${escapeHtml(since)}` : ""}</span>
            <img src="dc_pc.png" alt="" class="pc-logo">
          </div>
        </div>
      </div>
    </div>
  </article>`;
  const cardEl = containerEl.firstElementChild;
  applyCardAccents(cardEl, card.fav_colors);
  createArtPainter(cardEl.querySelector(".pc-art"))(card.commander_name);
  return cardEl;
}
