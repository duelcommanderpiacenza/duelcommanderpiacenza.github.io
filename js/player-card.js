// The player card's shared pieces, used by account.html's own editable card
// (js/account-page.js) and the public one on player.html
// (js/player-detail.js): the border/glow colours, the commander art
// (Scryfall), and the public card's markup. Its look is styles.css's
// .player-card / .pc-* rules.
import { escapeHtml, badgeTooltipAttrs } from "./ui.js";
import { applyCardCosmetics } from "./card-cosmetics.js";

// The favourite colours on the card — never as text: the avatar's ring in
// all of them, a glow (around the avatar, behind the logo while there's no
// art) from the first one, and a faint tint of the glass panel across all
// of them, left to right — brighter than the color-pip fills, since they
// glow on a dark card. No colours: a white ring, a silver glow, an
// untinted panel. (The card's frame is the
// Presenze cosmetic's, js/card-cosmetics.js.)
const ACCENT = { W: "#e3d58a", U: "#3b8ae0", B: "#8f8288", R: "#e8492f", G: "#33a866" };
const NO_ACCENT = "#d6dbe0";
const PANEL_TINT_PCT = 38;

// From the colours (a WUBRG-ordered string): --pc-glow, --pc-avatar-ring
// (styles.css .pc-avatar: one colour solid, several blended round the
// circle; none: white) and --pc-panel-tint (.pc-panel).
export function applyCardAccents(cardEl, colors) {
  cardEl.style.setProperty("--pc-glow", colors ? ACCENT[colors[0]] : NO_ACCENT);
  if (!colors) {
    cardEl.style.removeProperty("--pc-panel-tint");
    cardEl.style.removeProperty("--pc-avatar-ring");
    return;
  }
  const ring = [...colors].map((c) => ACCENT[c]);
  cardEl.style.setProperty(
    "--pc-avatar-ring",
    ring.length === 1 ? `linear-gradient(${ring[0]}, ${ring[0]})` : `conic-gradient(${[...ring, ring[0]].join(", ")})`
  );
  const stops = [...colors].map((c) => `color-mix(in srgb, ${ACCENT[c]} ${PANEL_TINT_PCT}%, transparent)`);
  // One colour: from it to a fainter version of itself.
  if (stops.length === 1) stops.push(`color-mix(in srgb, ${ACCENT[colors[0]]} ${PANEL_TINT_PCT / 3}%, transparent)`);
  cardEl.style.setProperty("--pc-panel-tint", `linear-gradient(120deg, ${stops.join(", ")})`);
}

// Scryfall's art-only crop of a card's front face: a given printing's
// (printId, a Scryfall card id — the "Versione" picked on account.html),
// else Scryfall's default printing of that name. null when there's no
// match or Scryfall can't be reached — the card just keeps its colour
// glow. Cached per name + printing, so switching back and forth in edit
// mode doesn't ask again.
const artCache = new Map();

export const cardArtUrl = (card) => (card?.image_uris ?? card?.card_faces?.[0]?.image_uris)?.art_crop ?? null;

function fetchCardArt(name, printId = null) {
  const key = `${name}|${printId ?? ""}`;
  if (!artCache.has(key)) {
    const url = printId
      ? `https://api.scryfall.com/cards/${encodeURIComponent(printId)}`
      : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
    artCache.set(
      key,
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then(cardArtUrl)
        .catch(() => null)
    );
  }
  return artCache.get(key);
}

// A hero's buttons (back pill, follow star, account's quick actions) take
// their colour from the hero's art (styles.css --hero-btn / --hero-btn-hover,
// brand red by default): the art shrunk to 24×24, each pixel weighted by how
// saturated it is (so the art's colour wins over its greys and blacks),
// averaged, then held to a dark, fairly saturated tone white text reads on.
// null when the image can't be read (no CORS: a tainted canvas) — the
// buttons just stay brand red.
const TONE_SIZE = 24;

function heroTone(img) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TONE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, TONE_SIZE, TONE_SIZE);
    const data = ctx.getImageData(0, 0, TONE_SIZE, TONE_SIZE).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      const sat = max ? (max - min) / max : 0;
      const weight = 0.05 + sat * sat;
      r += data[i] * weight;
      g += data[i + 1] * weight;
      b += data[i + 2] * weight;
      total += weight;
    }
    return rgbToHue(r / total, g / total, b / total);
  } catch {
    return null;
  }
}

// { h (degrees), s (0–1) } of an RGB colour.
function rgbToHue(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: Math.round((h * 60 + 360) % 360), s };
}

// The tone on the element holding the hero's buttons: .detail-hero-wrap
// (player / commander / league: the back pill and the star sit beside the
// hero, in its wrap), else the hero itself (account.html).
// On a page whose <main> asks for it (data-accent-from-hero: player.html,
// account.html), the same tone becomes the page's accent too — the site's
// red variables redefined on <main> (styles.css main[data-accent-from-hero]),
// so its buttons, chips, tabs, links… follow the hero; the header and the
// nav, outside <main>, stay red. In dark mode red text uses a light shade
// of it (--hero-accent-light).
const ACCENT_VARS = ["--hero-accent", "--hero-accent-deep", "--hero-accent-deep-2", "--hero-accent-light", "--hero-bar"];

// js/router.js, on an in-app navigation: the header's (and the nav's)
// hero colour dropped when the next page won't set its own.
export function clearHeroTone({ header = true, nav = true } = {}) {
  const els = [header && document.querySelector(".site-header"), nav && document.querySelector(".site-nav")];
  for (const el of els.filter(Boolean)) {
    ACCENT_VARS.forEach((v) => el.style.removeProperty(v));
    el.classList.remove("has-hero-accent");
  }
}

function applyHeroTone(artEl, img) {
  // Its page already left (in-app navigation): the colour isn't this
  // page's any more.
  if (!artEl.isConnected) return;
  const host = artEl.closest(".detail-hero-wrap") ?? artEl.closest(".profile-hero");
  if (!host) return;
  const main = artEl.closest("main[data-accent-from-hero]");
  const tone = img ? heroTone(img) : null;
  // Any page with a hero: the header (styles.css: on phones its logo, the
  // signed-in picture's ring and the search icon fade to the colour).
  const header = document.querySelector(".site-header");
  if (!tone) {
    host.style.removeProperty("--hero-btn");
    host.style.removeProperty("--hero-btn-hover");
    if (header) {
      ACCENT_VARS.forEach((v) => header.style.removeProperty(v));
      header.classList.remove("has-hero-accent");
    }
    if (main) {
      for (const el of [main, document.querySelector(".site-nav")].filter(Boolean)) {
        ACCENT_VARS.forEach((v) => el.style.removeProperty(v));
        el.classList.remove("has-hero-accent");
      }
    }
    return;
  }
  const sat = Math.round(Math.min(Math.max(tone.s, 0.3), 0.7) * 100);
  host.style.setProperty("--hero-btn", `hsl(${tone.h} ${sat}% 36%)`);
  host.style.setProperty("--hero-btn-hover", `hsl(${tone.h} ${sat}% 28%)`);
  if (header) {
    header.style.setProperty("--hero-accent", `hsl(${tone.h} ${sat}% 44%)`);
    header.style.setProperty("--hero-accent-deep", `hsl(${tone.h} ${sat}% 33%)`);
    header.style.setProperty("--hero-accent-deep-2", `hsl(${tone.h} ${sat}% 28%)`);
    header.style.setProperty("--hero-accent-light", `hsl(${tone.h} ${Math.max(sat, 55)}% 72%)`);
    // The phone's status bar over the hero's dark top (js/system-bars.js).
    header.style.setProperty("--hero-bar", `hsl(${tone.h} ${sat}% 11%)`);
    header.classList.add("has-hero-accent");
  }
  if (main) {
    // The page's content, and the nav (styles.css: its touch pill only —
    // the desktop tabs stay red).
    for (const el of [main, document.querySelector(".site-nav")].filter(Boolean)) {
      el.style.setProperty("--hero-accent", `hsl(${tone.h} ${sat}% 44%)`);
      el.style.setProperty("--hero-accent-deep", `hsl(${tone.h} ${sat}% 33%)`);
      el.style.setProperty("--hero-accent-deep-2", `hsl(${tone.h} ${sat}% 28%)`);
      el.style.setProperty("--hero-accent-light", `hsl(${tone.h} ${Math.max(sat, 55)}% 72%)`);
      el.classList.add("has-hero-accent");
    }
  }
}

// Returns a function painting a card's art (by name — and printing, when
// one was picked — or null for none) on a card's .pc-art. The newest call
// wins: picking several cards quickly in edit mode never ends with an older
// one's art. Loaded first, then shown, so it fades in whole (.is-loaded)
// instead of painting in.
export function createArtPainter(artEl) {
  let latest = 0;
  return async function paintArt(cardName, printId = null) {
    const request = ++latest;
    const url = cardName ? await fetchCardArt(cardName, printId) : null;
    if (request !== latest) return;
    const isHero = artEl.classList.contains("profile-hero-art");
    if (!url) {
      artEl.style.backgroundImage = "";
      artEl.classList.remove("is-loaded");
      if (isHero) applyHeroTone(artEl, null);
      return;
    }
    if (artEl.dataset.url === url && artEl.classList.contains("is-loaded")) return;
    const img = new Image();
    // A hero's art is read for its buttons' colour (heroTone) — fetched with
    // CORS so the canvas may read it (Scryfall's images allow it).
    if (isHero) img.crossOrigin = "anonymous";
    img.src = url;
    try {
      await img.decode();
    } catch {
      // Shown anyway: the browser just paints it as it arrives.
    }
    if (request !== latest) return;
    if (isHero) applyHeroTone(artEl, img);
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
// outside edit mode — the links, then the description, on the panel tinted
// in the favourite colours. `card` is db.js's PlayerCards.get() row, `name` the
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
  const links = cardLinksHtml(card);
  // Neither: no empty glass box.
  const panel =
    links || description
      ? `<div class="pc-panel">
            <div class="pc-links">${links}</div>
            ${description ? `<p class="pc-description">${escapeHtml(description)}</p>` : ""}
          </div>`
      : "";
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
          ${panel}
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
  createArtPainter(cardEl.querySelector(".pc-art"))(card.commander_name, card.card_print ?? null);
  return cardEl;
}
