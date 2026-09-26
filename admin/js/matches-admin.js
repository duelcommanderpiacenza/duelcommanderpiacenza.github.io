import { EventEntries, Matches, Events } from "../../js/db.js";
import { isBye, isDrop, computeEventLeaderboard } from "../../js/leaderboard.js";
import { escapeHtml } from "../../js/ui.js";
import { setMessage, fillSelect } from "./crud-ui.js";
import { on } from "./bus.js";

/**
 * Bottom of the pyramid, one level below entries: matches belong to
 * whichever event was drilled into. Rounds are presented as tabs — the "+"
 * tab bumps the event's `rounds` count and switches to the new tab; matches
 * are fetched once per event and filtered client-side by the active tab.
 * A match's score is a best-of-3 game count (player1_wins/draws/player2_wins)
 * rather than a single winner. A match can instead be a single-player row —
 * either a "bye" (player2_id null, an automatic win, for an odd entrant this
 * round) or a "drop" (player2_id null, is_drop true — the player left the
 * event and this round isn't scored at all) — picked via the two mutually
 * exclusive checkboxes below Giocatore 1.
 */
export function initMatchesAdmin({ onToggleOpen } = {}) {
  const roundTabsEl = document.getElementById("matches-round-tabs");
  const listEl = document.getElementById("matches-admin-list");
  const form = document.getElementById("matches-admin-form");
  const idField = document.getElementById("matches-admin-id");
  const byeField = document.getElementById("matches-admin-bye");
  const dropField = document.getElementById("matches-admin-drop");
  const player1Label = document.getElementById("matches-admin-player1-label");
  const player1Field = document.getElementById("matches-admin-player1");
  const player2Field = document.getElementById("matches-admin-player2");
  const scoreRowWrap = document.getElementById("matches-admin-score-row");
  const p1WinsField = document.getElementById("matches-admin-p1wins");
  const drawsField = document.getElementById("matches-admin-draws");
  const p2WinsField = document.getElementById("matches-admin-p2wins");
  const msgEl = document.getElementById("matches-admin-message");
  const cancelBtn = document.getElementById("matches-admin-cancel");
  const toggleEventOpenBtn = document.getElementById("matches-toggle-event-open");
  const eventLeaderboardEl = document.getElementById("matches-event-leaderboard");

  let currentEvent = null;
  let currentRound = 1;
  let allMatches = [];
  let currentEntrants = [];
  let editingRow = null; // the match object loaded into the form, or null when adding new

  function scoreLabel(m) {
    return `${m.player1_wins}-${m.player2_wins}-${m.draws}`;
  }

  // Entrants without a match (or bye) yet in the current round, excluding
  // whatever effect the match currently being edited has on that coverage —
  // so editing a match keeps its own player(s) selectable in their own slot.
  // A player who has dropped (in any round of this event, not just the
  // current one) is excluded everywhere from here on, since they're done
  // with the event entirely — except from the drop match itself, so editing
  // it still shows them as an option.
  function availableEntrants(excludeMatchId) {
    const covered = new Set();
    const dropped = new Set();
    for (const m of allMatches) {
      if (m.id === excludeMatchId) continue;
      if (isDrop(m)) dropped.add(m.player1_id);
      if ((m.round ?? 1) !== currentRound) continue;
      covered.add(m.player1_id);
      if (m.player2_id) covered.add(m.player2_id);
    }
    return currentEntrants
      .filter((e) => !covered.has(e.player.id) && !dropped.has(e.player.id))
      .sort((a, b) => a.player.name.localeCompare(b.player.name, "it"));
  }

  // Player 1/2 can only be chosen from players not already paired this
  // round (or already dropped from the event). Bye/Drop are always offered
  // as two mutually exclusive checkboxes — checking either clears and
  // disables Giocatore 2, since there's no opponent to record.
  function updateFormAvailability() {
    const excludeId = editingRow ? editingRow.id : null;
    const available = availableEntrants(excludeId);
    const options = available
      .map((e) => `<option value="${e.player.id}">${e.player.name}${e.player.handle ? ` (${e.player.handle})` : ""}</option>`)
      .join("");
    fillSelect(player1Field, options);
    fillSelect(player2Field, options);
    updateMatchTypeUI();
  }

  function updateMatchTypeUI() {
    const special = byeField.checked || dropField.checked;
    player1Label.textContent = special ? "Giocatore" : "Giocatore 1";
    player2Field.disabled = special;
    player2Field.required = !special;
    if (special) fillSelect(player2Field, "");
    scoreRowWrap.hidden = special;
    [p1WinsField, drawsField, p2WinsField].forEach((f) => (f.required = !special));
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
    // A closed event is already published — its round/turn structure is
    // frozen from here on, only individual match scores can still be fixed.
    if (currentEvent?.is_open) {
      html += '<button type="button" class="round-tab-add" id="add-round-btn">+ Turno</button>';
    }
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
    document.getElementById("add-round-btn")?.addEventListener("click", addRound);
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
    currentEntrants = await EventEntries.listByEvent(currentEvent.id);
    updateFormAvailability();
    renderEventLeaderboard();
  }

  // Preview of the full event standings (all rounds, not just the active
  // tab), using the same tiebreak logic as the public leaderboard. A manual
  // reorder here persists as a manual_rank on the affected entries, so it's
  // reflected everywhere that entry's standing is shown, not just here.
  function renderEventLeaderboard() {
    const standings = computeEventLeaderboard(allMatches, currentEntrants);
    if (standings.length === 0) {
      eventLeaderboardEl.innerHTML = '<p class="page-empty">Nessun dato per la classifica.</p>';
      return;
    }
    eventLeaderboardEl.innerHTML = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Giocatore</th><th>Punti</th><th>V-S-P</th><th></th></tr></thead>
      <tbody>
        ${standings
          .map((s, i) => {
            const tiedWithPrev = i > 0 && standings[i - 1].points === s.points;
            const tiedWithNext = i < standings.length - 1 && standings[i + 1].points === s.points;
            return `
          <tr>
            <td class="rank-cell">${i + 1}</td>
            <td>${escapeHtml(s.player?.name ?? "")}</td>
            <td><strong>${s.points}</strong></td>
            <td>${s.wins}-${s.losses}-${s.draws}</td>
            <td class="row-actions">
              <button type="button" class="btn-secondary" data-move="up" data-index="${i}" ${tiedWithPrev && currentEvent?.is_open ? "" : "disabled"}>&uarr;</button>
              <button type="button" class="btn-secondary" data-move="down" data-index="${i}" ${tiedWithNext && currentEvent?.is_open ? "" : "disabled"}>&darr;</button>
            </td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;

    eventLeaderboardEl.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () =>
        moveStanding(standings, parseInt(btn.dataset.index, 10), btn.dataset.move === "up" ? -1 : 1)
      );
    });
  }

  async function moveStanding(standings, index, direction) {
    const other = index + direction;
    if (other < 0 || other >= standings.length) return;
    if (standings[other].points !== standings[index].points) return;

    const reordered = standings.slice();
    [reordered[index], reordered[other]] = [reordered[other], reordered[index]];

    // Persist a full, contiguous manual order across the whole tied-points
    // group this swap touches, so the result stays consistent with any
    // other entries in that same group (already ranked or not).
    let start = Math.min(index, other);
    while (start > 0 && reordered[start - 1].points === reordered[index].points) start -= 1;
    let end = Math.max(index, other);
    while (end < reordered.length - 1 && reordered[end + 1].points === reordered[index].points) end += 1;

    try {
      await Promise.all(
        reordered
          .slice(start, end + 1)
          .map((s, offset) => (s.entryId ? EventEntries.update(s.entryId, { manual_rank: offset }) : null))
      );
      await populateEntrants();
    } catch (err) {
      setMessage(msgEl, "Errore nell'aggiornamento della classifica.", true);
    }
  }

  function updateToggleEventOpenBtn() {
    toggleEventOpenBtn.textContent = currentEvent?.is_open ? "Chiudi evento" : "Riapri evento";
  }

  toggleEventOpenBtn.addEventListener("click", () => onToggleOpen?.());

  // The open/closed toggle now also lives on the Iscritti title bar, so the
  // actual API call is centralized in app.js (the only place holding the one
  // currentEvent object both this module and entries-admin share) — this
  // just re-renders whatever this module already has on screen afterward.
  function refreshOpenState() {
    if (!currentEvent) return;
    updateToggleEventOpenBtn();
    renderRoundTabs();
    renderEventLeaderboard();
  }

  function renderMatchList() {
    const matches = allMatches.filter((m) => (m.round ?? 1) === currentRound);
    updateFormAvailability();
    renderEventLeaderboard();
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
            <td>${isBye(m) ? "Bye" : isDrop(m) ? "Drop" : escapeHtml(m.player2?.name ?? "")}</td>
            <td>${isDrop(m) ? "—" : scoreLabel(m)}</td>
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
    editingRow = row;
    idField.value = row.id;
    byeField.checked = isBye(row);
    dropField.checked = isDrop(row);
    updateFormAvailability();
    player1Field.value = row.player1_id;
    if (!isBye(row) && !isDrop(row)) {
      player2Field.value = row.player2_id;
      p1WinsField.value = row.player1_wins;
      drawsField.value = row.draws;
      p2WinsField.value = row.player2_wins;
    }
  }

  // For a fresh match, default Giocatore 1/2 to the next two alphabetically
  // available entrants rather than leaving them blank — since the picker
  // list is already alphabetical, that's almost always who the admin wants
  // to pair next; they can still change it before submitting.
  function resetForm() {
    editingRow = null;
    idField.value = "";
    byeField.checked = false;
    dropField.checked = false;
    updateFormAvailability();
    const available = availableEntrants(null);
    player1Field.value = available[0]?.player.id ?? "";
    player2Field.value = available[1]?.player.id ?? "";
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

  // Bye and Drop are mutually exclusive — checking one clears the other,
  // rather than validating the conflict only at submit time.
  byeField.addEventListener("change", () => {
    if (byeField.checked) dropField.checked = false;
    updateFormAvailability();
  });
  dropField.addEventListener("change", () => {
    if (dropField.checked) byeField.checked = false;
    updateFormAvailability();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentEvent) return;

    let payload;
    if (dropField.checked) {
      if (!player1Field.value) {
        setMessage(msgEl, "Seleziona il giocatore che droppa.", true);
        return;
      }
      payload = {
        event_id: currentEvent.id,
        round: currentRound,
        player1_id: player1Field.value,
        player2_id: null,
        player1_wins: 0,
        draws: 0,
        player2_wins: 0,
        is_drop: true,
      };
    } else if (byeField.checked) {
      if (!player1Field.value) {
        setMessage(msgEl, "Seleziona il giocatore che riceve il bye.", true);
        return;
      }
      payload = {
        event_id: currentEvent.id,
        round: currentRound,
        player1_id: player1Field.value,
        player2_id: null,
        player1_wins: 2,
        draws: 0,
        player2_wins: 0,
        is_drop: false,
      };
    } else {
      if (!player1Field.value || !player2Field.value || player1Field.value === player2Field.value) {
        setMessage(msgEl, "Seleziona due giocatori diversi (entrambi devono essere iscritti all'evento).", true);
        return;
      }
      const p1Wins = parseInt(p1WinsField.value, 10) || 0;
      const draws = parseInt(drawsField.value, 10) || 0;
      const p2Wins = parseInt(p2WinsField.value, 10) || 0;
      const total = p1Wins + draws + p2Wins;
      // 0-0-0 is a valid result (no games played, e.g. an intentional draw)
      // and scores as a draw — matchRoundOutcome treats equal game counts as
      // one. Only more than a best-of-3's worth of games is rejected.
      if (p1Wins < 0 || draws < 0 || p2Wins < 0 || total > 3) {
        setMessage(msgEl, "Il totale delle partite giocate deve essere tra 0 e 3.", true);
        return;
      }
      payload = {
        event_id: currentEvent.id,
        round: currentRound,
        player1_id: player1Field.value,
        player2_id: player2Field.value,
        player1_wins: p1Wins,
        draws,
        player2_wins: p2Wins,
        is_drop: false,
      };
    }

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
    updateToggleEventOpenBtn();
    resetForm();
    populateEntrants().then(refresh);
  }

  return { openEvent, refreshOpenState };
}
