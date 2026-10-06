// The player card's shared pieces, used by account.html's own editable card
// (js/account-page.js) and the public one on player.html
// (js/player-detail.js): the border/glow colours, the commander art
// (Scryfall), and the public card's markup. Its look is styles.css's
// .player-card / .pc-* rules.
import { escapeHtml, colorIdentityPips, badgeTooltipAttrs } from "./ui.js";
import { applyCardCosmetics } from "./card-cosmetics.js";

// The card's glow colour (the avatar's ring, the glow behind the logo while
// there's no art), from the first favourite colour — brighter than the
// color-pip fills, since it glows on a dark card. No colours: silver. (The
// card no longer has a border in the favourite colours: its frame is the
// Presenze cosmetic's, js/card-cosmetics.js.)
const ACCENT = { W: "#e3d58a", U: "#3b8ae0", B: "#8f8288", R: "#e8492f", G: "#33a866" };
const NO_ACCENT = "#d6dbe0";

// The glow from the colours (a WUBRG-ordered string).
export function applyCardAccents(cardEl, colors) {
  cardEl.style.setProperty("--pc-glow", colors ? ACCENT[colors[0]] : NO_ACCENT);
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

// The player's badges in the card's top-left corner (.pc-badges): one small
// glass disc each, in the order given (manual slots, then automatic by
// priority — the caller's uniqueBadges list). Drawn here rather than with
// the site's own badge icons, to suit the dark card; .icon-badge +
// data-tooltip still give them the site-wide hover text (js/layout.js).
export function cardBadgesHtml(badges) {
  return badges
    .map((b) => {
      const glyph = b.icon_url
        ? `<img src="${escapeHtml(b.icon_url)}" alt="" class="pc-badge-glyph">`
        : `<span class="pc-badge-glyph">${escapeHtml(b.icon ?? "")}</span>`;
      return `<span class="icon-badge pc-badge" ${badgeTooltipAttrs(b)} tabindex="0">${glyph}</span>`;
    })
    .join("");
}

// --- Links on the card (Instagram, Moxfield, Archidekt) ---------------------------

// The owner's usernames on those sites (profiles.instagram / moxfield /
// archidekt, supabase/migrations/010). Only the username is ever stored —
// the database allows nothing else — and the links are built here. In edit
// mode a pasted profile link is accepted too, but only from that site's own
// address (hosts below): its username is taken out of it.
export const CARD_LINK_SITES = {
  instagram: {
    label: "Instagram",
    hosts: ["instagram.com", "www.instagram.com"],
    path: /^\/([A-Za-z0-9._]{1,30})\/?$/,
    username: /^[A-Za-z0-9._]{1,30}$/,
    url: (u) => `https://www.instagram.com/${u}/`,
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"></circle></svg>',
  },
  moxfield: {
    label: "Moxfield",
    hosts: ["moxfield.com", "www.moxfield.com"],
    path: /^\/users\/([A-Za-z0-9_-]{1,40})\/?$/,
    username: /^[A-Za-z0-9_-]{1,40}$/,
    url: (u) => `https://moxfield.com/users/${u}`,
    icon: '<img src="moxfield.png" alt="">',
  },
  archidekt: {
    label: "Archidekt",
    hosts: ["archidekt.com", "www.archidekt.com"],
    path: /^\/u\/([A-Za-z0-9_.-]{1,40})\/?$/,
    username: /^[A-Za-z0-9_.-]{1,40}$/,
    url: (u) => `https://archidekt.com/u/${u}`,
    icon: '<span class="pc-link-letter" aria-hidden="true">A</span>',
  },
};

// What's typed in edit mode → { username } (null when empty), or { error }
// with a message: a link from another site, or not a valid username.
export function parseCardLink(site, raw) {
  const def = CARD_LINK_SITES[site];
  const value = raw.trim().replace(/^@/, "");
  if (!value) return { username: null };
  const looksLikeLink = /[/:]/.test(value) || /^(www\.)?[a-z0-9-]+\.(com|net|org|it)\b/i.test(value);
  if (looksLikeLink) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return { error: `Il link ${def.label} non è valido.` };
    }
    if (!def.hosts.includes(url.hostname.toLowerCase())) {
      return { error: `Il link ${def.label} deve essere un indirizzo di ${def.hosts[0]}.` };
    }
    const match = url.pathname.match(def.path);
    return match ? { username: match[1] } : { error: `Dal link ${def.label} non si capisce il nome utente.` };
  }
  return def.username.test(value) ? { username: value } : { error: `Nome utente ${def.label} non valido.` };
}

// The card's link icons, in this order, only the ones set; each opens the
// profile in a new tab.
export function cardLinksHtml(links) {
  return Object.entries(CARD_LINK_SITES)
    .filter(([key]) => links[key])
    .map(([key, def]) => {
      const user = links[key];
      return `<a class="pc-link pc-link-${key}" href="${escapeHtml(def.url(encodeURIComponent(user)))}" target="_blank" rel="noopener noreferrer" title="${
        def.label
      }: ${escapeHtml(user)}" aria-label="${def.label}: ${escapeHtml(user)}">${def.icon}</a>`;
    })
    .join("");
}

// player.html's card, view only: the same layout as account.html's card
// outside edit mode. `card` is db.js's PlayerCards.get() row, `name` the
// player's name, `since` the year of their first event (or null), `badges`
// the player's badges (cardBadgesHtml), `progress` the player's
// player_progress row for the cosmetics (js/card-cosmetics.js; null: none). The
// avatar: the Google picture when shown; otherwise (hidden by the owner, or
// no Google picture) no circle at all, leaving the name the room. No
// description → no description line (account.html's "premi ✎" invitation
// is for the owner only).
// Returns the card element.
export function renderPublicPlayerCard(containerEl, card, { name, since, badges = [], progress = null }) {
  const avatar = card.avatar_url
    ? `<div class="pc-avatar"><img src="${escapeHtml(card.avatar_url)}" alt="" referrerpolicy="no-referrer"></div>`
    : "";
  const description = card.description?.trim();
  containerEl.innerHTML = `<article class="player-card" aria-label="La carta di ${escapeHtml(name)}">
    <div class="pc-frame">
      <div class="pc-surface">
        <div class="pc-art" aria-hidden="true"></div>
        <div class="pc-badges">${cardBadgesHtml(badges)}</div>
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
            <div class="pc-links">${cardLinksHtml(card)}</div>
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
  applyCardCosmetics(cardEl, progress);
  createArtPainter(cardEl.querySelector(".pc-art"))(card.commander_name);
  return cardEl;
}
