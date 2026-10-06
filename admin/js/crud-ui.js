import { escapeHtml } from "../../js/ui.js";

// Inline SVGs (not a font glyph) so the Modifica/Elimina row buttons render
// crisp and identical across every OS/browser instead of relying on however
// a given system's font happens to draw "✎"/"✕". stroke="currentColor" so
// each button's own CSS `color` (see .icon-btn-edit/.icon-btn-delete in
// ../../styles.css) is what actually colors the icon.
const EDIT_ICON_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 20h9"/>
  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
</svg>`;

const DELETE_ICON_SVG = `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M18 6 6 18"/>
  <path d="M6 6l12 12"/>
</svg>`;

/**
 * Renders an admin list — the public site's sub-card look (.history-panel /
 * .history-item, ../../styles.css), not a table: one card per row, which
 * isn't itself clickable — only the buttons in it are. Per card: the
 * primary column (the first, or the one marked `primary`) as its bold title
 * on the left; the other labelled columns as small label-over-value fields
 * (the same width in every card, so they line up like a table's columns);
 * on the right the unlabelled columns' content (their own buttons — Gestisci,
 * ↑↓, Approva…) then Modifica/Elimina when given. One line on desktop
 * (narrower columns when the list is narrow); only on phones (≤640px,
 * admin.css .admin-card) do the fields wrap below the title.
 * @param {HTMLElement} container
 * @param {Array} rows - each with a unique `id`
 * @param {Array<{key:string,label:string,render?:(row)=>string,primary?:boolean}>} columns
 * @param {{onEdit?: (row)=>void, onDelete?: (row)=>void}} actions
 * @param {{animate?: boolean, empty?: string}} [options] - animate defaults
 *   to true; live search callers pass false so re-filtering on every
 *   keystroke doesn't replay the list's entrance animation each time.
 */
export function renderTable(container, rows, columns, actions, { animate = true, empty = "Nessun elemento." } = {}) {
  if (rows.length === 0) {
    container.innerHTML = `<p class="page-empty">${empty}</p>`;
    return;
  }

  const cell = (c, row) => (c.render ? c.render(row) : escapeHtml(row[c.key] ?? ""));
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const fields = columns.filter((c) => c !== primary && c.label);
  const extras = columns.filter((c) => c !== primary && !c.label);

  container.innerHTML = `<div class="history-panel no-scroll admin-card-list${animate ? "" : " no-entrance-anim"}"><div class="history-scroll">
      ${rows
        .map(
          (row) => `
        <div class="history-item admin-card" data-id="${row.id}" style="--admin-fields:${fields.length}">
          <div class="admin-card-body">
            <div class="admin-card-title">${cell(primary, row)}</div>
            ${fields
              .map(
                (c) => `<div class="admin-card-field">
              <span class="admin-card-label">${c.label}</span>
              <span class="admin-card-value">${cell(c, row)}</span>
            </div>`
              )
              .join("")}
          </div>
          <div class="row-actions admin-card-actions">
            ${extras.map((c) => cell(c, row)).join("")}
            ${
              actions.onEdit
                ? `<button type="button" class="icon-btn icon-btn-edit" data-action="edit" aria-label="Modifica" title="Modifica">${EDIT_ICON_SVG}</button>`
                : ""
            }
            ${
              actions.onDelete
                ? `<button type="button" class="icon-btn icon-btn-delete" data-action="delete" aria-label="Elimina" title="Elimina">${DELETE_ICON_SVG}</button>`
                : ""
            }
          </div>
        </div>`
        )
        .join("")}
    </div></div>`;

  container.querySelectorAll(".admin-card[data-id]").forEach((card) => {
    const row = rows.find((r) => String(r.id) === card.dataset.id);
    card.querySelector('[data-action="edit"]')?.addEventListener("click", () => actions.onEdit(row));
    card.querySelector('[data-action="delete"]')?.addEventListener("click", () => actions.onDelete(row));
  });
}

// A single clickable pill combining an open/closed status badge (same
// .badge-status look as the public site's) with the action to flip it —
// one button instead of a status badge plus a separate "Chiudi"/"Riapri"
// one. kind picks the grammatical gender: "league" (la lega → Aperta) or
// "event" (l'evento → Aperto).
const STATUS_LABELS = {
  league: { open: "Aperta", closed: "Chiusa" },
  event: { open: "Aperto", closed: "Chiuso" },
};

function statusToggle(isOpen, kind) {
  return {
    className: `badge-status badge-status-toggle ${isOpen ? "badge-status-open" : "badge-status-closed"}`,
    label: STATUS_LABELS[kind][isOpen ? "open" : "closed"],
    title: isOpen ? "Clic per chiudere" : "Clic per riaprire",
  };
}

// For list rows: callers wire up the click the same way they already do for
// any other data-toggle button (see leagues-admin.js/events-admin.js).
export function statusToggleButton(isOpen, id, kind) {
  const { className, label, title } = statusToggle(isOpen, kind);
  return `<button type="button" class="${className}" data-toggle="${id}" title="${title}">${label}</button>`;
}

// For a toggle button that already exists in the page (the event's
// Iscritti/Partite title bars): re-skins it in place to the current state.
export function setStatusToggle(button, isOpen, kind) {
  const { className, label, title } = statusToggle(isOpen, kind);
  button.className = className;
  button.textContent = label;
  button.title = title;
}

export function setMessage(el, text, isError) {
  el.textContent = text;
  el.className = "form-message" + (isError ? " is-error" : text ? " is-ok" : "");
}

/**
 * Replaces a <select>'s options while keeping its current selection if the
 * previously selected value still exists among the new options. Used so a
 * dropdown can be refreshed live (e.g. a newly-added commander) without
 * losing whatever the admin had already picked in a form.
 */
export function fillSelect(selectEl, optionsHtml) {
  const previous = selectEl.value;
  selectEl.innerHTML = optionsHtml;
  if (previous && Array.from(selectEl.options).some((o) => o.value === previous)) {
    selectEl.value = previous;
  }
}
