// Win% heatmap matrix between up to MAX_SELECTED "decks" — a commander on
// its own, or a commander+partner pairing, picked from every combination
// actually played. A commander used with two different partners (or both
// solo and partnered) is genuinely a different deck, not the same row, same
// grouping js/commanders-page.js itself uses. Built entirely client-side
// from already-played matches — no new data to fetch once the initial
// entry/match lists are in, so picking decks re-renders the matrix instantly.

import { EventEntries, Matches } from "./db.js";
import { isBye } from "./leaderboard.js";
import { escapeHtml, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

const MAX_SELECTED = 10;
const TOP_PLAYED_COUNT = 10;

// Diverging red -> yellow -> green, anchored on the site's own brand red
// and accent green rather than an arbitrary scale, same reasoning as the
// hardcoded per-commander/per-archetype chart colors elsewhere (js/
// commanders-page.js, js/archetypes-page.js) — a heatmap fill needs the
// literal hex to interpolate, a CSS var can't be math'd in JS. The 50%
// midpoint is yellow rather than a neutral white/gray, so an even matchup
// still reads as a deliberate color on the scale instead of looking like a
// missing-data cell.
const RED = [220, 24, 28];
const MID = [255, 204, 51];
const GREEN = [39, 174, 96];

function heatColor(winPct) {
  const t = winPct <= 50 ? winPct / 50 : (winPct - 50) / 50;
  const [from, to] = winPct <= 50 ? [RED, MID] : [MID, GREEN];
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${mix.join(",")})`;
}

const MAX_DROPDOWN_RESULTS = 8;

async function init() {
  const modeTitleEl = document.getElementById("matchups-mode-title");
  const customBtn = document.getElementById("matchups-custom-btn");
  const pickerCardEl = document.getElementById("matchups-picker-card");
  const dropdownEl = document.getElementById("matchups-dropdown");
  const searchInput = document.getElementById("matchups-search");
  const countEl = document.getElementById("matchups-count");
  const selectedListEl = document.getElementById("matchups-selected-list");
  const matrixEl = document.getElementById("matchups-matrix");

  let allDecks = []; // { id, name, commanderId, partnerId } — one per unique commander(+partner) combo actually played
  let matchSides = []; // { side1, side2: deckId, side1GameWins, side2GameWins, gameDraws }
  let topPlayedIds = []; // the default "most played" table — reused whenever switching back to it
  const selected = []; // deck ids, in selection order — also matrix row/column order

  function deckIdOf(entry) {
    return `${entry.commander_id}_${entry.partner_commander_id ?? ""}`;
  }

  try {
    const [entries, matches] = await Promise.all([EventEntries.listAll(), Matches.listAll()]);

    const entryByEventPlayer = new Map(entries.map((e) => [`${e.event_id}_${e.player_id}`, e]));

    const decksById = new Map();
    for (const e of entries) {
      if (!e.commander) continue;
      const id = deckIdOf(e);
      if (!decksById.has(id)) {
        decksById.set(id, {
          id,
          commanderId: e.commander_id,
          partnerId: e.partner_commander_id ?? null,
          name: e.partner_commander ? `${e.commander.name} / ${e.partner_commander.name}` : e.commander.name,
        });
      }
    }
    allDecks = Array.from(decksById.values());

    matchSides = matches
      .filter((m) => !isBye(m))
      .map((m) => {
        const e1 = entryByEventPlayer.get(`${m.event_id}_${m.player1_id}`);
        const e2 = entryByEventPlayer.get(`${m.event_id}_${m.player2_id}`);
        if (!e1 || !e2) return null;
        return {
          side1: deckIdOf(e1),
          side2: deckIdOf(e2),
          // Game-basis, not match-basis — a 2-0 match win should count for
          // more than a 2-1 one, same convention as the rest of the site's
          // own winrate stats (js/commanders-page.js, js/players-page.js).
          side1GameWins: m.player1_wins,
          side2GameWins: m.player2_wins,
          gameDraws: m.draws,
        };
      })
      .filter(Boolean);

    // Same "most played" definition as js/commanders-page.js's own
    // popularity ranking — counted per exact commander(+partner) combo.
    const playCounts = new Map();
    for (const e of entries) {
      if (!e.commander) continue;
      const id = deckIdOf(e);
      playCounts.set(id, (playCounts.get(id) ?? 0) + 1);
    }
    topPlayedIds = Array.from(playCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_PLAYED_COUNT)
      .map(([id]) => id);
    selected.push(...topPlayedIds);
  } catch (err) {
    showError(selectedListEl, err);
    hidePageLoading();
    return;
  }

  // Game-basis, not match-basis — a 2-0 match win counts for more than a
  // 2-1 one, matching the rest of the site's own winrate convention. Each
  // side is now the exact deck id (commander+partner combo) that entry
  // played, so e.g. "Thrasios / Tymna" and "Thrasios / Vial Smasher" are
  // never conflated into the same row. Mirror matches (rowId === colId)
  // are left out of the matrix entirely rather than resolved ambiguously.
  // Game draws are tracked (shown on hover) but excluded from the win%
  // itself — wins / (wins + losses) only, so an all-draws matchup reads as
  // "no decisive data" (—) instead of the misleading 0% a
  // wins/(wins+losses+draws) formula would give it.
  function computeCell(rowId, colId) {
    if (rowId === colId) return null;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    for (const m of matchSides) {
      let rowSide = null;
      if (m.side1 === rowId && m.side2 === colId) rowSide = 1;
      else if (m.side2 === rowId && m.side1 === colId) rowSide = 2;
      else continue;

      wins += rowSide === 1 ? m.side1GameWins : m.side2GameWins;
      losses += rowSide === 1 ? m.side2GameWins : m.side1GameWins;
      draws += m.gameDraws;
    }
    return { wins, losses, draws, total: wins + losses };
  }

  function renderMatrix() {
    if (selected.length < 2) {
      matrixEl.innerHTML = '<p class="page-empty">Seleziona almeno 2 comandanti per generare la matrice.</p>';
      return;
    }

    const rows = selected.map((id) => allDecks.find((d) => d.id === id)).filter(Boolean);

    matrixEl.innerHTML = `<div class="data-table-wrap matchups-matrix-wrap"><table class="matchups-table">
      <thead>
        <tr>
          <th class="matchups-corner-header"></th>
          ${rows.map((c) => `<th class="matchups-col-header" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (rowCmd) => `
          <tr>
            <th class="matchups-row-header" title="${escapeHtml(rowCmd.name)}">${escapeHtml(rowCmd.name)}</th>
            ${rows
              .map((colCmd) => {
                if (rowCmd.id === colCmd.id) {
                  return '<td class="matchups-cell matchups-cell-empty">&mdash;</td>';
                }
                const cell = computeCell(rowCmd.id, colCmd.id);
                if (!cell || cell.total === 0) {
                  return '<td class="matchups-cell matchups-cell-empty">&mdash;</td>';
                }
                const pct = (cell.wins / cell.total) * 100;
                // Game-basis: wins/losses here are individual games (a
                // match is best-of-3), not whole matches.
                const title = `${cell.wins}-${cell.losses} (${cell.total} totali)${
                  cell.draws > 0 ? `, ${cell.draws} pareggio${cell.draws === 1 ? "" : "i"} escluso${cell.draws === 1 ? "" : "i"}` : ""
                }`;
                return `<td class="matchups-cell" style="background:${heatColor(pct)};" title="${escapeHtml(title)}">${pct.toFixed(0)}% <span class="matchups-cell-count">(${cell.total})</span></td>`;
              })
              .join("")}
          </tr>`
          )
          .join("")}
      </tbody>
    </table></div>`;
  }

  function updateCount() {
    countEl.textContent = `${selected.length} / ${MAX_SELECTED} selezionati`;
    countEl.classList.toggle("is-full", selected.length >= MAX_SELECTED);
  }

  function renderSelectedList() {
    selectedListEl.innerHTML = selected
      .map((id) => allDecks.find((c) => c.id === id))
      .filter(Boolean)
      .map(
        (c) => `
      <span class="matchups-chip">
        ${escapeHtml(c.name)}
        <button type="button" class="matchups-chip-remove" data-commander-id="${c.id}" aria-label="Rimuovi ${escapeHtml(c.name)}">&times;</button>
      </span>`
      )
      .join("");

    selectedListEl.querySelectorAll("[data-commander-id]").forEach((btn) => {
      btn.addEventListener("click", () => removeCommander(btn.dataset.commanderId));
    });
  }

  function closeDropdown() {
    dropdownEl.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
    pickerCardEl.classList.remove("is-dropdown-open");
  }

  // Already-selected commanders are excluded from results — the only way
  // back in for one is removing it from the chip list first, same as any
  // other single-pick-at-a-time typeahead.
  function renderDropdown() {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
      closeDropdown();
      return;
    }
    if (selected.length >= MAX_SELECTED) {
      dropdownEl.innerHTML = '<p class="matchups-dropdown-empty">Limite di 10 comandanti raggiunto.</p>';
    } else {
      const results = allDecks
        .filter((c) => !selected.includes(c.id) && c.name.toLowerCase().includes(term))
        .slice(0, MAX_DROPDOWN_RESULTS);
      dropdownEl.innerHTML =
        results.length === 0
          ? '<p class="matchups-dropdown-empty">Nessun comandante corrisponde alla ricerca.</p>'
          : results
              .map(
                (c) =>
                  `<button type="button" class="matchups-dropdown-item" role="option" data-commander-id="${c.id}">${escapeHtml(c.name)}</button>`
              )
              .join("");
      dropdownEl.querySelectorAll("[data-commander-id]").forEach((btn) => {
        btn.addEventListener("click", () => addCommander(btn.dataset.commanderId));
      });
    }
    dropdownEl.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
    pickerCardEl.classList.add("is-dropdown-open");
  }

  function addCommander(id) {
    if (selected.includes(id) || selected.length >= MAX_SELECTED) return;
    selected.push(id);
    searchInput.value = "";
    closeDropdown();
    updateCount();
    renderSelectedList();
    renderMatrix();
    searchInput.focus();
  }

  function removeCommander(id) {
    const i = selected.indexOf(id);
    if (i === -1) return;
    selected.splice(i, 1);
    updateCount();
    renderSelectedList();
    renderMatrix();
  }

  searchInput.addEventListener("input", renderDropdown);
  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) renderDropdown();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDropdown();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".matchups-typeahead")) closeDropdown();
  });

  // The one button toggles between the two modes rather than being a
  // one-way reveal — its label always names the *other* mode, the one a
  // click would switch to.
  let customMode = false;

  function showCustomBuilder() {
    customMode = true;
    selected.length = 0;
    closeDropdown();
    searchInput.value = "";
    modeTitleEl.textContent = "Tabella personalizzata";
    customBtn.textContent = "Mostra tabella predefinita";
    pickerCardEl.hidden = false;
    updateCount();
    renderSelectedList();
    renderMatrix();
    searchInput.focus();
  }

  function showDefaultTable() {
    customMode = false;
    selected.length = 0;
    selected.push(...topPlayedIds);
    closeDropdown();
    searchInput.value = "";
    modeTitleEl.textContent = "Comandanti più giocati";
    customBtn.textContent = "Crea tabella personalizzata";
    pickerCardEl.hidden = true;
    renderMatrix();
  }

  customBtn.addEventListener("click", () => {
    if (customMode) showDefaultTable();
    else showCustomBuilder();
  });

  renderMatrix();
  hidePageLoading();
}

init();
