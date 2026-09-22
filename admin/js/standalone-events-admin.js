import { Events } from "../../js/db.js";
import { formatDate, formatTime, statusBadge } from "../../js/ui.js";
import { renderTable, setMessage } from "./crud-ui.js";
import { on } from "./bus.js";

/**
 * A flat list of events that don't belong to any league (league_id null) —
 * same shape as the per-league events list, just without a league to be
 * nested under. Drilling into "Gestisci iscritti/partite" hands the event
 * off to the same shared entries/matches flow the league pyramid uses.
 */
export function initStandaloneEventsAdmin({ onOpenEvent }) {
  const listEl = document.getElementById("standalone-events-admin-list");
  const searchField = document.getElementById("standalone-events-admin-search");
  const form = document.getElementById("standalone-events-admin-form");
  const idField = document.getElementById("standalone-events-admin-id");
  const nameField = document.getElementById("standalone-events-admin-name");
  const dateField = document.getElementById("standalone-events-admin-date");
  const timeField = document.getElementById("standalone-events-admin-time");
  const msgEl = document.getElementById("standalone-events-admin-message");
  const cancelBtn = document.getElementById("standalone-events-admin-cancel");

  let events = [];

  // Live filter over the already-fetched list — already ordered newest
  // first by Events.listStandalone() itself, so filtering never disturbs
  // that order.
  function renderList(animate = true) {
    const term = searchField.value.trim().toLowerCase();
    const visible = term ? events.filter((e) => e.name.toLowerCase().includes(term)) : events;
    if (term && visible.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun evento corrisponde alla ricerca.</p>';
      return;
    }
    renderTable(
      listEl,
      visible,
      [
        { key: "name", label: "Nome" },
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
      { onEdit, onDelete },
      { animate }
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
  }

  searchField.addEventListener("input", () => renderList(false));

  async function refresh() {
    try {
      events = await Events.listStandalone();
      renderList();
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
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
    if (!confirm(`Eliminare l'evento "${row.name}"? Verranno rimossi anche i suoi iscritti e partite.`)) return;
    try {
      await Events.remove(row.id);
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: nameField.value.trim(),
      event_date: dateField.value || null,
      start_time: timeField.value || null,
      league_id: null,
    };
    if (!payload.name) return;
    try {
      if (idField.value) await Events.update(idField.value, payload);
      else await Events.create(payload);
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
    } catch (err) {
      if (err?.code === "23505") {
        setMessage(msgEl, "Esiste già un evento standalone con questo nome.", true);
      } else {
        setMessage(msgEl, "Errore nel salvataggio.", true);
      }
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  // The event's open/closed state can also be toggled from the Matches
  // view (drilled further in), so this list needs to catch up when that
  // happens instead of showing a stale "Chiudi"/"Riapri" label.
  on("events:changed", refresh);

  refresh();

  return {};
}
