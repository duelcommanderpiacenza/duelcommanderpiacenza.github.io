import { Announcements } from "../../js/db.js";
import { formatDate } from "../../js/ui.js";
import { renderTable, setMessage } from "./crud-ui.js";

/**
 * Flat, always-editable list — shown on the public Bacheca homepage
 * whenever at least one exists (the section there is hidden entirely
 * otherwise). No auto-expiry/pinning: the admin just deletes one when it's
 * no longer relevant.
 */
export function initAnnouncementsAdmin() {
  const listEl = document.getElementById("announcements-admin-list");
  const searchField = document.getElementById("announcements-admin-search");
  const form = document.getElementById("announcements-admin-form");
  const idField = document.getElementById("announcements-admin-id");
  const titleField = document.getElementById("announcements-admin-title");
  const bodyField = document.getElementById("announcements-admin-body");
  const msgEl = document.getElementById("announcements-admin-message");
  const cancelBtn = document.getElementById("announcements-admin-cancel");

  let announcements = [];

  // Live filter over the already-fetched (and already newest-first) list,
  // so it's easy to check whether an announcement already exists before
  // adding a duplicate.
  function renderList(animate = true) {
    const term = searchField.value.trim().toLowerCase();
    const visible = term ? announcements.filter((a) => a.title.toLowerCase().includes(term)) : announcements;
    if (term && visible.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun annuncio corrisponde alla ricerca.</p>';
      return;
    }
    renderTable(
      listEl,
      visible,
      [
        { key: "title", label: "Titolo" },
        { key: "created_at", label: "Data", render: (r) => formatDate(r.created_at) },
      ],
      { onEdit, onDelete },
      { animate }
    );
  }

  searchField.addEventListener("input", () => renderList(false));

  async function refresh() {
    try {
      announcements = await Announcements.list();
      renderList();
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    titleField.value = row.title;
    bodyField.value = row.body;
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
    if (!confirm(`Eliminare l'annuncio "${row.title}"?`)) return;
    try {
      await Announcements.remove(row.id);
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      title: titleField.value.trim(),
      body: bodyField.value.trim(),
    };
    if (!payload.title || !payload.body) return;
    try {
      if (idField.value) await Announcements.update(idField.value, payload);
      else await Announcements.create(payload);
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
    } catch (err) {
      setMessage(msgEl, "Errore nel salvataggio.", true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  refresh();
}
