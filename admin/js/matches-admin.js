import { EventEntries, Matches, Events } from "../../js/db.js";
import { isBye, isDrop, computeEventLeaderboard, top8Stage, roundLabel, top8SplitPlayers, TOP8_STAGES } from "../../js/leaderboard.js";
import { escapeHtml } from "../../js/ui.js";
import { renderTable, setMessage, fillSelect, onBusySubmit, runBusy } from "./crud-ui.js";
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
 *
 * A top 8 (migration 045, js/leaderboard.js top8Stage): "+ Top 8" ends the
 * Swiss rounds (`events.top8_after` = how many there were) and adds the
 * quarterfinals' tab, then "+ Semifinali", "+ Finale" — no more Swiss rounds
 * after it. In a top 8 tab only the players still in can be paired (the
 * Swiss top 8, then each stage's winners), the bracket's next pairing
 * offered first, and every match needs a winner. "Dividi vittoria"
 * (`events.top8_split`): the players still in split the win — no more
 * rounds, the standings stay as they stood.
 */

// The bracket: Swiss seeds in the order they meet — 1-8 and 4-5 in one
// half, 2-7 and 3-6 in the other — so a stage's pairing is the two players
// still in within the same block of 2^stage slots.
const BRACKET = [1, 8, 4, 5, 2, 7, 3, 6];
export function initMatchesAdmin() {
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
  const eventLeaderboardEl = document.getElementById("matches-event-leaderboard");

  // A best-of-3 (see the check on save): each field's max follows the other
  // two — wins at most 2 and what's left of 3 games, draws what's left — so
  // the steppers can't reach a 2-2 or a 3-0. Re-run whenever the values are
  // set from code too (edit, reset).
  const scoreFields = [p1WinsField, drawsField, p2WinsField];
  function limitScore() {
    const [p1, d, p2] = scoreFields.map((f) => Math.max(0, parseInt(f.value, 10) || 0));
    p1WinsField.max = String(Math.min(2, 3 - d - p2));
    p2WinsField.max = String(Math.min(2, 3 - d - p1));
    drawsField.max = String(3 - p1 - p2);
  }
  scoreFields.forEach((f) => f.addEventListener("input", limitScore));

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
    const stage = top8Stage(currentEvent, currentRound);
    const covered = new Set();
    const dropped = new Set();
    for (const m of allMatches) {
      if (m.id === excludeMatchId) continue;
      if (isDrop(m)) dropped.add(m.player1_id);
      if ((m.round ?? 1) !== currentRound) continue;
      covered.add(m.player1_id);
      if (m.player2_id) covered.add(m.player2_id);
    }
    const free = currentEntrants.filter((e) => !covered.has(e.player.id) && !dropped.has(e.player.id));
    if (!stage) return free.sort((a, b) => a.player.name.localeCompare(b.player.name, "it"));
    // A top 8 round: only the players still in, by Swiss seed.
    const seedOf = top8Seeds(stage);
    return free.filter((e) => seedOf.has(e.player.id)).sort((a, b) => seedOf.get(a.player.id) - seedOf.get(b.player.id));
  }

  // The players still in at a top 8 stage — the Swiss top 8 for the
  // quarterfinals, then the previous stage's winners — with their Swiss
  // seed: player id -> seed. The standings ignore the matches of this stage
  // and later, so editing one doesn't change who's in.
  function top8Seeds(stage) {
    const before = allMatches.filter((m) => {
      const s = top8Stage(currentEvent, m.round);
      return !s || s < stage;
    });
    const standings = computeEventLeaderboard(before, currentEntrants, currentEvent);
    const stillIn = standings.filter((row) =>
      stage === 1 ? row.seed <= BRACKET.length : row.bracketReach === (stage - 1) * 2 + 1
    );
    return new Map(stillIn.filter((row) => row.player?.id).map((row) => [row.player.id, row.seed]));
  }

  // A top 8 stage's next pairing: the best seed still unpaired, and the
  // other player still in from their block of the bracket (else the next
  // seed). `available`: availableEntrants' list, best seed first.
  function bracketPairing(stage, available) {
    const [first, ...rest] = available;
    if (!first) return [null, null];
    const seedOf = top8Seeds(stage);
    const block = (entry) => Math.floor(BRACKET.indexOf(seedOf.get(entry.player.id)) / 2 ** stage);
    return [first, rest.find((e) => block(e) === block(first)) ?? rest[0] ?? null];
  }

  // Player 1/2 can only be chosen from players not already paired this
  // round (or already dropped from the event). Bye/Drop are always offered
  // as two mutually exclusive checkboxes — checking either clears and
  // disables Giocatore 2, since there's no opponent to record.
  function updateFormAvailability() {
    const excludeId = editingRow ? editingRow.id : null;
    const available = availableEntrants(excludeId);
    // In a top 8 round each name with its Swiss seed first.
    const stage = top8Stage(currentEvent, currentRound);
    const seedOf = stage ? top8Seeds(stage) : null;
    const options = available
      .map(
        (e) =>
          `<option value="${e.player.id}">${seedOf ? `${seedOf.get(e.player.id)}° · ` : ""}${escapeHtml(e.player.name)}${
            e.player.handle ? ` (${escapeHtml(e.player.handle)})` : ""
          }</option>`
      )
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

  // The top 8's stages created so far (0 without one).
  function top8Stages() {
    const after = currentEvent?.top8_after;
    return after ? Math.max(0, (currentEvent.rounds ?? 1) - after) : 0;
  }

  // A round's tab can be deleted (its "×", inside the pill): any Swiss round
  // while there are two or more — but never the last Swiss one before a top
  // 8 — and only the latest of the top 8's stages (deleting the
  // quarterfinals' while it's the only one removes the top 8).
  function canDeleteRound(r, rounds) {
    if (rounds <= 1) return false;
    const after = currentEvent?.top8_after;
    if (!after) return true;
    return top8Stage(currentEvent, r) ? r === rounds : after > 1;
  }

  function renderRoundTabs() {
    const rounds = Math.max(1, currentEvent?.rounds ?? 1);
    const deleteBtn = (attrs, label) =>
      `<button type="button" class="round-tab-delete" ${attrs} title="${label}" aria-label="${label}">&times;</button>`;
    let html = "";
    for (let r = 1; r <= rounds; r += 1) {
      const label = roundLabel(currentEvent, r);
      const deletable = canDeleteRound(r, rounds);
      html += `<span class="round-tab-wrap${r === currentRound ? " is-active" : ""}">
        <button type="button" class="round-tab${r === currentRound ? " is-active" : ""}${deletable ? " has-delete" : ""}" data-round="${r}">${label}</button>
        ${deletable ? deleteBtn(`data-round="${r}"`, `Elimina: ${label}`) : ""}
      </span>`;
    }
    const stages = top8Stages();
    const split = Boolean(currentEvent?.top8_after && currentEvent.top8_split);
    // The split, once made: a chip, its "×" takes it back (while open).
    if (split) {
      html += `<span class="round-tab-wrap">
        <span class="round-tab is-split${currentEvent.is_open ? " has-delete" : ""}">Vittoria divisa</span>
        ${currentEvent.is_open ? deleteBtn('id="unsplit-btn"', "Annulla la vittoria divisa") : ""}
      </span>`;
    }
    // A closed event is already published — its round/turn structure is
    // frozen from here on, only individual match scores can still be fixed.
    if (currentEvent?.is_open && !split) {
      if (!currentEvent.top8_after) {
        html += '<button type="button" class="round-tab-add" id="add-round-btn">+ Turno</button>';
        html += '<button type="button" class="round-tab-add" id="add-top8-btn">+ Top 8</button>';
      } else {
        if (stages < TOP8_STAGES.length) {
          html += `<button type="button" class="round-tab-add" id="add-round-btn">+ ${TOP8_STAGES[stages]}</button>`;
        }
        html += '<button type="button" class="round-tab-add" id="split-btn">Dividi vittoria</button>';
      }
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
    roundTabsEl.querySelectorAll(".round-tab-delete[data-round]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        runBusy(btn, () => deleteRound(parseInt(btn.dataset.round, 10)));
      });
    });
    const addRoundBtn = document.getElementById("add-round-btn");
    addRoundBtn?.addEventListener("click", () => runBusy(addRoundBtn, () => addRound()));
    const addTop8Btn = document.getElementById("add-top8-btn");
    addTop8Btn?.addEventListener("click", () => runBusy(addTop8Btn, () => addRound({ top8: true })));
    const splitBtn = document.getElementById("split-btn");
    splitBtn?.addEventListener("click", () => runBusy(splitBtn, () => setSplit(true)));
    const unsplitBtn = document.getElementById("unsplit-btn");
    unsplitBtn?.addEventListener("click", () => runBusy(unsplitBtn, () => setSplit(false)));
  }

  // Saves a change to the event's rounds / top 8, and keeps the shared
  // currentEvent (app.js's) in step.
  async function updateEvent(patch) {
    await Events.update(currentEvent.id, patch);
    Object.assign(currentEvent, patch);
  }

  // A new tab: a Swiss round, or the top 8's next stage. `top8`: start the
  // top 8 — every round so far is Swiss, the new one its quarterfinals.
  async function addRound({ top8 = false } = {}) {
    if (!currentEvent) return;
    const rounds = (currentEvent.rounds ?? 1) + 1;
    if (top8 && !confirm(`Iniziare la top 8 dopo ${rounds - 1} turni? I primi 8 della classifica giocano i quarti.`)) return;
    try {
      await updateEvent(top8 ? { rounds, top8_after: rounds - 1, top8_split: false } : { rounds });
      currentRound = rounds;
      renderRoundTabs();
      renderMatchList();
      resetForm();
    } catch (err) {
      console.error(err);
      setMessage(msgEl, top8 ? "Errore nella creazione della top 8." : "Errore nell'aggiunta del turno.", true);
    }
  }

  // The players still in split the win (or, `false`, take it back).
  async function setSplit(split) {
    if (!currentEvent?.top8_after) return;
    if (split) {
      const standings = computeEventLeaderboard(allMatches, currentEntrants, currentEvent);
      const names = top8SplitPlayers({ ...currentEvent, top8_split: true }, standings).map((row) => row.player?.name ?? "?");
      if (!confirm(`Dividere la vittoria tra ${names.join(", ")}? Non si giocano altri turni e la classifica resta com'è.`)) return;
    }
    try {
      await updateEvent({ top8_split: split });
      renderRoundTabs();
      renderEventLeaderboard();
    } catch (err) {
      console.error(err);
      setMessage(msgEl, "Errore nel salvataggio della vittoria divisa.", true);
    }
  }

  async function deleteRound(round) {
    if (!currentEvent) return;
    const totalRounds = Math.max(1, currentEvent.rounds ?? 1);
    if (!canDeleteRound(round, totalRounds)) return;
    const toDelete = allMatches.filter((m) => (m.round ?? 1) === round);
    // The quarterfinals while they're the top 8's only stage: the top 8 goes.
    const removesTop8 = top8Stage(currentEvent, round) === 1;
    const what = removesTop8 ? "la top 8" : roundLabel(currentEvent, round);
    if (
      !confirm(
        toDelete.length > 0
          ? `Eliminare ${what}? Verranno eliminate anche le ${toDelete.length} partite associate.`
          : `Eliminare ${what}?`
      )
    ) {
      return;
    }
    try {
      await Promise.all(toDelete.map((m) => Matches.remove(m.id)));
      const toRenumber = allMatches.filter((m) => (m.round ?? 1) > round);
      await Promise.all(toRenumber.map((m) => Matches.update(m.id, { round: (m.round ?? 1) - 1 })));

      const rounds = totalRounds - 1;
      const patch = { rounds };
      // A Swiss round before the top 8: one fewer before it.
      if (currentEvent.top8_after && !top8Stage(currentEvent, round)) patch.top8_after = currentEvent.top8_after - 1;
      if (removesTop8) Object.assign(patch, { top8_after: null, top8_split: false });
      await updateEvent(patch);
      if (currentRound > round) currentRound -= 1;
      currentRound = Math.min(currentRound, rounds);

      await refresh();
      renderRoundTabs();
      resetForm();
    } catch (err) {
      console.error(err);
      setMessage(msgEl, "Errore nell'eliminazione del turno.", true);
    }
  }

  async function populateEntrants() {
    if (!currentEvent) return;
    currentEntrants = await EventEntries.listByEvent(currentEvent.id);
    updateFormAvailability();
    renderEventLeaderboard();
  }

  // League bonus points are a league-points adjustment — meaningless for a
  // series (no_points: no points leaderboard) or a standalone event (no league
  // at all), so the leaderboard's Bonus column only exists for these.
  function bonusApplies() {
    return Boolean(currentEvent?.league && !currentEvent.league.no_points);
  }

  // Preview of the full event standings (all rounds, not just the active
  // tab), using the same tiebreak logic as the public leaderboard. A manual
  // reorder here persists as a manual_rank on the affected entries, so it's
  // reflected everywhere that entry's standing is shown, not just here.
  // For a league event it's also where per-player league bonus points are
  // set (stored as the entry's bonus_points, added by computeLeaguePoints);
  // like the reorder arrows, only while the event is open.
  function renderEventLeaderboard() {
    const standings = computeEventLeaderboard(allMatches, currentEntrants, currentEvent);
    if (standings.length === 0) {
      eventLeaderboardEl.innerHTML = '<p class="page-empty">Nessun dato per la classifica.</p>';
      return;
    }
    const showBonus = bonusApplies();
    const locked = !currentEvent?.is_open;
    // One card per player (crud-ui.js): position chip + name as its title,
    // Punti / V-S-P (/ the Bonus lega field) beside it, the ↑↓ reorder
    // buttons on the right — no Modifica/Elimina here.
    const rows = standings.map((s, i) => ({ ...s, id: i, index: i }));
    renderTable(
      eventLeaderboardEl,
      rows,
      [
        {
          key: "player",
          label: "Giocatore",
          render: (s) => `<span class="rank-chip">${s.index + 1}</span> ${escapeHtml(s.player?.name ?? "")}`,
        },
        { key: "points", label: "Punti", render: (s) => `<strong>${s.points}</strong>` },
        { key: "record", label: "V-S-P", render: (s) => `${s.wins}-${s.losses}-${s.draws}` },
        ...(showBonus
          ? [
              {
                key: "bonus",
                label: "Bonus lega",
                render: (s) =>
                  s.entryId
                    ? `<input type="number" class="standings-bonus-input" step="1" value="${s.bonusPoints}" data-entry-id="${s.entryId}" aria-label="Punti bonus di lega per ${escapeHtml(s.player?.name ?? "")}" ${locked ? "disabled" : ""}>`
                    : "—",
              },
            ]
          : []),
        {
          key: "move",
          label: "",
          render: (s) => {
            const i = s.index;
            const tiedWithPrev = i > 0 && tied(standings[i - 1], s);
            const tiedWithNext = i < standings.length - 1 && tied(standings[i + 1], s);
            return `
              <button type="button" class="btn-secondary" data-move="up" data-index="${i}" aria-label="Sposta su" ${tiedWithPrev && currentEvent?.is_open ? "" : "disabled"}>&uarr;</button>
              <button type="button" class="btn-secondary" data-move="down" data-index="${i}" aria-label="Sposta giù" ${tiedWithNext && currentEvent?.is_open ? "" : "disabled"}>&darr;</button>`;
          },
        },
      ],
      {}
    );

    eventLeaderboardEl.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () =>
        runBusy(btn, () => moveStanding(standings, parseInt(btn.dataset.index, 10), btn.dataset.move === "up" ? -1 : 1))
      );
    });
    eventLeaderboardEl.querySelectorAll(".standings-bonus-input").forEach((input) => {
      input.addEventListener("change", () => runBusy(input, () => saveBonus(input)));
    });
  }

  // Saved on "change" (blur, Enter, or a spinner step) — no separate save
  // button. The event is open (the input is disabled otherwise), so its data
  // isn't in any published league standing yet: no badge sync needed here,
  // closing the event does that.
  async function saveBonus(input) {
    const value = parseInt(input.value, 10) || 0;
    input.value = value;
    try {
      await EventEntries.update(input.dataset.entryId, { bonus_points: value });
      const entry = currentEntrants.find((e) => e.id === input.dataset.entryId);
      if (entry) entry.bonus_points = value;
      setMessage(msgEl, "Bonus salvato.", false);
    } catch (err) {
      console.error(err);
      setMessage(msgEl, "Errore nel salvataggio del bonus.", true);
    }
  }

  // Two players the arrows can swap: tied on points and, with a top 8, as
  // far in it (the bracket orders the rest).
  function tied(a, b) {
    return a.points === b.points && a.bracketReach === b.bracketReach;
  }

  async function moveStanding(standings, index, direction) {
    const other = index + direction;
    if (other < 0 || other >= standings.length) return;
    if (!tied(standings[other], standings[index])) return;

    const reordered = standings.slice();
    [reordered[index], reordered[other]] = [reordered[other], reordered[index]];

    // Persist a full, contiguous manual order across the whole tied-points
    // group this swap touches, so the result stays consistent with any
    // other entries in that same group (already ranked or not).
    let start = Math.min(index, other);
    while (start > 0 && tied(reordered[start - 1], reordered[index])) start -= 1;
    let end = Math.max(index, other);
    while (end < reordered.length - 1 && tied(reordered[end + 1], reordered[index])) end += 1;

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

  // The open/closed toggle lives in the event's shared title bar, owned by
  // app.js (the only place holding the one currentEvent object both this
  // module and entries-admin share) — this just re-renders what depends on
  // it here: the "+ Turno" tab and the leaderboard's editable controls.
  function refreshOpenState() {
    if (!currentEvent) return;
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
    // One card per match (crud-ui.js): "Giocatore 1 vs Giocatore 2" (or Bye /
    // Drop) as its title, the score beside it, Modifica/Elimina on the right.
    renderTable(
      listEl,
      matches,
      [
        {
          key: "players",
          label: "Partita",
          render: (m) =>
            `${escapeHtml(m.player1?.name ?? "")} <span class="admin-card-muted">${
              isBye(m) || isDrop(m) ? "—" : "vs"
            }</span> ${isBye(m) ? "Bye" : isDrop(m) ? "Drop" : escapeHtml(m.player2?.name ?? "")}`,
        },
        { key: "score", label: "Punteggio", render: (m) => (isDrop(m) ? "—" : scoreLabel(m)) },
      ],
      { onEdit, onDelete }
    );
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
    limitScore();
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
    const stage = top8Stage(currentEvent, currentRound);
    const [first, second] = stage ? bracketPairing(stage, available) : available;
    player1Field.value = first?.player.id ?? "";
    player2Field.value = second?.player.id ?? "";
    p1WinsField.value = "0";
    drawsField.value = "0";
    p2WinsField.value = "0";
    limitScore();
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

  onBusySubmit(form, async (e) => {
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
      // one. A best-of-3: at most 2 wins each (the second ends it), at most
      // 3 games in all (the database checks the same — matches_score_valid).
      if (p1Wins < 0 || draws < 0 || p2Wins < 0) {
        setMessage(msgEl, "I valori non possono essere negativi.", true);
        return;
      }
      if (p1Wins > 2 || p2Wins > 2) {
        setMessage(msgEl, "Un giocatore può vincere al massimo 2 partite.", true);
        return;
      }
      if (total > 3) {
        setMessage(msgEl, "Il totale delle partite giocate non può superare 3.", true);
        return;
      }
      // Single elimination: someone goes through.
      if (top8Stage(currentEvent, currentRound) && p1Wins === p2Wins) {
        setMessage(msgEl, "Nella top 8 una partita non può finire in pareggio.", true);
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

  // Resolves once the entrants and matches are loaded and rendered, so
  // app.js can reveal this view with its content already in place.
  function openEvent(event) {
    currentEvent = event;
    currentRound = 1;
    renderRoundTabs();
    resetForm();
    return populateEntrants().then(refresh);
  }

  return { openEvent, refreshOpenState };
}
