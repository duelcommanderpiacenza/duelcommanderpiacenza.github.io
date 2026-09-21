import { escapeHtml } from "../../js/ui.js";

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
          <td class="row-actions">
            ${actions.onEdit ? '<button type="button" class="btn-secondary" data-action="edit">Modifica</button>' : ""}
            <button type="button" class="btn-danger" data-action="delete">Elimina</button>
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
