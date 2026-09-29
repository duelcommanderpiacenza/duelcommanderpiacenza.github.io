// Small shared render helpers used across the public pages and the admin app.

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

// An "Evento" table cell: the event's (linked) title, with its league's name
// as a small tag on a second line (styles.css .event-league-tag) rather than
// a column of its own — none for a standalone event. Needs the event row's
// `league` embed (a league:leagues(...) inside the event:events(...) select).
export function eventCellLabel(event) {
  if (!event) return "—";
  const title = `<a href="event.html?id=${event.id}">${escapeHtml(eventTitle(event))}</a>`;
  return event.league ? `${title}<span class="event-league-tag">${escapeHtml(event.league.name)}</span>` : title;
}

// Only http(s) links are ever stored/rendered as a public href — a
// javascript: (or other scheme) URL must never reach the page.
export function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

export function playerLabel(player) {
  if (!player) return "—";
  const name = escapeHtml(player.name);
  const linked = player.id ? `<a href="player.html?id=${player.id}">${name}</a>` : name;
  return player.handle ? `${linked} <span class="player-handle">(${escapeHtml(player.handle)})</span>` : linked;
}

export function commanderLabel(commander) {
  if (!commander) return "—";
  const name = escapeHtml(commander.name);
  return commander.id ? `<a href="commander.html?id=${commander.id}">${name}</a>` : name;
}

// An entry's commander, shown as "Commander / Partner" when a partner
// (background) commander was recorded alongside the primary one.
export function commanderPairLabel(commander, partner) {
  if (!commander) return "—";
  return partner ? `${commanderLabel(commander)} / ${commanderLabel(partner)}` : commanderLabel(commander);
}

// commanderPairLabel followed by the deck's color identity pips (commander's
// + partner's merged) — for table cells, in place of a separate "Identità
// di colore" column.
export function commanderPairWithColors(commander, partner) {
  if (!commander) return "—";
  const colors = `${commander.color_identity ?? ""}${partner?.color_identity ?? ""}`;
  return `${commanderPairLabel(commander, partner)}<span class="color-identity-inline">${colorIdentityPips(colors)}</span>`;
}

// A player badge icon's hover/focus text (site-wide js/floating-tooltip.js,
// fed by data-tooltip): the badge's own description when the admin set one,
// else just its name. The screen-reader label always leads with the name.
export function badgeTooltipAttrs(badge) {
  const description = badge.description?.trim();
  const tooltip = description || badge.name;
  const label = description ? `${badge.name}: ${description}` : badge.name;
  return `data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(label)}"`;
}

// ⚠️ "Bannato" icon (tooltip via the site-wide js/floating-tooltip.js) —
// Comandanti's table and commander.html's title.
export function bannedBadge() {
  return '<span class="icon-badge icon-badge-banned" data-tooltip="Bannato" aria-label="Bannato" tabindex="0">&#9888;&#65039;</span>';
}

export function archetypeBadge(archetype) {
  if (!archetype) return "";
  return `<span class="badge-archetype badge-archetype-${escapeHtml(archetype)}">${escapeHtml(archetype)}</span>`;
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
    ? '<span class="badge-status badge-status-open">In corso</span>'
    : '<span class="badge-status badge-status-closed">Conclusa</span>';
}

export function showError(el, err) {
  console.error(err);
  el.innerHTML = `<p class="page-error">Si &egrave; verificato un errore nel caricamento dei dati. ${
    !window.supabase ? "Controlla la connessione." : ""
  }</p>`;
}

// Renders `rows` into `el` one page at a time (`pageSize` per page), via
// `renderRows(visibleRows)` — a function returning the markup for however
// many rows are currently visible (its own empty-state message included,
// for when `rows` is empty). A "Mostra altri risultati" button is appended
// below, revealing one more page per click and disappearing once every row
// is shown — for any table (match/event history, etc.) long enough that
// rendering it all at once isn't worth the scroll.
export function renderPaginated(el, rows, renderRows, pageSize = 10) {
  let visible = Math.min(pageSize, rows.length);

  function draw() {
    const remaining = rows.length - visible;
    const button =
      remaining > 0
        ? `<div class="table-load-more"><button type="button" class="btn-secondary btn-load-more">Mostra altri risultati (${remaining})</button></div>`
        : "";
    el.innerHTML = renderRows(rows.slice(0, visible)) + button;
    el.querySelector(".btn-load-more")?.addEventListener("click", () => {
      visible = Math.min(visible + pageSize, rows.length);
      draw();
    });
  }

  draw();
}
