// Click-to-sort <th> headers, shared by the Comandanti and Giocatori tables.
// A column opts in by providing `sortKey(row) => comparable value` — columns
// without one (color-identity pips, combined V-S-P/commander-name cells
// where a single scalar wouldn't mean much) render as plain, unsortable
// header text. `defaultDir` (default "asc") is which direction a column
// starts at on its first click — numeric/stat columns want "biggest first"
// (desc), text columns want A→Z (asc).

export function sortRows(rows, sort, columns) {
  const col = sort && columns.find((c) => c.key === sort.key);
  if (!col?.sortKey) return rows;
  const dir = sort.dir === "desc" ? -1 : 1;
  // Array.prototype.sort is stable, so ties keep whatever relative order
  // `rows` already had — which is usually already a sensible tiebreak
  // (e.g. alphabetical) set by the caller before this runs.
  return [...rows].sort((a, b) => {
    const av = col.sortKey(a);
    const bv = col.sortKey(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls/undefined always sort last, regardless of direction
    if (bv == null) return -1;
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return 0;
  });
}

// The little ▲/▼ next to a header's label is the only visual sort hint —
// shown only on the currently active column so it doesn't clutter every
// sortable header at once.
export function sortableHeadRow(columns, sort) {
  return `<tr>${columns
    .map((c) => {
      if (!c.sortKey) return `<th>${c.label}</th>`;
      const active = sort?.key === c.key;
      const arrow = active ? (sort.dir === "desc" ? "&#9660;" : "&#9650;") : "";
      return `<th class="sortable-th${active ? " is-sorted" : ""}">
        <button type="button" class="sortable-th-btn" data-sort-key="${c.key}">
          <span>${c.label}</span><span class="sortable-th-arrow">${arrow}</span>
        </button>
      </th>`;
    })
    .join("")}</tr>`;
}

// Delegates from containerEl (the table wrapper, freshly re-rendered each
// call) rather than needing individual listeners re-attached — cheap since
// there are only ever a handful of header buttons.
export function bindSortableHead(containerEl, columns, sort, onSortChange) {
  containerEl.querySelectorAll("[data-sort-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sortKey;
      const col = columns.find((c) => c.key === key);
      const next =
        sort?.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: col?.defaultDir ?? "asc" };
      onSortChange(next);
    });
  });
}
