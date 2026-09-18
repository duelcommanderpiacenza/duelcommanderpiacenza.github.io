import { Leagues } from "../../js/db.js";
import { statusBadge } from "../../js/ui.js";
import { renderTable, setMessage } from "./crud-ui.js";

/**
 * Top of the pyramid: leagues are flat (like players/commanders), but each
 * row also offers a "Manage events" action that drills into that league,
 * plus a toggle for open/closed (open = ongoing, shown as the homepage's
 * current league; closing it doesn't hide its already-closed events).
 */
export function initLeaguesAdmin({ onOpenLeague }) {
  const listEl = document.getElementById("leagues-admin-list");
  const form = document.getElementById("leagues-admin-form");
  const idField = document.getElementById("leagues-admin-id");
  const nameField = document.getElementById("leagues-admin-name");
  const msgEl = document.getElementById("leagues-admin-message");
  const cancelBtn = document.getElementById("leagues-admin-cancel");

  let leagues = [];

  async function refresh() {
    try {
      leagues = await Leagues.list();
      renderTable(
        listEl,
        leagues,
        [
          { key: "name", label: "Nome" },
          { key: "status", label: "Stato", render: (l) => statusBadge(l.is_open) },
          {
            key: "manage",
            label: "",
            render: (l) => `
              <div class="row-actions">
                <button type="button" class="btn-secondary" data-toggle="${l.id}">${l.is_open ? "Chiudi" : "Riapri"}</button>
                <button type="button" class="btn-secondary" data-open="${l.id}">Gestisci eventi &rarr;</button>
              </div>`,
          },
        ],
        { onEdit, onDelete }
      );
      listEl.querySelectorAll("[data-open]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const league = leagues.find((l) => l.id === btn.dataset.open);
          if (league) onOpenLeague(league);
        });
      });
      listEl.querySelectorAll("[data-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const league = leagues.find((l) => l.id === btn.dataset.toggle);
          if (league) onToggleOpen(league);
        });
      });
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onToggleOpen(row) {
    try {
      await Leagues.update(row.id, { is_open: !row.is_open });
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'aggiornamento dello stato.", true);
    }
  }

  async function onDelete(row) {
    if (!confirm(`Eliminare la lega "${row.name}"? Verranno rimossi anche i suoi eventi, iscritti e partite.`)) return;
    try {
      await Leagues.remove(row.id);
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { name: nameField.value.trim() };
    if (!payload.name) return;
    try {
      if (idField.value) await Leagues.update(idField.value, payload);
      else await Leagues.create(payload);
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
