import { Leagues } from "../../js/db.js";
import { statusBadge } from "../../js/ui.js";
import { renderTable, setMessage } from "./crud-ui.js";

// The proactive close-before-open/create calls should normally prevent this
// constraint from ever being hit, but it's still the real, ultimate
// guarantee (e.g. a race with another admin tab) — so surface it plainly
// rather than falling through to a generic message when it does fire.
function describeError(err, fallback) {
  if (err?.code === "23505" && err?.message?.includes("leagues_only_one_open_idx")) {
    return "Non possono esistere due leghe (o due Topdeck) dello stesso tipo aperte contemporaneamente. Chiudi quella attualmente aperta di questo tipo per crearne o aprirne un'altra.";
  }
  return fallback;
}

/**
 * Top of the pyramid: leagues are flat (like players/commanders), but each
 * row also offers a "Manage events" action that drills into that league,
 * plus a toggle for open/closed (open = ongoing, shown as the homepage's
 * current league; closing it doesn't hide its already-closed events).
 * A row can also be a "Topdeck" series — same shape, just no points
 * leaderboard and never featured on the homepage (see is_topdeck in db.js).
 */
export function initLeaguesAdmin({ onOpenLeague }) {
  const listEl = document.getElementById("leagues-admin-list");
  const form = document.getElementById("leagues-admin-form");
  const idField = document.getElementById("leagues-admin-id");
  const nameField = document.getElementById("leagues-admin-name");
  const topdeckField = document.getElementById("leagues-admin-topdeck");
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
          { key: "type", label: "Tipo", render: (l) => (l.is_topdeck ? "Topdeck" : "Lega") },
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
    topdeckField.checked = !!row.is_topdeck;
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onToggleOpen(row) {
    try {
      // At most one league, and separately at most one Topdeck, is open at
      // a time — opening this one closes every other open row of the same
      // kind first (a league and a Topdeck can be open together).
      if (!row.is_open) await Leagues.closeOtherOpenOfType(row.is_topdeck, row.id);
      await Leagues.update(row.id, { is_open: !row.is_open });
      await refresh();
    } catch (err) {
      setMessage(msgEl, describeError(err, "Errore nell'aggiornamento dello stato."), true);
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
    const payload = { name: nameField.value.trim(), is_topdeck: topdeckField.checked };
    if (!payload.name) return;
    try {
      if (idField.value) {
        await Leagues.update(idField.value, payload);
      } else {
        // A new league/topdeck defaults to open, and only one of each kind
        // may be — close whatever else of that same kind was open *before*
        // inserting, or the insert itself would violate that uniqueness
        // the instant another row of that kind is still open.
        await Leagues.closeAllOpenOfType(payload.is_topdeck);
        await Leagues.create(payload);
      }
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
    } catch (err) {
      setMessage(msgEl, describeError(err, "Errore nel salvataggio."), true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  refresh();
}
