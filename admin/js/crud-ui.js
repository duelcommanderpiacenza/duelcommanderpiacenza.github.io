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
 * Renders a simple admin list table with per-row Edit/Delete buttons.
 * @param {HTMLElement} container
 * @param {Array} rows
 * @param {Array<{key:string,label:string,render?:(row)=>string}>} columns
 * @param {{onEdit?: (row)=>void, onDelete: (row)=>void}} actions
 * @param {{animate?: boolean}} [options] - animate defaults to true; live
 *   search callers pass false so re-filtering on every keystroke doesn't
 *   replay .data-table-wrap's entrance animation each time.
 */
export function renderTable(container, rows, columns, actions, { animate = true } = {}) {
  if (rows.length === 0) {
    container.innerHTML = '<p class="page-empty">Nessun elemento.</p>';
    return;
  }

  container.innerHTML = `<div class="data-table-wrap${animate ? "" : " no-entrance-anim"}"><table class="data-table">
    <thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr></thead>
    <tbody>
      ${rows
        .map(
          (row) => `
        <tr data-id="${row.id}">
          ${columns
            .map((c) => `<td>${c.render ? c.render(row) : escapeHtml(row[c.key] ?? "")}</td>`)
            .join("")}
          <td>
            <div class="row-actions">
              ${
                actions.onEdit
                  ? `<button type="button" class="icon-btn icon-btn-edit" data-action="edit" aria-label="Modifica" title="Modifica">${EDIT_ICON_SVG}</button>`
                  : ""
              }
              <button type="button" class="icon-btn icon-btn-delete" data-action="delete" aria-label="Elimina" title="Elimina">${DELETE_ICON_SVG}</button>
            </div>
          </td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table></div>`;

  container.querySelectorAll("tr[data-id]").forEach((tr) => {
    const row = rows.find((r) => String(r.id) === tr.dataset.id);
    const editBtn = tr.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.addEventListener("click", () => actions.onEdit(row));
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => actions.onDelete(row));
  });
}

// A single clickable pill combining an open/closed status badge (same
// .badge-status look as the public site's) with the action
// to flip it — one row-actions button and one table column fewer than
// having both a status badge and a separate "Chiudi"/"Riapri" button side
// by side. Callers wire up the click the same way they already do for any
// other data-toggle button (see leagues-admin.js/events-admin.js).
export function statusToggleButton(isOpen, id) {
  return `<button type="button" class="badge-status badge-status-toggle ${
    isOpen ? "badge-status-open" : "badge-status-closed"
  }" data-toggle="${id}" title="${isOpen ? "Clic per chiudere" : "Clic per riaprire"}">${
    isOpen ? "Aperta" : "Chiusa"
  }</button>`;
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
