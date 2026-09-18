import { Commanders } from "../../js/db.js";
import { colorIdentityPips } from "../../js/ui.js";
import { renderTable, setMessage } from "./crud-ui.js";
import { emit } from "./bus.js";

export function initCommandersAdmin() {
  const listEl = document.getElementById("commanders-admin-list");
  const form = document.getElementById("commanders-admin-form");
  const idField = document.getElementById("commanders-admin-id");
  const nameField = document.getElementById("commanders-admin-name");
  const msgEl = document.getElementById("commanders-admin-message");
  const cancelBtn = document.getElementById("commanders-admin-cancel");
  const colorlessBox = document.getElementById("commanders-admin-colorless");
  const colorBoxes = () => Array.from(document.querySelectorAll('input[name="commanders-admin-color"]'));

  colorBoxes().forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) colorlessBox.checked = false;
    });
  });
  colorlessBox.addEventListener("change", () => {
    if (colorlessBox.checked) colorBoxes().forEach((box) => (box.checked = false));
  });

  async function refresh() {
    try {
      const commanders = await Commanders.list();
      renderTable(
        listEl,
        commanders,
        [
          { key: "name", label: "Nome" },
          { key: "color_identity", label: "Colori", render: (r) => colorIdentityPips(r.color_identity) },
        ],
        { onEdit, onDelete }
      );
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    const letters = (row.color_identity || "").toUpperCase();
    colorBoxes().forEach((box) => {
      box.checked = letters.includes(box.value);
    });
    colorlessBox.checked = letters.length === 0;
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
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
    const payload = { name: nameField.value.trim(), color_identity: colorIdentity };
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
