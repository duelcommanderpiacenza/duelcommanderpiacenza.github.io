// Small shared render helpers used across the public pages and the admin app.
import { archetypeIcon } from "./archetype-icons.js";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// Giocatori/Comandanti/Archetipi's default "Dal": the last this-many years
// only, so what each visit downloads stays bounded however long the history
// grows (the filter button's dot shows it's set; "Cancella" clears it).
export const DEFAULT_DATE_FROM_YEARS = 2;

// Local calendar date `years` years before today, as YYYY-MM-DD (the value
// format of an <input type="date">) — local, not toISOString()'s UTC, same
// reasoning as js/db.js's todayLocalIso.
export function isoDateYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return d.toLocaleDateString("it-IT", { year: "numeric", month: "short", day: "2-digit" });
}

// A Postgres `time` column round-trips through PostgREST as "HH:MM:SS" —
// trimmed to "HH:MM" for display, since seconds are never set by the
// <input type="time"> that produced it in the first place.
export function formatTime(value) {
  return value ? value.slice(0, 5) : null;
}

// A Topdeck event can be left unnamed by the admin — wherever its name would
// be shown as a title/label, fall back to its formatted date instead.
export function eventTitle(ev) {
  return ev.name || formatDate(ev.event_date);
}

// Only http(s) links are ever stored/rendered as a public href — a
// javascript: (or other scheme) URL must never reach the page.
export function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

// These name helpers link to the player's / commander's page; `{ link:
// false }` gives the same text unlinked — inside a list sub-card that is a
// link itself (js/history-list.js), where a link can't hold another.
export function playerLabel(player, { link = true } = {}) {
  if (!player) return "—";
  const name = escapeHtml(player.name);
  const linked = link && player.id ? `<a href="player.html?id=${player.id}">${name}</a>` : name;
  return player.handle ? `${linked} <span class="player-handle">(${escapeHtml(player.handle)})</span>` : linked;
}

function commanderLabel(commander, { link = true } = {}) {
  if (!commander) return "—";
  const name = escapeHtml(commander.name);
  return link && commander.id ? `<a href="commander.html?id=${commander.id}">${name}</a>` : name;
}

// An entry's commander, shown as "Commander / Partner" when a partner
// (background) commander was recorded alongside the primary one.
export function commanderPairLabel(commander, partner, options) {
  if (!commander) return "—";
  return partner
    ? `${commanderLabel(commander, options)} / ${commanderLabel(partner, options)}`
    : commanderLabel(commander, options);
}

// commanderPairLabel followed by the deck's color identity pips (commander's
// + partner's merged) — for table cells, in place of a separate "Identità
// di colore" column.
export function commanderPairWithColors(commander, partner, options) {
  if (!commander) return "—";
  const colors = `${commander.color_identity ?? ""}${partner?.color_identity ?? ""}`;
  return `${commanderPairLabel(commander, partner, options)}<span class="color-identity-inline">${colorIdentityPips(colors)}</span>`;
}

// A player's badges without repeats (and without empty slots): an automatic
// badge can also be assigned by hand in a manual slot (admin, e.g. a
// "Leggendario" earned before the site's history), so the same badge could
// otherwise show twice once it's also earned. First occurrence kept.
export function uniqueBadges(badges) {
  const seen = new Set();
  return badges.filter((b) => b && !seen.has(b.id) && seen.add(b.id));
}

// A player badge icon's hover/focus text (site-wide js/floating-tooltip.js,
// fed by data-tooltip): the badge's own description when the admin set one,
// else just its name. The screen-reader label always leads with the name.
// data-badge-* turn that tooltip into a small card (its icon, name,
// description) — with "Come si ottiene ›" to its entry on badges.html for an
// automatic badge (the only ones listed there).
export function badgeTooltipAttrs(badge) {
  const description = badge.description?.trim();
  const tooltip = description || badge.name;
  const label = description ? `${badge.name}: ${description}` : badge.name;
  const card =
    ` data-badge-name="${escapeHtml(badge.name)}"` +
    (description ? ` data-badge-description="${escapeHtml(description)}"` : "") +
    (badge.auto_rule ? ` data-badge-id="${escapeHtml(badge.id)}"` : "");
  return `data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(label)}"${card}`;
}

// A badge's icon in its disc (styles.css .badge-disc: white, red ring) — the one
// look for a badge wherever it appears: next to player names, the player
// page title, the admin lists. The disc is sized in em from the text around
// it, the glyph centered in it; an uploaded/custom picture (icon_url) or an
// emoji (icon) alike. `size` optionally sets that font size (e.g. "1.2rem"
// in an admin table cell). badges.html's big .badge-card-icon is the same
// disc, styled at its own size.
export function badgeDiscHtml(badge, size = null) {
  const glyph = badge.icon_url
    ? `<img src="${escapeHtml(badge.icon_url)}" alt="" class="badge-disc-glyph">`
    : `<span class="badge-disc-glyph">${escapeHtml(badge.icon ?? "")}</span>`;
  return `<span class="badge-disc"${size ? ` style="font-size:${size}"` : ""}>${glyph}</span>`;
}

// A commander's badges — "Bannato" (commanders.is_banned) and "Nuovo"
// (commanders.is_new, migration 027: first seen within the month before the
// latest closed event, set by the admin's syncAutoBadges) — drawn like the
// players' (the white disc with a red ring, badgeDiscHtml; the same hover
// card, js/floating-tooltip.js), with the site's own icons
// (icons/commanders/). Comandanti's list (a partner pair: either one) and
// commander.html's title. `{ banned, isNew }`.
const COMMANDER_BADGES = [
  { key: "banned", name: "Bannato", description: "Bandito nel formato Duel Commander.", icon_url: "/icons/commanders/banned.svg" },
  { key: "isNew", name: "Nuovo", description: "Giocato per la prima volta nell'ultimo mese.", icon_url: "/icons/commanders/new.svg" },
];

export function commanderBadgesHtml(flags) {
  return COMMANDER_BADGES.filter((b) => flags[b.key])
    .map((b) => `<span class="icon-badge" ${badgeTooltipAttrs(b)} tabindex="0">${badgeDiscHtml(b)}</span>`)
    .join("");
}

// An archetype's coloured badge — on the public site a way to its page
// (archetype.html): `data-archetype`, focusable, and js/layout.js opens the
// page on a click / Enter, even inside a sub-card that links elsewhere (a
// badge can't be a nested <a>). `{ link: false }` for a plain one (the
// admin, which doesn't load layout.js).
export function archetypeBadge(archetype, { link = true } = {}) {
  if (!archetype) return "";
  const name = escapeHtml(archetype);
  // Its icon before the name (js/archetype-icons.js).
  const icon = archetypeIcon(archetype, "badge-archetype-icon");
  return link
    ? `<span class="badge-archetype badge-archetype-${name}" data-archetype="${name}" role="link" tabindex="0" title="Vai all'archetipo">${icon}${name}</span>`
    : `<span class="badge-archetype badge-archetype-${name}">${icon}${name}</span>`;
}

const COLOR_ORDER = ["W", "U", "B", "R", "G"];

export function colorIdentityPips(colorIdentity) {
  const letters = String(colorIdentity ?? "").toUpperCase();
  const present = COLOR_ORDER.filter((c) => letters.includes(c));
  if (present.length === 0) {
    return '<span class="color-identity"><span class="color-pip" style="background:#ddd" title="Incolore"></span></span>';
  }
  return (
    '<span class="color-identity">' +
    present.map((c) => `<span class="color-pip color-pip-${c}" title="${c}"></span>`).join("") +
    "</span>"
  );
}

export function leagueStatusBadge(isOpen) {
  return isOpen
    ? '<span class="badge-status badge-status-open status-chip">In corso</span>'
    : '<span class="badge-status badge-status-closed status-chip">Conclusa</span>';
}

// A data request that failed — often only the connection not back yet
// (the app reopened, a restored tab): "Riprova" reloads the page, its data
// asked for again.
export function showError(el, err) {
  console.error(err);
  el.innerHTML = `<div class="page-error-box"><p class="page-error">Si &egrave; verificato un errore nel caricamento dei dati. ${
    !window.supabase ? "Controlla la connessione." : ""
  }</p><button type="button" class="btn-secondary page-error-retry">Riprova</button></div>`;
  el.querySelector(".page-error-retry").addEventListener("click", () => window.location.reload());
}
