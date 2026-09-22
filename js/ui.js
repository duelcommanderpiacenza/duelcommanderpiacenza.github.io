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

export function statusBadge(isOpen) {
  return isOpen
    ? '<span class="badge-status badge-status-open">Aperta</span>'
    : '<span class="badge-status badge-status-closed">Chiusa</span>';
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
