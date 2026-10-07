// Win% matrix between up to MAX_SELECTED "decks" — a commander on
// its own, or a commander+partner pairing, picked from every combination
// actually played. A commander used with two different partners (or both
// solo and partnered) is genuinely a different deck, not the same row, same
// grouping js/commanders-page.js itself uses. Built client-side from the
// entries/matches of the events the league/event/"Dal" filters leave in
// scope — refetched only when a filter changes; picking decks just
// re-renders the matrix from what's already loaded, instantly.

import { Events, fetchEventsResults } from "./db.js";
import { isBye, isDrop, matchRoundOutcome } from "./leaderboard.js";
import { escapeHtml, showError, isoDateYearsAgo, DEFAULT_DATE_FROM_YEARS } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { attachHoverTooltips, fullTextIfTruncated } from "./floating-tooltip.js";
import { initScopeFilter } from "./scope-filter.js";
import { initFilterToggle } from "./filter-toggle.js";
import { openInfoDialog } from "./info-dialog.js";
import { enableDragScroll, enableSnapDrag } from "./drag-scroll.js";

const MAX_SELECTED = 10;
const TOP_PLAYED_COUNT = 10;

// A cell's colour, in the site's own win/loss language (js/history-list.js's
// results: green for a win, red for a loss) with yellow for even, rather
// than a heatmap palette of its own: the side (.is-win / .is-loss /
// .is-even) and how far from 50% it is (--heat, 0 at 50% to 1 at 0% or
// 100%), which styles.css turns into the tile's tint — yellow near 50%,
// turning green / red as it leans, stronger the more one-sided.
function heatAttrs(winPct) {
  const side = winPct > 50 ? "is-win" : winPct < 50 ? "is-loss" : "is-even";
  return { side, heat: (Math.abs(winPct - 50) / 50).toFixed(2) };
}

const MAX_DROPDOWN_RESULTS = 8;

// Phones: one result column at a time — the pinned names and the column
// sharing the room about equally (--mx-head-w, --mx-col-w on the panel),
// a peek of the next column left at the edge (a hint there's more), and a
// swipe snaps to the next column (styles.css: scroll-snap on the column
// headers). Where a column starts (just past the pinned names, measured
// once they're sized) is the panel's scroll-padding, so a snapped column
// lines up there rather than under them. All on the scroller
// (.matchups-matrix-scroll), measured from its own edges.
const columnModeQuery = window.matchMedia("(max-width: 640px)");
const MX_SPACING = 4; // .matchups-table's border-spacing
const COLUMN_PEEK = 22;

function fitColumns(wrap) {
  if (!wrap) return;
  const head = wrap.querySelector(".matchups-row-header");
  if (!columnModeQuery.matches || !head) {
    wrap.style.removeProperty("--mx-col-w");
    wrap.style.removeProperty("--mx-head-w");
    wrap.style.scrollPaddingLeft = "";
    return;
  }
  const room = wrap.clientWidth - 3 * MX_SPACING - COLUMN_PEEK;
  wrap.style.setProperty("--mx-head-w", `${Math.floor(room / 2)}px`);
  const start = head.getBoundingClientRect().right - wrap.getBoundingClientRect().left - wrap.clientLeft + MX_SPACING;
  const width = Math.max(90, Math.floor(wrap.clientWidth - start - MX_SPACING - COLUMN_PEEK));
  wrap.style.setProperty("--mx-col-w", `${width}px`);
  wrap.style.scrollPaddingLeft = `${Math.round(start)}px`;
}

// The scrollLeft at which each column sits snapped (just past the names).
function columnStops(wrap) {
  const start = parseFloat(wrap.style.scrollPaddingLeft) || 0;
  const wrapLeft = wrap.getBoundingClientRect().left + wrap.clientLeft;
  const max = wrap.scrollWidth - wrap.clientWidth;
  return [...wrap.querySelectorAll(".matchups-col-header")].map((th) =>
    Math.min(max, Math.max(0, th.getBoundingClientRect().left - wrapLeft + wrap.scrollLeft - start))
  );
}

// The round "?" beside the title opens how to read the matrix, in the
// site's shared explanation pop-up (js/info-dialog.js, same as player.html's
// "Carte speciali"); the text itself lives in matchups.html's <template>.
// Wired first, so it works even while the data still loads.
function initHelpToggle() {
  const btn = document.getElementById("matchups-help-toggle");
  const text = document.getElementById("matchups-help-text");
  if (!btn || !text) return;
  btn.addEventListener("click", () =>
    openInfoDialog({ id: "matchups-help-dialog", title: "Come si legge la matrice", bodyHtml: text.innerHTML })
  );
}

async function init() {
  initHelpToggle();
  const modeTitleEl = document.getElementById("matchups-mode-title");
  const customBtn = document.getElementById("matchups-custom-btn");
  const pickerCardEl = document.getElementById("matchups-picker-card");
  const dropdownEl = document.getElementById("matchups-dropdown");
  const searchInput = document.getElementById("matchups-search");
  const countEl = document.getElementById("matchups-count");
  const selectedListEl = document.getElementById("matchups-selected-list");
  const matrixEl = document.getElementById("matchups-matrix");

  // Header-name tooltips: a real element appended to <body> (js/floating-tooltip.js),
  // since the matrix sits inside a horizontally-scrolling wrapper that would clip
  // a CSS ::after tooltip anchored inside it. Only for names actually cut off by
  // their inner *-text span's ellipsis — one that fits needs no tooltip.
  // The phone column widths follow the screen (rotating it, resizing);
  // switching in or out of the one-column mode redraws it (its drag differs).
  const refit = () => fitColumns(matrixEl.querySelector(".matchups-matrix-scroll"));
  new ResizeObserver(refit).observe(matrixEl);
  columnModeQuery.addEventListener("change", () => {
    if (matrixEl.querySelector(".matchups-matrix-wrap")) renderMatrix();
  });

  attachHoverTooltips(matrixEl, ".matchups-row-header, .matchups-col-header", (cell) => {
    const text = cell.querySelector(".matchups-row-header-text, .matchups-col-header-text");
    return text && fullTextIfTruncated(text) ? cell.dataset.tooltip : null;
  });

  let allDecks = []; // { id, name, commanderId, partnerId } — one per unique commander(+partner) combo actually played
  let matchSides = []; // { side1, side2: deckId, side1GameWins, side2GameWins, gameDraws }
  let topPlayedIds = []; // the default "most played" table — reused whenever switching back to it
  const selected = []; // deck ids, in selection order — also matrix row/column order

  function deckIdOf(entry) {
    return `${entry.commander_id}_${entry.partner_commander_id ?? ""}`;
  }

  // Everything below is built from the events the league/event/"Dal"
  // filters leave in scope (default "Dal": 2 years ago, js/ui.js), fetched
  // batched (js/db.js's fetchEventsResults) and rebuilt on every filter
  // change — decks offered, matrix values and the default "most played" top
  // 10 alike.
  function buildFromData(entries, matches) {
    allDecks = [];
    matchSides = [];
    topPlayedIds = [];
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
      .filter((m) => !isBye(m) && !isDrop(m))
      .map((m) => {
        const e1 = entryByEventPlayer.get(`${m.event_id}_${m.player1_id}`);
        const e2 = entryByEventPlayer.get(`${m.event_id}_${m.player2_id}`);
        if (!e1 || !e2) return null;
        return {
          side1: deckIdOf(e1),
          side2: deckIdOf(e2),
          // Match-basis, matching the rest of the site's own winrate
          // convention — one whole match win/loss/draw, not the individual
          // best-of-3 game score inside it.
          outcome: matchRoundOutcome(m),
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
    // Ties broken by deck name — with many decks played only once or twice,
    // which ones make the top 10 would otherwise depend on whatever order
    // the database happened to return the rows in.
    topPlayedIds = Array.from(playCounts.entries())
      .sort((a, b) => b[1] - a[1] || decksById.get(a[0]).name.localeCompare(decksById.get(b[0]).name, "it"))
      .slice(0, TOP_PLAYED_COUNT)
      .map(([id]) => id);
  }

  // Match-basis, matching the rest of the site's own winrate convention —
  // a whole match's outcome counts once, not its individual game score.
  // Each side is the exact deck id (commander+partner combo) that entry
  // played, so e.g. "Thrasios / Tymna" and "Thrasios / Vial Smasher" are
  // never conflated into the same row. Mirror matches (rowId === colId) are
  // left out of the matrix entirely rather than resolved ambiguously. A
  // draw counts toward `total` (played) but not `wins`, same as everywhere
  // else on the site — an all-draws matchup now reads as a real 0% rather
  // than "no decisive data" (—), which only still shows for a matchup with
  // zero recorded matches at all.
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

      if (m.outcome === "draw") draws += 1;
      else if ((m.outcome === "player1" && rowSide === 1) || (m.outcome === "player2" && rowSide === 2)) wins += 1;
      else losses += 1;
    }
    return { wins, losses, draws, total: wins + losses + draws };
  }

  function renderMatrix() {
    if (allDecks.length === 0) {
      matrixEl.innerHTML = '<p class="page-empty">Nessuna partita nei filtri selezionati.</p>';
      return;
    }
    if (selected.length < 2) {
      matrixEl.innerHTML = '<p class="page-empty">Seleziona almeno 2 comandanti per generare la matrice.</p>';
      return;
    }

    const rows = selected.map((id) => allDecks.find((d) => d.id === id)).filter(Boolean);

    // The site's list look (a .history-panel-like panel, js/history-list.js):
    // every cell a small rounded tile, the row names tiles like the list's
    // sub-cards. The panel (.matchups-matrix-wrap) and what scrolls inside
    // its padding (.matchups-matrix-scroll) are two boxes, so the scrollbar
    // stays inside the panel's rounded edges.
    matrixEl.innerHTML = `<div class="matchups-matrix-wrap"><div class="matchups-matrix-scroll"><table class="matchups-table">
      <thead>
        <tr>
          <th class="matchups-corner-header"></th>
          ${rows.map((c) => `<th class="matchups-col-header" data-tooltip="${escapeHtml(c.name)}"><span class="matchups-col-header-text">${escapeHtml(c.name)}</span></th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (rowCmd) => `
          <tr>
            <th class="matchups-row-header" data-tooltip="${escapeHtml(rowCmd.name)}"><span class="matchups-row-header-text">${escapeHtml(rowCmd.name)}</span></th>
            ${rows
              .map((colCmd) => {
                // The diagonal (a deck against itself): left out.
                if (rowCmd.id === colCmd.id) {
                  return '<td class="matchups-cell matchups-cell-mirror" aria-label="Stesso comandante"></td>';
                }
                const cell = computeCell(rowCmd.id, colCmd.id);
                if (!cell || cell.total === 0) {
                  return '<td class="matchups-cell matchups-cell-empty">&mdash;</td>';
                }
                const pct = (cell.wins / cell.total) * 100;
                const { side, heat } = heatAttrs(pct);
                // Match-basis V-S-P, same order/format as the rest of the
                // site's own V-S-P columns.
                const title = `${cell.wins}-${cell.losses}-${cell.draws} (${cell.total} match totali)`;
                // The record in V-S-P order (same as every other table), not
                // just the match count — a draw is a match played but a win
                // for neither side, so without it two mirror cells (e.g. 50%
                // vs 0%) looked contradictory. Under the percentage, like a
                // list's number over its label.
                return `<td class="matchups-cell ${side}" style="--heat:${heat};" title="${escapeHtml(title)}"><span class="matchups-cell-pct">${pct.toFixed(0)}%</span><span class="matchups-cell-count">${cell.wins}-${cell.losses}-${cell.draws}</span></td>`;
              })
              .join("")}
          </tr>`
          )
          .join("")}
      </tbody>
    </table></div></div>`;
    const wrap = matrixEl.querySelector(".matchups-matrix-scroll");
    fitColumns(wrap);
    // Mouse users drag it sideways like a finger swipes it (js/drag-scroll.js).
    // Phones' one-column mode: released, it glides to the next / previous
    // column, like the carousels; otherwise it scrolls freely (only when it
    // doesn't fit — .is-scrollable / .is-dragging set there).
    if (columnModeQuery.matches) {
      enableSnapDrag(wrap, {
        canDrag: () => wrap.scrollWidth > wrap.clientWidth + 1,
        targetLeft: (forward) => {
          const stops = columnStops(wrap);
          const now = wrap.scrollLeft;
          const next = forward ? stops.find((x) => x > now + 1) : [...stops].reverse().find((x) => x < now - 1);
          return next ?? (forward ? stops[stops.length - 1] : stops[0]) ?? now;
        },
      });
    } else {
      enableDragScroll(wrap);
    }
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

  // Filters, same trio and behaviour as Comandanti/Archetipi/Giocatori: the
  // "Dal" date narrows whichever event ids the league/event scope filter
  // last reported.
  const leagueSelect = document.getElementById("matchups-league-filter");
  const eventSelect = document.getElementById("matchups-event-filter");
  const dateFromInput = document.getElementById("matchups-date-from");
  let eventDateById = new Map();
  let lastScopeEventIds = [];

  function effectiveEventIds() {
    const from = dateFromInput.value;
    if (!from) return lastScopeEventIds;
    return lastScopeEventIds.filter((id) => {
      const d = eventDateById.get(id);
      return d && d >= from;
    });
  }

  // Refetches the scope's data and rebuilds everything from it. A custom
  // table keeps the decks picked so far that are still in scope. loadToken:
  // if the filters change again before a slower earlier fetch lands, that
  // stale result is dropped rather than overwriting the newer one.
  let loadToken = 0;
  async function load() {
    const token = ++loadToken;
    matrixEl.innerHTML = '<p class="page-loading">Caricamento...</p>';
    try {
      const eventsData = await fetchEventsResults(effectiveEventIds());
      if (token !== loadToken) return;
      buildFromData(
        eventsData.flatMap((d) => d.entries),
        eventsData.flatMap((d) => d.matches)
      );
      if (customMode) {
        const inScope = new Set(allDecks.map((d) => d.id));
        const kept = selected.filter((id) => inScope.has(id));
        selected.length = 0;
        selected.push(...kept);
        updateCount();
        renderSelectedList();
      } else {
        selected.length = 0;
        selected.push(...topPlayedIds);
      }
      renderMatrix();
    } catch (err) {
      if (token === loadToken) showError(matrixEl, err);
    }
  }

  try {
    const events = await Events.list();
    eventDateById = new Map(events.map((e) => [e.id, e.event_date]));
  } catch (err) {
    showError(matrixEl, err);
    hidePageLoading();
    return;
  }

  // Default "Dal": the last DEFAULT_DATE_FROM_YEARS years (js/ui.js) — set
  // before the first load, so that load already fetches only that window.
  dateFromInput.value = isoDateYearsAgo(DEFAULT_DATE_FROM_YEARS);
  initFilterToggle("matchups-filter-toggle", "matchups-filter-panel");
  dateFromInput.addEventListener("change", load);

  let firstLoad = true;
  await initScopeFilter({
    leagueSelect,
    eventSelect,
    onChange: (eventIds) => {
      lastScopeEventIds = eventIds;
      const done = load();
      if (firstLoad) {
        firstLoad = false;
        done.finally(hidePageLoading);
      }
    },
  });
}

init();
