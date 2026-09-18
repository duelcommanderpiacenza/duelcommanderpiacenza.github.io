import { EventEntries, Matches, Events } from "../../js/db.js";
import { escapeHtml } from "../../js/ui.js";
import { setMessage, fillSelect } from "./crud-ui.js";
import { on } from "./bus.js";

/**
 * Bottom of the pyramid, one level below entries: matches belong to
 * whichever event was drilled into. Rounds are presented as tabs — the "+"
 * tab bumps the event's `rounds` count and switches to the new tab; matches
 * are fetched once per event and filtered client-side by the active tab.
 * A match's score is a best-of-3 game count (player1_wins/draws/player2_wins)
 * rather than a single winner.
 */
export function initMatchesAdmin() {
  const roundTabsEl = document.getElementById("matches-round-tabs");
  const listEl = document.getElementById("matches-admin-list");
  const form = document.getElementById("matches-admin-form");
  const idField = document.getElementById("matches-admin-id");
  const player1Field = document.getElementById("matches-admin-player1");
  const player2Field = document.getElementById("matches-admin-player2");
  const p1WinsField = document.getElementById("matches-admin-p1wins");
  const drawsField = document.getElementById("matches-admin-draws");
  const p2WinsField = document.getElementById("matches-admin-p2wins");
  const msgEl = document.getElementById("matches-admin-message");
  const cancelBtn = document.getElementById("matches-admin-cancel");

  let currentEvent = null;
  let currentRound = 1;
  let allMatches = [];

  function scoreLabel(m) {
    return `${m.player1_wins}-${m.draws}-${m.player2_wins}`;
  }

  function renderRoundTabs() {
    const rounds = Math.max(1, currentEvent?.rounds ?? 1);
    let html = "";
    for (let r = 1; r <= rounds; r += 1) {
      html += `<span class="round-tab-wrap">
        <button type="button" class="round-tab${r === currentRound ? " is-active" : ""}" data-round="${r}">Turno ${r}</button>
        ${
          rounds > 1
            ? `<button type="button" class="round-tab-delete" data-round="${r}" title="Elimina turno ${r}" aria-label="Elimina turno ${r}">&times;</button>`
            : ""
        }
      </span>`;
    }
    html += '<button type="button" class="round-tab-add" id="add-round-btn">+ Turno</button>';
    roundTabsEl.innerHTML = html;

    roundTabsEl.querySelectorAll(".round-tab[data-round]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentRound = parseInt(btn.dataset.round, 10);
        renderRoundTabs();
        renderMatchList();
        resetForm();
      });
    });
    roundTabsEl.querySelectorAll(".round-tab-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteRound(parseInt(btn.dataset.round, 10));
      });
    });
    document.getElementById("add-round-btn").addEventListener("click", addRound);
  }

  async function addRound() {
    if (!currentEvent) return;
    const rounds = (currentEvent.rounds ?? 1) + 1;
    try {
      await Events.update(currentEvent.id, { rounds });
      currentEvent.rounds = rounds;
      currentRound = rounds;
      renderRoundTabs();
      renderMatchList();
      resetForm();
    } catch (err) {
      setMessage(msgEl, "Errore nell'aggiunta del turno.", true);
    }
  }

  async function deleteRound(round) {
    if (!currentEvent) return;
    const totalRounds = Math.max(1, currentEvent.rounds ?? 1);
    if (totalRounds <= 1) return;
    const toDelete = allMatches.filter((m) => (m.round ?? 1) === round);
    if (
      !confirm(
        toDelete.length > 0
          ? `Eliminare il turno ${round}? Verranno eliminate anche le ${toDelete.length} partite associate.`
          : `Eliminare il turno ${round}?`
      )
    ) {
      return;
    }
    try {
      await Promise.all(toDelete.map((m) => Matches.remove(m.id)));
      const toRenumber = allMatches.filter((m) => (m.round ?? 1) > round);
      await Promise.all(toRenumber.map((m) => Matches.update(m.id, { round: (m.round ?? 1) - 1 })));

      const rounds = totalRounds - 1;
      await Events.update(currentEvent.id, { rounds });
      currentEvent.rounds = rounds;
      if (currentRound > round) currentRound -= 1;
      currentRound = Math.min(currentRound, rounds);

      await refresh();
      renderRoundTabs();
      resetForm();
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione del turno.", true);
    }
  }

  async function populateEntrants() {
    if (!currentEvent) return;
    const entries = await EventEntries.listByEvent(currentEvent.id);
    const options = entries
      .map((e) => `<option value="${e.player.id}">${e.player.name}${e.player.handle ? ` (${e.player.handle})` : ""}</option>`)
      .join("");
    fillSelect(player1Field, options);
    fillSelect(player2Field, options);
  }

  function renderMatchList() {
    const matches = allMatches.filter((m) => (m.round ?? 1) === currentRound);
    if (matches.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessuna partita in questo turno.</p>';
      return;
    }
    listEl.innerHTML = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Giocatore 1</th><th>Giocatore 2</th><th>Punteggio</th><th></th></tr></thead>
      <tbody>
        ${matches
          .map(
            (m) => `
          <tr data-id="${m.id}">
            <td>${escapeHtml(m.player1?.name ?? "")}</td>
            <td>${escapeHtml(m.player2?.name ?? "")}</td>
            <td>${scoreLabel(m)}</td>
            <td class="row-actions">
              <button type="button" class="btn-secondary" data-action="edit">Modifica</button>
              <button type="button" class="btn-danger" data-action="delete">Elimina</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table></div>`;

    listEl.querySelectorAll("tr[data-id]").forEach((tr) => {
      const match = matches.find((m) => m.id === tr.dataset.id);
      tr.querySelector('[data-action="edit"]').addEventListener("click", () => onEdit(match));
      tr.querySelector('[data-action="delete"]').addEventListener("click", () => onDelete(match));
    });
  }

  async function refresh() {
    if (!currentEvent) return;
    try {
      allMatches = await Matches.listByEvent(currentEvent.id);
      renderMatchList();
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    player1Field.value = row.player1_id;
    player2Field.value = row.player2_id;
    p1WinsField.value = row.player1_wins;
    drawsField.value = row.draws;
    p2WinsField.value = row.player2_wins;
  }

  function resetForm() {
    idField.value = "";
    p1WinsField.value = "0";
    drawsField.value = "0";
    p2WinsField.value = "0";
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
    if (!confirm("Eliminare questa partita?")) return;
    try {
      await Matches.remove(row.id);
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentEvent) return;
    if (!player1Field.value || !player2Field.value || player1Field.value === player2Field.value) {
      setMessage(msgEl, "Seleziona due giocatori diversi (entrambi devono essere iscritti all'evento).", true);
      return;
    }
    const p1Wins = parseInt(p1WinsField.value, 10) || 0;
    const draws = parseInt(drawsField.value, 10) || 0;
    const p2Wins = parseInt(p2WinsField.value, 10) || 0;
    const total = p1Wins + draws + p2Wins;
    if (total < 1 || total > 3) {
      setMessage(msgEl, "Il totale delle partite giocate deve essere tra 1 e 3.", true);
      return;
    }
    const payload = {
      event_id: currentEvent.id,
      round: currentRound,
      player1_id: player1Field.value,
      player2_id: player2Field.value,
      player1_wins: p1Wins,
      draws,
      player2_wins: p2Wins,
    };
    try {
      if (idField.value) await Matches.update(idField.value, payload);
      else await Matches.create(payload);
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
    } catch (err) {
      console.error(err);
      setMessage(msgEl, `Errore nel salvataggio${err?.message ? `: ${err.message}` : "."}`, true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  on("entries:changed", populateEntrants);

  function openEvent(event) {
    currentEvent = event;
    currentRound = 1;
    renderRoundTabs();
    resetForm();
    populateEntrants().then(refresh);
  }

  return { openEvent };
}
