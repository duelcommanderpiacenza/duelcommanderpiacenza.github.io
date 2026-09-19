import { Players, Commanders, EventEntries } from "../../js/db.js";
import { archetypeBadge } from "../../js/ui.js";
import { renderTable, setMessage, fillSelect } from "./crud-ui.js";
import { emit, on } from "./bus.js";

/**
 * Bottom of the pyramid: an entry is just "this player played this
 * commander/archetype in this event" — the event is always whichever one
 * was drilled into (no event picker here).
 */
export function initEntriesAdmin() {
  const listEl = document.getElementById("entries-admin-list");
  const form = document.getElementById("entries-admin-form");
  const idField = document.getElementById("entries-admin-id");
  const playerField = document.getElementById("entries-admin-player");
  const commanderField = document.getElementById("entries-admin-commander");
  const partnerField = document.getElementById("entries-admin-partner");
  const archetypeField = document.getElementById("entries-admin-archetype");
  const bonusField = document.getElementById("entries-admin-bonus");
  const msgEl = document.getElementById("entries-admin-message");
  const cancelBtn = document.getElementById("entries-admin-cancel");

  let currentEvent = null;
  let allPlayers = [];
  let currentEntries = [];
  let editingEntryId = null;

  async function populatePlayers() {
    allPlayers = await Players.list();
    updatePlayerOptions();
  }

  // Only players who don't already have an entry for this event are
  // selectable — one commander assignment per player per event. When
  // editing an existing entry, that entry's own player stays selectable
  // (excluded from its own "already entered" set) so the value can be kept.
  function updatePlayerOptions() {
    const enteredIds = new Set(currentEntries.filter((e) => e.id !== editingEntryId).map((e) => e.player_id));
    const available = allPlayers.filter((p) => !enteredIds.has(p.id));
    fillSelect(
      playerField,
      available.map((p) => `<option value="${p.id}">${p.name}${p.handle ? ` (${p.handle})` : ""}</option>`).join("")
    );
  }

  async function populateCommanders() {
    const commanders = await Commanders.list();
    const options = commanders.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
    fillSelect(commanderField, options);
    fillSelect(partnerField, '<option value="">&mdash; nessuno &mdash;</option>' + options);
  }

  async function refresh() {
    if (!currentEvent) {
      listEl.innerHTML = '<p class="page-empty">Nessun iscritto ancora.</p>';
      return;
    }
    try {
      const entries = await EventEntries.listByEvent(currentEvent.id);
      currentEntries = entries;
      updatePlayerOptions();
      renderTable(
        listEl,
        entries,
        [
          { key: "player", label: "Giocatore", render: (r) => r.player?.name ?? "" },
          {
            key: "commander",
            label: "Commander",
            render: (r) => (r.partner_commander ? `${r.commander?.name} / ${r.partner_commander.name}` : r.commander?.name ?? ""),
          },
          { key: "archetype", label: "Archetipo", render: (r) => archetypeBadge(r.archetype) },
          { key: "bonus_points", label: "Bonus", render: (r) => (r.bonus_points ? `+${r.bonus_points}` : "—") },
        ],
        { onEdit, onDelete }
      );
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    editingEntryId = row.id;
    updatePlayerOptions();
    playerField.value = row.player_id;
    commanderField.value = row.commander_id;
    partnerField.value = row.partner_commander_id ?? "";
    archetypeField.value = row.archetype;
    bonusField.value = row.bonus_points ?? 0;
  }

  function resetForm() {
    idField.value = "";
    editingEntryId = null;
    updatePlayerOptions();
    partnerField.value = "";
    bonusField.value = 0;
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
    if (!confirm("Rimuovere questo iscritto?")) return;
    try {
      await EventEntries.remove(row.id);
      await refresh();
      emit("entries:changed");
    } catch (err) {
      setMessage(msgEl, "Impossibile eliminare: probabilmente ha partite collegate.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentEvent) return;
    if (partnerField.value && partnerField.value === commanderField.value) {
      setMessage(msgEl, "Il partner deve essere diverso dal commander principale.", true);
      return;
    }
    const payload = {
      event_id: currentEvent.id,
      player_id: playerField.value,
      commander_id: commanderField.value,
      partner_commander_id: partnerField.value || null,
      archetype: archetypeField.value,
      bonus_points: parseInt(bonusField.value, 10) || 0,
    };
    try {
      if (idField.value) await EventEntries.update(idField.value, payload);
      else await EventEntries.create(payload);
      resetForm();
      await refresh();
      setMessage(msgEl, "Iscritto salvato.", false);
      emit("entries:changed");
    } catch (err) {
      setMessage(msgEl, "Errore: questo giocatore ha forse già un iscritto per questo evento.", true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  on("players:changed", populatePlayers);
  on("commanders:changed", populateCommanders);

  function openEvent(event) {
    currentEvent = event;
    resetForm();
    refresh();
  }

  Promise.all([populatePlayers(), populateCommanders()]);

  return { openEvent };
}
