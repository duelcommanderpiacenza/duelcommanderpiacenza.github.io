import { Commanders, EventEntries } from "../../js/db.js";
import { colorIdentityPips } from "../../js/ui.js";
import { renderTable, setMessage } from "./crud-ui.js";
import { emit } from "./bus.js";

export function initCommandersAdmin() {
  const listEl = document.getElementById("commanders-admin-list");
  const searchField = document.getElementById("commanders-admin-search");
  const form = document.getElementById("commanders-admin-form");
  const idField = document.getElementById("commanders-admin-id");
  const nameField = document.getElementById("commanders-admin-name");
  const msgEl = document.getElementById("commanders-admin-message");
  const cancelBtn = document.getElementById("commanders-admin-cancel");
  const colorlessBox = document.getElementById("commanders-admin-colorless");
  const bannedBox = document.getElementById("commanders-admin-banned");
  const colorBoxes = () => Array.from(document.querySelectorAll('input[name="commanders-admin-color"]'));

  colorBoxes().forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) colorlessBox.checked = false;
    });
  });
  colorlessBox.addEventListener("change", () => {
    if (colorlessBox.checked) colorBoxes().forEach((box) => (box.checked = false));
  });

  let allCommanders = [];

  // Live filter over the already-fetched list, so it's easy to check
  // whether a commander has already been entered before adding a duplicate.
  function renderList(animate = true) {
    const term = searchField.value.trim().toLowerCase();
    const visible = term ? allCommanders.filter((c) => c.name.toLowerCase().includes(term)) : allCommanders;
    if (term && visible.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun comandante corrisponde alla ricerca.</p>';
      return;
    }
    renderTable(
      listEl,
      visible,
      [
        { key: "name", label: "Nome" },
        { key: "color_identity", label: "Colori", render: (r) => colorIdentityPips(r.color_identity) },
        { key: "is_banned", label: "Bannato", render: (r) => (r.is_banned ? "⚠️" : "—") },
      ],
      { onEdit, onDelete },
      { animate }
    );
  }

  async function refresh() {
    try {
      allCommanders = await Commanders.list();
      renderList();
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  searchField.addEventListener("input", () => renderList(false));

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    const letters = (row.color_identity || "").toUpperCase();
    colorBoxes().forEach((box) => {
      box.checked = letters.includes(box.value);
    });
    colorlessBox.checked = letters.length === 0;
    bannedBox.checked = row.is_banned ?? false;
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
    // Same rule as players (admin/js/players-admin.js): never deletable once
    // used in a closed (published) event; any entry at all (either seat,
    // primary or partner) also blocks it at the DB level (ON DELETE
    // RESTRICT), so open-event-only use needs those entries changed first.
    try {
      const entries = await EventEntries.listByCommander(row.id);
      const closed = new Set(entries.filter((e) => e.event && !e.event.is_open).map((e) => e.event.id)).size;
      if (closed > 0) {
        setMessage(msgEl, `Impossibile eliminare: il commander è usato in ${closed} ${closed === 1 ? "evento chiuso" : "eventi chiusi"}.`, true);
        return;
      }
      if (entries.length > 0) {
        setMessage(msgEl, "Impossibile eliminare: il commander è usato in eventi ancora aperti. Modifica prima quelle iscrizioni.", true);
        return;
      }
    } catch (err) {
      setMessage(msgEl, "Errore nel controllo degli utilizzi del commander.", true);
      return;
    }
    if (!confirm(`Eliminare il commander "${row.name}"?`)) return;
    try {
      await Commanders.remove(row.id);
      await refresh();
      emit("commanders:changed");
    } catch (err) {
      setMessage(msgEl, "Impossibile eliminare: probabilmente usato da un iscritto.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const colorIdentity = colorBoxes()
      .filter((b) => b.checked)
      .map((b) => b.value)
      .join("");
    const payload = { name: nameField.value.trim(), color_identity: colorIdentity, is_banned: bannedBox.checked };
    if (!payload.name) return;
    try {
      if (idField.value) await Commanders.update(idField.value, payload);
      else await Commanders.create(payload);
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
      emit("commanders:changed");
    } catch (err) {
      setMessage(msgEl, "Errore nel salvataggio (nome forse duplicato).", true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  refresh();
}
