import { Events } from "../../js/db.js";
import { escapeHtml, formatDate, formatTime, isHttpUrl } from "../../js/ui.js";
import { renderTable, setMessage, statusToggleButton, onBusySubmit, runBusy, manageButton } from "./crud-ui.js";
import { on } from "./bus.js";
import { syncAutoBadges } from "./badges-sync.js";

/**
 * A flat list of events that don't belong to any league (league_id null) —
 * same shape as the per-league events list, just without a league to be
 * nested under. Drilling into "Gestisci iscritti/partite" hands the event
 * off to the same shared entries/matches flow the league pyramid uses.
 *
 * An external event ("Evento esterno", migration 026: played somewhere
 * else, only announced on the public Bacheca) has a Località and a Sito
 * (where in the town — "Milano - Il Labirinto") instead, and
 * neither entries/matches nor an open/closed state — no Gestisci, no
 * toggle; it stays open for good (events_external_open). Only a new event
 * can be made external (an existing one may already have entries); an
 * external one can be turned back into an ordinary one.
 */
export function initStandaloneEventsAdmin({ onOpenEvent }) {
  const listEl = document.getElementById("standalone-events-admin-list");
  const searchField = document.getElementById("standalone-events-admin-search");
  const form = document.getElementById("standalone-events-admin-form");
  const idField = document.getElementById("standalone-events-admin-id");
  const nameField = document.getElementById("standalone-events-admin-name");
  const dateField = document.getElementById("standalone-events-admin-date");
  const timeField = document.getElementById("standalone-events-admin-time");
  const resultsUrlField = document.getElementById("standalone-events-admin-results-url");
  const decklistsUrlField = document.getElementById("standalone-events-admin-decklists-url");
  const externalField = document.getElementById("standalone-events-admin-external");
  const externalHint = document.getElementById("standalone-events-admin-external-hint");
  const locationWrap = document.getElementById("standalone-events-admin-location-field");
  const locationField = document.getElementById("standalone-events-admin-location");
  const venueWrap = document.getElementById("standalone-events-admin-venue-field");
  const venueField = document.getElementById("standalone-events-admin-venue");
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
        {
          key: "status",
          label: "Stato",
          render: (r) =>
            r.is_external
              ? `<span class="admin-auto-chip">Esterno</span> ${escapeHtml([r.location, r.venue].filter(Boolean).join(" - "))}`
              : statusToggleButton(r.is_open, r.id, "event"),
        },
        {
          key: "manage",
          label: "",
          render: (e) =>
            e.is_external
              ? ""
              : `
              <div class="row-actions">
                ${manageButton(e.id, "Gestisci iscritti e partite")}
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
        if (ev) runBusy(btn, () => onToggleOpen(ev));
      });
    });
  }

  searchField.addEventListener("input", () => renderList(false));

  async function refresh(animate = true) {
    try {
      events = await Events.listStandalone();
      renderList(animate);
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  // The Località and Sito fields only for an external event; the checkbox only for a
  // new event or an external one (see the top of the file).
  function syncExternal(row = null) {
    const canChange = !row || Boolean(row.is_external);
    externalField.disabled = !canChange;
    externalHint.textContent = canChange ? "" : "Solo un evento nuovo può essere esterno.";
    locationWrap.hidden = !externalField.checked;
    venueWrap.hidden = !externalField.checked;
  }
  externalField.addEventListener("change", () => syncExternal(events.find((e) => e.id === idField.value) ?? null));

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    externalField.checked = Boolean(row.is_external);
    locationField.value = row.location ?? "";
    venueField.value = row.venue ?? "";
    syncExternal(row);
    dateField.value = row.event_date ?? "";
    timeField.value = formatTime(row.start_time) ?? "";
    resultsUrlField.value = row.results_url ?? "";
    decklistsUrlField.value = row.decklists_url ?? "";
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    syncExternal();
    setMessage(msgEl, "", false);
  }

  async function onToggleOpen(row) {
    const wasOpen = row.is_open;
    try {
      await Events.update(row.id, { is_open: !wasOpen });
      // Closed or reopened — see events-admin.js's own onToggleOpen for why
      // both count, and why this is fire-and-forget.
      syncAutoBadges().catch(console.error);
      // Just a status flip, not a changed row set — skip the list's
      // entrance animation so it reads as instant feedback, not a reload.
      await refresh(false);
    } catch (err) {
      setMessage(msgEl, "Errore nell'aggiornamento dello stato.", true);
    }
  }

  async function onDelete(row) {
    const question = row.is_external
      ? `Eliminare l'evento esterno "${row.name}"?`
      : `Eliminare l'evento "${row.name}"? Verranno rimossi anche i suoi iscritti e partite.`;
    if (!confirm(question)) return;
    try {
      await Events.remove(row.id);
      // Cascades away all of this event's entries/matches — same
      // fire-and-forget reasoning as onToggleOpen above. (An external one
      // has none: nothing to recompute.)
      if (!row.is_external) syncAutoBadges().catch(console.error);
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  onBusySubmit(form, async (e) => {
    e.preventDefault();
    const resultsUrl = resultsUrlField.value.trim();
    const decklistsUrl = decklistsUrlField.value.trim();
    // See events-admin.js's own submit handler for why this is checked here too.
    if ((resultsUrl && !isHttpUrl(resultsUrl)) || (decklistsUrl && !isHttpUrl(decklistsUrl))) {
      setMessage(msgEl, "Il link deve iniziare con http:// o https://.", true);
      return;
    }
    const payload = {
      name: nameField.value.trim(),
      event_date: dateField.value || null,
      start_time: timeField.value || null,
      results_url: resultsUrl || null,
      decklists_url: decklistsUrl || null,
      league_id: null,
    };
    if (!payload.name) return;
    // Sent only when it's (or was) external, so an ordinary event still saves
    // on a database without migration 026. External: open for good.
    const editing = events.find((e) => e.id === idField.value);
    if (externalField.checked || editing?.is_external) {
      payload.is_external = externalField.checked;
      payload.location = externalField.checked ? locationField.value.trim() || null : null;
      payload.venue = externalField.checked ? venueField.value.trim() || null : null;
      if (externalField.checked) payload.is_open = true;
    }
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
  // happens instead of showing a stale Aperto/Chiuso pill.
  on("events:changed", refresh);

  refresh();

  return {};
}
