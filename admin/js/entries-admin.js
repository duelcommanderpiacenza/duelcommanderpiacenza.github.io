import { Players, Commanders, EventEntries } from "../../js/db.js";
import { archetypeBadge, escapeHtml } from "../../js/ui.js";
import { renderTable, setMessage, setNote, fillSelect, onBusySubmit } from "./crud-ui.js";
import { emit, on } from "./bus.js";

/**
 * Bottom of the pyramid: an entry is just "this player played this
 * commander/archetype in this event" — the event is always whichever one
 * was drilled into (no event picker here).
 * An online event's entrant can also be a free-form player — "Giocatore
 * non registrato": just a name (event_entries.player_name, no player
 * record, migration 037), shown only in that event and its league.
 */
export function initEntriesAdmin() {
  const listEl = document.getElementById("entries-admin-list");
  const form = document.getElementById("entries-admin-form");
  const idField = document.getElementById("entries-admin-id");
  const playerField = document.getElementById("entries-admin-player");
  const playerWrap = document.getElementById("entries-admin-player-field");
  const freeRow = document.getElementById("entries-admin-free-row");
  const freeBox = document.getElementById("entries-admin-free");
  const freeNameWrap = document.getElementById("entries-admin-free-name-field");
  const freeNameField = document.getElementById("entries-admin-free-name");
  const commanderField = document.getElementById("entries-admin-commander");
  const partnerField = document.getElementById("entries-admin-partner");
  const archetypeField = document.getElementById("entries-admin-archetype");
  const msgEl = document.getElementById("entries-admin-message");
  const cancelBtn = document.getElementById("entries-admin-cancel");
  // How many players the event has so far, by the "Iscritti" heading —
  // updated with the list after every add / removal.
  const countEl = document.getElementById("entries-admin-count");

  function showCount(n) {
    if (!countEl) return;
    countEl.hidden = n == null;
    countEl.textContent = n == null ? "" : String(n);
    countEl.setAttribute("aria-label", n === 1 ? "1 giocatore" : `${n} giocatori`);
  }

  let currentEvent = null;
  let allPlayers = [];
  let currentEntries = [];
  let editingEntryId = null;

  const isOnline = () => Boolean(currentEvent?.is_online);
  const isFree = () => isOnline() && freeBox.checked;
  const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

  // "Giocatore non registrato" only in an online event; checked, the name
  // field instead of the player picker.
  function syncFree() {
    freeRow.hidden = !isOnline();
    const free = isFree();
    playerWrap.hidden = free;
    playerField.required = !free;
    freeNameWrap.hidden = !free;
    freeNameField.required = free;
  }
  freeBox.addEventListener("change", syncFree);

  // Once an event is closed its results are published — locking the form
  // stops new/edited entrants from silently changing an already-public
  // standing. Re-opening the event (its Aperto/Chiuso pill) unlocks it
  // again.
  function applyLockState() {
    const locked = currentEvent ? !currentEvent.is_open : false;
    form.querySelectorAll("input, select, button").forEach((el) => (el.disabled = locked));
    setNote(msgEl, locked ? "Evento chiuso: riaprilo per modificare gli iscritti." : "");
  }

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
    const available = allPlayers.filter((p) => !enteredIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, "it"));
    fillSelect(
      playerField,
      available.map((p) => `<option value="${p.id}">${p.name}${p.handle ? ` (${p.handle})` : ""}</option>`).join("")
    );
  }

  async function populateCommanders() {
    const commanders = (await Commanders.list()).sort((a, b) => a.name.localeCompare(b.name, "it"));
    const options = commanders.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
    fillSelect(commanderField, options);
    fillSelect(partnerField, '<option value="">&mdash; nessuno &mdash;</option>' + options);
  }

  async function refresh() {
    if (!currentEvent) {
      listEl.innerHTML = '<p class="page-empty">Nessun iscritto ancora.</p>';
      showCount(null);
      return;
    }
    try {
      // By name, like the player picker (the database gives no order).
      const entries = (await EventEntries.listByEvent(currentEvent.id)).sort((a, b) =>
        (a.player?.name ?? "").localeCompare(b.player?.name ?? "", "it")
      );
      currentEntries = entries;
      showCount(entries.length);
      updatePlayerOptions();
      renderTable(
        listEl,
        entries,
        [
          {
            key: "player",
            label: "Giocatore",
            render: (r) =>
              `${escapeHtml(r.player?.name ?? "")}${r.player_id ? "" : ' <span class="admin-card-muted">(non registrato)</span>'}`,
          },
          {
            key: "commander",
            label: "Commander",
            render: (r) => (r.partner_commander ? `${r.commander?.name} / ${r.partner_commander.name}` : r.commander?.name ?? ""),
          },
          { key: "archetype", label: "Archetipo", render: (r) => archetypeBadge(r.archetype, { link: false }) },
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
    freeBox.checked = !row.player_id;
    freeNameField.value = row.player_name ?? "";
    syncFree();
    if (row.player_id) playerField.value = row.player_id;
    commanderField.value = row.commander_id;
    partnerField.value = row.partner_commander_id ?? "";
    archetypeField.value = row.archetype;
  }

  function resetForm() {
    idField.value = "";
    editingEntryId = null;
    updatePlayerOptions();
    freeBox.checked = false;
    freeNameField.value = "";
    syncFree();
    partnerField.value = "";
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

  onBusySubmit(form, async (e) => {
    e.preventDefault();
    if (!currentEvent) return;
    if (partnerField.value && partnerField.value === commanderField.value) {
      setMessage(msgEl, "Il partner deve essere diverso dal commander principale.", true);
      return;
    }
    const free = isFree();
    const freeName = freeNameField.value.trim().replace(/\s+/g, " ");
    if (free && !freeName) {
      setMessage(msgEl, "Scrivi il nome del giocatore.", true);
      return;
    }
    if (free && currentEntries.some((en) => en.id !== editingEntryId && en.player_name && sameName(en.player_name, freeName))) {
      setMessage(msgEl, "Questo nome è già tra gli iscritti.", true);
      return;
    }
    const payload = {
      event_id: currentEvent.id,
      player_id: free ? null : playerField.value,
      commander_id: commanderField.value,
      partner_commander_id: partnerField.value || null,
      archetype: archetypeField.value,
      // No bonus_points here: set from the event leaderboard instead
      // (matches-admin.js), and left untouched by editing the entry.
    };
    // Only in an online event (or an entry that had one), so the rest still
    // saves on a database without migration 037.
    const editing = currentEntries.find((en) => en.id === editingEntryId);
    if (isOnline() || editing?.player_name) payload.player_name = free ? freeName : null;
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

  // Resolves once the entries are loaded and rendered (see matches-admin.js's
  // openEvent: app.js waits on it before revealing the view).
  function openEvent(event) {
    currentEvent = event;
    resetForm();
    applyLockState();
    return refresh();
  }

  Promise.all([populatePlayers(), populateCommanders()]);

  return { openEvent };
}
