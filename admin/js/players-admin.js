import { Players } from "../../js/db.js";
import { renderTable, setMessage } from "./crud-ui.js";
import { emit } from "./bus.js";

export function initPlayersAdmin() {
  const listEl = document.getElementById("players-admin-list");
  const form = document.getElementById("players-admin-form");
  const idField = document.getElementById("players-admin-id");
  const nameField = document.getElementById("players-admin-name");
  const handleField = document.getElementById("players-admin-handle");
  const msgEl = document.getElementById("players-admin-message");
  const cancelBtn = document.getElementById("players-admin-cancel");

  async function refresh() {
    try {
      const players = await Players.list();
      renderTable(
        listEl,
        players,
        [
          { key: "name", label: "Nome" },
          { key: "handle", label: "Handle" },
        ],
        { onEdit, onDelete }
      );
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
      console.error(err);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    handleField.value = row.handle ?? "";
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
    if (!confirm(`Eliminare il giocatore "${row.name}"?`)) return;
    try {
      await Players.remove(row.id);
      await refresh();
      emit("players:changed");
    } catch (err) {
      setMessage(msgEl, "Impossibile eliminare: questo giocatore ha probabilmente partite o iscrizioni collegate.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { name: nameField.value.trim(), handle: handleField.value.trim() || null };
    if (!payload.name) return;
    try {
      if (idField.value) await Players.update(idField.value, payload);
      else await Players.create(payload);
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
      emit("players:changed");
    } catch (err) {
      setMessage(msgEl, "Errore nel salvataggio.", true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  refresh();
}
