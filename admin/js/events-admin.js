import { Events } from "../../js/db.js";
import { formatDate, formatTime, statusBadge } from "../../js/ui.js";
import { renderTable, setMessage } from "./crud-ui.js";
import { on } from "./bus.js";

/**
 * Middle of the pyramid: events always belong to whichever league was just
 * opened (no league picker — that's implicit from being drilled into). Each
 * row offers a "Manage entries/matches" action that drills further in, plus
 * an open/closed toggle: while open, the event's data stays admin-only;
 * closing it publishes it on the public site (enforced by RLS, not by any
 * filtering here).
 */
export function initEventsAdmin({ onOpenEvent }) {
  const listEl = document.getElementById("events-admin-list");
  const form = document.getElementById("events-admin-form");
  const idField = document.getElementById("events-admin-id");
  const nameField = document.getElementById("events-admin-name");
  const nameHintEl = document.getElementById("events-admin-name-hint");
  const dateField = document.getElementById("events-admin-date");
  const timeField = document.getElementById("events-admin-time");
  const msgEl = document.getElementById("events-admin-message");
  const cancelBtn = document.getElementById("events-admin-cancel");

  let currentLeague = null;
  let events = [];

  async function refresh() {
    if (!currentLeague) return;
    try {
      events = await Events.listByLeague(currentLeague.id);
      renderTable(
        listEl,
        events,
        [
          { key: "name", label: "Nome", render: (r) => r.name ?? "—" },
          { key: "event_date", label: "Data", render: (r) => formatDate(r.event_date) },
          { key: "start_time", label: "Orario", render: (r) => formatTime(r.start_time) ?? "—" },
          { key: "status", label: "Stato", render: (r) => statusBadge(r.is_open) },
          {
            key: "manage",
            label: "",
            render: (e) => `
              <div class="row-actions">
                <button type="button" class="btn-secondary" data-toggle="${e.id}">${e.is_open ? "Chiudi" : "Riapri"}</button>
                <button type="button" class="btn-secondary" data-open="${e.id}">Gestisci iscritti/partite &rarr;</button>
              </div>`,
          },
        ],
        { onEdit, onDelete }
      );
      listEl.querySelectorAll("[data-open]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const ev = events.find((e) => e.id === btn.dataset.open);
          if (ev) onOpenEvent(ev);
        });
      });
      listEl.querySelectorAll("[data-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const ev = events.find((e) => e.id === btn.dataset.toggle);
          if (ev) onToggleOpen(ev);
        });
      });
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name ?? "";
    dateField.value = row.event_date ?? "";
    timeField.value = formatTime(row.start_time) ?? "";
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onToggleOpen(row) {
    try {
      await Events.update(row.id, { is_open: !row.is_open });
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'aggiornamento dello stato.", true);
    }
  }

  async function onDelete(row) {
    if (!confirm(`Eliminare l'evento "${row.name ?? formatDate(row.event_date)}"? Verranno rimossi anche i suoi iscritti e partite.`)) return;
    try {
      await Events.remove(row.id);
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentLeague) return;
    const payload = {
      name: nameField.value.trim() || null,
      event_date: dateField.value || null,
      start_time: timeField.value || null,
      league_id: currentLeague.id,
    };
    // Only a Topdeck event can be left unnamed — the public site then shows
    // its date as the title instead. Any other league still requires a name.
    if (!payload.name && !currentLeague.is_topdeck) return;
    try {
      if (idField.value) await Events.update(idField.value, payload);
      else await Events.create(payload);
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
    } catch (err) {
      if (err?.code === "23505") {
        setMessage(msgEl, "Esiste già un evento con questo nome in questa lega.", true);
      } else {
        setMessage(msgEl, "Errore nel salvataggio.", true);
      }
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  // The event's open/closed state can also be toggled from the Matches
  // view (drilled further in), so this list needs to catch up when that
  // happens instead of showing a stale "Chiudi"/"Riapri" label.
  on("events:changed", () => {
    if (currentLeague) refresh();
  });

  function openLeague(league) {
    currentLeague = league;
    nameHintEl.textContent = league.is_topdeck ? "(opzionale per un Topdeck: se vuoto, verrà mostrata la data)" : "";
    resetForm();
    refresh();
  }

  return { openLeague };
}
