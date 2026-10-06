import { AdminUsers, Players } from "../../js/db.js";
import { escapeHtml, formatDate } from "../../js/ui.js";
import { renderTable, setMessage, fillSelect } from "./crud-ui.js";
import { on } from "./bus.js";
import { setTabCount } from "./tab-counts.js";

/**
 * "Utenti": the login accounts (players sign in with Google on
 * account.html) and their link to a player (PLAYER_LOGIN.md, step 3).
 * Pending link requests on top (approve / reject); below, every account with
 * its linked player, an Attivo/Bloccato toggle and delete, and a form to
 * link an account to any player directly or unlink it. Everything goes
 * through the admin-only functions of supabase/migrations/003_admin_users.sql
 * (js/db.js's AdminUsers).
 */

// The functions' error codes (raised as the error message).
const ERROR_TEXT = {
  not_admin: "Operazione riservata agli amministratori.",
  user_not_found: "Account non trovato: ricarica la pagina.",
  claim_not_found: "La richiesta non c'è più: ricarica la pagina.",
  player_not_found: "Giocatore non trovato: ricarica la pagina.",
  admin_account: "Un account amministratore non può essere bloccato o eliminato da qui.",
};

function errorText(err, fallback) {
  console.error(err);
  return ERROR_TEXT[err?.message] ?? fallback;
}

function playerLabel(name, handle) {
  return handle ? `${name} (${handle})` : name;
}

export function initUsersAdmin() {
  const requestsEl = document.getElementById("users-admin-requests");
  const requestsCountEl = document.getElementById("users-admin-requests-count");
  const listEl = document.getElementById("users-admin-list");
  const searchField = document.getElementById("users-admin-search");
  const form = document.getElementById("users-admin-form");
  const idField = document.getElementById("users-admin-id");
  const selectedEl = document.getElementById("users-admin-selected");
  const playerField = document.getElementById("users-admin-player");
  const msgEl = document.getElementById("users-admin-message");
  const cancelBtn = document.getElementById("users-admin-cancel");

  let users = [];
  let players = [];

  // --- Pending requests -------------------------------------------------------

  function renderRequests() {
    const pending = users.filter((u) => u.claim_player_id);
    requestsCountEl.textContent = pending.length ? `(${pending.length})` : "";
    // The same number on the "Utenti" tab (and, on touch screens, the nav pill).
    setTabCount("users", pending.length);
    if (pending.length === 0) {
      requestsEl.innerHTML = '<p class="page-empty">Nessuna richiesta in attesa.</p>';
      return;
    }
    // One card per request (crud-ui.js): the account, the player asked for
    // and when, Approva / Rifiuta on the right.
    renderTable(
      requestsEl,
      pending.map((u) => ({ ...u, id: u.user_id })),
      [
        { key: "email", label: "Account", render: (u) => escapeHtml(u.email) },
        {
          key: "claim",
          label: "Giocatore richiesto",
          render: (u) => escapeHtml(playerLabel(u.claim_player_name, u.claim_player_handle)),
        },
        { key: "claim_created_at", label: "Richiesta del", render: (u) => formatDate(u.claim_created_at) },
        {
          key: "actions",
          label: "",
          render: (u) => `
              <button type="button" class="btn-primary" data-approve="${u.user_id}">Approva</button>
              <button type="button" class="btn-secondary" data-reject="${u.user_id}">Rifiuta</button>`,
        },
      ],
      {}
    );

    requestsEl.querySelectorAll("[data-approve]").forEach((btn) =>
      btn.addEventListener("click", () => act(() => AdminUsers.approveClaim(btn.dataset.approve), "Richiesta approvata."))
    );
    requestsEl.querySelectorAll("[data-reject]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (!confirm("Rifiutare questa richiesta?")) return;
        act(() => AdminUsers.rejectClaim(btn.dataset.reject), "Richiesta rifiutata.");
      })
    );
  }

  // --- Accounts -----------------------------------------------------------------

  function statusCell(u) {
    if (u.is_admin) return '<span class="badge-status badge-status-admin">Admin</span>';
    return `<button type="button" class="badge-status badge-status-toggle ${
      u.is_blocked ? "badge-status-closed" : "badge-status-open"
    }" data-block="${u.user_id}" title="${u.is_blocked ? "Clic per sbloccare" : "Clic per bloccare"}">${
      u.is_blocked ? "Bloccato" : "Attivo"
    }</button>`;
  }

  function playerCell(u) {
    if (u.player_id) return escapeHtml(playerLabel(u.player_name, u.player_handle));
    if (u.claim_player_id) {
      return `<span class="users-admin-pending">richiesto: ${escapeHtml(playerLabel(u.claim_player_name, u.claim_player_handle))}</span>`;
    }
    return "—";
  }

  function renderList(animate = true) {
    const term = searchField.value.trim().toLowerCase();
    const visible = term
      ? users.filter((u) =>
          [u.email, u.player_name, u.player_handle].some((v) => v && v.toLowerCase().includes(term))
        )
      : users;
    if (users.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun account ancora.</p>';
      return;
    }
    if (visible.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun account corrisponde alla ricerca.</p>';
      return;
    }
    renderTable(
      listEl,
      visible.map((u) => ({ ...u, id: u.user_id })),
      [
        { key: "email", label: "Account", render: (u) => escapeHtml(u.email) },
        { key: "created_at", label: "Registrato", render: (u) => formatDate(u.created_at) },
        { key: "last_sign_in_at", label: "Ultimo accesso", render: (u) => formatDate(u.last_sign_in_at) },
        { key: "player", label: "Giocatore", render: playerCell },
        { key: "status", label: "Stato", render: statusCell },
      ],
      { onEdit, onDelete },
      { animate }
    );
    listEl.querySelectorAll("[data-block]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const u = users.find((x) => x.user_id === btn.dataset.block);
        if (!u) return;
        if (!u.is_blocked && !confirm(`Bloccare ${u.email}? Non potrà più accedere finché non lo sblocchi.`)) return;
        act(
          () => AdminUsers.setBlocked(u.user_id, !u.is_blocked),
          u.is_blocked ? "Account sbloccato." : "Account bloccato.",
          false
        );
      })
    );
  }

  searchField.addEventListener("input", () => renderList(false));

  // --- Link form ----------------------------------------------------------------

  // Only the players no account is linked to yet — plus the selected
  // account's own, so its current link still shows (and "nessun giocatore"
  // unlinks it). A player someone has asked for but isn't linked to stays in
  // the list, marked with who asked: linking it here settles that request.
  // To move a player from one account to another, unlink it first.
  function renderPlayerOptions() {
    const selectedUserId = idField.value;
    const linkedPlayerIds = new Set(users.filter((u) => u.player_id && u.user_id !== selectedUserId).map((u) => u.player_id));
    const requestedBy = new Map(users.filter((u) => u.claim_player_id).map((u) => [u.claim_player_id, u.email]));
    fillSelect(
      playerField,
      '<option value="">&mdash; nessun giocatore &mdash;</option>' +
        players
          .filter((p) => !linkedPlayerIds.has(p.id))
          .map((p) => {
            const asker = requestedBy.get(p.id);
            return `<option value="${p.id}">${escapeHtml(playerLabel(p.name, p.handle))}${
              asker ? ` — richiesto da ${escapeHtml(asker)}` : ""
            }</option>`;
          })
          .join("")
    );
    playerField.value = users.find((u) => u.user_id === selectedUserId)?.player_id ?? "";
  }

  function onEdit(u) {
    idField.value = u.user_id;
    selectedEl.textContent = u.email;
    // The list depends on which account is selected (its own player is in it).
    renderPlayerOptions();
    setMessage(msgEl, "", false);
  }

  function resetForm() {
    idField.value = "";
    selectedEl.textContent = "Scegli un account dalla lista";
    renderPlayerOptions();
    setMessage(msgEl, "", false);
  }

  async function onDelete(u) {
    if (u.is_admin) {
      setMessage(msgEl, ERROR_TEXT.admin_account, true);
      return;
    }
    if (!confirm(`Eliminare definitivamente l'account ${u.email}? Il giocatore collegato e i suoi risultati restano.`)) {
      return;
    }
    await act(() => AdminUsers.remove(u.user_id), "Account eliminato.");
    if (idField.value === u.user_id) resetForm();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = idField.value;
    if (!userId) {
      setMessage(msgEl, "Scegli prima un account dalla lista (✎).", true);
      return;
    }
    const u = users.find((x) => x.user_id === userId);
    const playerId = playerField.value || null;
    const takenBy = playerId ? users.find((x) => x.player_id === playerId && x.user_id !== userId) : null;
    if (takenBy && !confirm(`Questo giocatore è collegato a ${takenBy.email}: spostarlo su ${u?.email ?? "questo account"}?`)) {
      return;
    }
    await act(() => AdminUsers.setPlayer(userId, playerId), playerId ? "Collegamento salvato." : "Collegamento rimosso.");
  });

  cancelBtn.addEventListener("click", resetForm);

  // --- Shared ---------------------------------------------------------------------

  // Runs one admin action, then reloads everything (one action can change
  // both lists: e.g. approving moves a row from the requests to the links).
  async function act(fn, okText, animate = true) {
    setMessage(msgEl, "", false);
    try {
      await fn();
    } catch (err) {
      setMessage(msgEl, errorText(err, "Operazione non riuscita, riprova."), true);
      return;
    }
    await refresh(animate);
    setMessage(msgEl, okText, false);
  }

  async function refresh(animate = true) {
    try {
      users = await AdminUsers.list();
      renderRequests();
      renderList(animate);
      renderPlayerOptions();
    } catch (err) {
      setMessage(msgEl, errorText(err, "Errore nel caricamento degli account."), true);
    }
  }

  async function loadPlayers() {
    try {
      players = await Players.list();
      renderPlayerOptions();
    } catch (err) {
      console.error(err);
    }
  }

  on("players:changed", loadPlayers);

  resetForm();
  loadPlayers();
  refresh();
}
