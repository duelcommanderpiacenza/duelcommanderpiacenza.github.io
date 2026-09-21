import { Badges } from "../../js/db.js";
import { renderTable, setMessage } from "./crud-ui.js";
import { emit } from "./bus.js";

export function initBadgesAdmin() {
  const listEl = document.getElementById("badges-admin-list");
  const searchField = document.getElementById("badges-admin-search");
  const form = document.getElementById("badges-admin-form");
  const idField = document.getElementById("badges-admin-id");
  const nameField = document.getElementById("badges-admin-name");
  const msgEl = document.getElementById("badges-admin-message");
  const cancelBtn = document.getElementById("badges-admin-cancel");
  const iconRadios = () => Array.from(document.querySelectorAll('input[name="badges-admin-icon"]'));

  let allBadges = [];

  // Live filter over the already-fetched list, so it's easy to check
  // whether a badge already exists before adding a duplicate.
  function renderList() {
    const term = searchField.value.trim().toLowerCase();
    const visible = term ? allBadges.filter((b) => b.name.toLowerCase().includes(term)) : allBadges;
    if (term && visible.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun badge corrisponde alla ricerca.</p>';
      return;
    }
    renderTable(
      listEl,
      visible,
      [
        { key: "icon", label: "Icona", render: (r) => `<span style="font-size:1.3rem;">${r.icon}</span>` },
        { key: "name", label: "Nome" },
      ],
      { onEdit, onDelete }
    );
  }

  async function refresh() {
    try {
      allBadges = await Badges.list();
      renderList();
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  searchField.addEventListener("input", renderList);

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    iconRadios().forEach((radio) => {
      radio.checked = radio.value === row.icon;
    });
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
    if (!confirm(`Eliminare il badge "${row.name}"?`)) return;
    try {
      await Badges.remove(row.id);
      await refresh();
      emit("badges:changed");
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const icon = iconRadios().find((radio) => radio.checked)?.value;
    if (!icon) {
      setMessage(msgEl, "Seleziona un'icona.", true);
      return;
    }
    const payload = { name: nameField.value.trim(), icon };
    if (!payload.name) return;
    try {
      if (idField.value) await Badges.update(idField.value, payload);
      else await Badges.create(payload);
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
      emit("badges:changed");
    } catch (err) {
      console.error(err);
      setMessage(msgEl, `Errore nel salvataggio${err?.message ? `: ${err.message}` : " (nome forse duplicato)."}`, true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  refresh();
}
