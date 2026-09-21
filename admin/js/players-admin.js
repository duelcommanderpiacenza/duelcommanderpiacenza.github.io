import { Players, Badges } from "../../js/db.js";
import { renderTable, setMessage, fillSelect } from "./crud-ui.js";
import { emit, on } from "./bus.js";

export function initPlayersAdmin() {
  const listEl = document.getElementById("players-admin-list");
  const searchField = document.getElementById("players-admin-search");
  const form = document.getElementById("players-admin-form");
  const idField = document.getElementById("players-admin-id");
  const nameField = document.getElementById("players-admin-name");
  const handleField = document.getElementById("players-admin-handle");
  const badge1Field = document.getElementById("players-admin-badge1");
  const badge2Field = document.getElementById("players-admin-badge2");
  const msgEl = document.getElementById("players-admin-message");
  const cancelBtn = document.getElementById("players-admin-cancel");

  let allPlayers = [];

  // These are the only 2 manually assignable badges — a player can show up
  // to 2 more automatically, computed live from badges.auto_rule
  // (js/auto-badges.js) and merged in on the public Giocatori page, never
  // stored on the player row at all. A badge with an auto_rule is computed,
  // not picked, so it's excluded here — it can only ever be earned, never
  // manually handed out.
  async function populateBadges() {
    const badges = await Badges.list();
    const manualBadges = badges.filter((b) => !b.auto_rule);
    const options =
      '<option value="">&mdash; nessuno &mdash;</option>' +
      manualBadges.map((b) => `<option value="${b.id}">${b.icon} ${b.name}</option>`).join("");
    fillSelect(badge1Field, options);
    fillSelect(badge2Field, options);
  }

  // Live filter over the already-fetched list, so it's easy to check
  // whether a player has already been entered before adding a duplicate.
  function renderList() {
    const term = searchField.value.trim().toLowerCase();
    const visible = term
      ? allPlayers.filter((p) => `${p.name} ${p.handle ?? ""}`.toLowerCase().includes(term))
      : allPlayers;
    if (term && visible.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun giocatore corrisponde alla ricerca.</p>';
      return;
    }
    renderTable(
      listEl,
      visible,
      [
        { key: "name", label: "Nome" },
        { key: "handle", label: "Handle" },
        {
          key: "badges",
          label: "Badge",
          render: (r) => [r.badge1, r.badge2].filter(Boolean).map((b) => b.icon).join(" ") || "—",
        },
      ],
      { onEdit, onDelete }
    );
  }

  async function refresh() {
    try {
      allPlayers = await Players.list();
      renderList();
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
      console.error(err);
    }
  }

  searchField.addEventListener("input", renderList);

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    handleField.value = row.handle ?? "";
    badge1Field.value = row.badge1?.id ?? "";
    badge2Field.value = row.badge2?.id ?? "";
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
    const badgeIds = [badge1Field.value, badge2Field.value].filter(Boolean);
    if (new Set(badgeIds).size !== badgeIds.length) {
      setMessage(msgEl, "Seleziona badge diversi tra loro.", true);
      return;
    }
    const payload = {
      name: nameField.value.trim(),
      handle: handleField.value.trim() || null,
      badge1_id: badge1Field.value || null,
      badge2_id: badge2Field.value || null,
    };
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

  on("badges:changed", populateBadges);

  Promise.all([populateBadges(), refresh()]);
}
