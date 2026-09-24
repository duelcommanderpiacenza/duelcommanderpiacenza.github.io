// Site-wide search — one shared markup block (see the .site-search* CSS)
// styled as a desktop pill or, on touch devices, a round trigger opening a
// full-screen overlay. Results are matched client-side against the same
// Players/Commanders/Events/Leagues lists the rest of the public site
// already fetches elsewhere — there's no server-side search/full-text
// index, and for a small club's dataset a plain substring filter over all
// four lists is cheap enough to redo on every keystroke without debouncing.
import { Players, Commanders, Events, Leagues } from "./db.js";
import { escapeHtml, eventTitle } from "./ui.js";

const MAX_RESULTS_PER_TYPE = 5;

// One flat, ranked list rather than a list per type with its own heading —
// each row carries its own small type tag instead (see .site-search-result-type),
// which reads fine at up to 4 types without the dropdown turning into 4
// separate mini-sections stacked on top of each other.
const RESULT_TYPES = [
  { key: "players", label: "Giocatore", href: (p) => `player.html?id=${p.id}`, getText: (p) => `${p.name} ${p.handle ?? ""}` },
  { key: "events", label: "Evento", href: (e) => `event.html?id=${e.id}`, getText: (e) => `${eventTitle(e)} ${e.league?.name ?? ""}` },
  { key: "leagues", label: "Lega", href: (l) => `league.html?id=${l.id}`, getText: (l) => l.name },
  { key: "commanders", label: "Comandante", href: (c) => `commander.html?id=${c.id}`, getText: (c) => c.name },
];

function resultLabel(item, type) {
  return type.key === "events" ? eventTitle(item) : item.name;
}

function init() {
  const box = document.getElementById("site-search-box");
  const trigger = document.getElementById("site-search-trigger");
  const closeBtn = document.getElementById("site-search-close");
  const input = document.getElementById("site-search-input");
  const resultsEl = document.getElementById("site-search-results");
  if (!box || !trigger || !closeBtn || !input || !resultsEl) return;

  // Fetched lazily (on first open, not on every page load) and cached for
  // the rest of this page view — every public page would otherwise pay for
  // four extra requests up front whether or not its visitor ever searches.
  let dataByType = null;
  let dataPromise = null;
  function ensureDataLoaded() {
    if (!dataPromise) {
      dataPromise = Promise.all([Players.list(), Events.list(), Leagues.list(), Commanders.list()])
        .then(([players, events, leagues, commanders]) => {
          dataByType = { players, events, leagues, commanders };
        })
        .catch((err) => {
          console.error(err);
          dataByType = { players: [], events: [], leagues: [], commanders: [] };
        });
    }
    return dataPromise;
  }

  function render() {
    const term = input.value.trim().toLowerCase();
    if (!term) {
      resultsEl.innerHTML = '<p class="site-search-hint">Digita per cercare giocatori, eventi, leghe o comandanti.</p>';
      return;
    }
    if (!dataByType) {
      resultsEl.innerHTML = '<p class="site-search-hint">Caricamento...</p>';
      return;
    }

    const rowsHtml = RESULT_TYPES.map((type) =>
      dataByType[type.key]
        .filter((item) => type.getText(item).toLowerCase().includes(term))
        .slice(0, MAX_RESULTS_PER_TYPE)
        .map(
          (item) => `<a class="site-search-result" href="${type.href(item)}">
            <span class="site-search-result-label">${escapeHtml(resultLabel(item, type))}</span>
            <span class="site-search-result-type">${type.label}</span>
          </a>`
        )
        .join("")
    ).join("");

    resultsEl.innerHTML = rowsHtml || '<p class="site-search-hint">Nessun risultato trovato.</p>';
  }

  function open() {
    box.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    render();
    ensureDataLoaded().then(render);
    // Desktop: the input focusing itself is what called this in the first
    // place (see the "focus" listener below) — re-focusing would just
    // re-enter here harmlessly, but skipping it avoids that redundant round
    // trip. Mobile: the trigger button (not the input) was clicked, so the
    // overlay's own field still needs focusing to raise the keyboard.
    if (document.activeElement !== input) input.focus();
  }

  function close() {
    box.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", open);
  input.addEventListener("focus", open);
  input.addEventListener("input", render);

  closeBtn.addEventListener("click", () => {
    input.value = "";
    close();
    trigger.focus();
  });

  document.addEventListener("click", (e) => {
    // trigger.contains(e.target), not e.target !== trigger — a click lands
    // on the <svg> icon inside the button, not the button itself, so the
    // stricter equality check treated every click on the icon as "outside"
    // and closed the overlay again in the very same click that opened it.
    if (box.classList.contains("is-open") && !box.contains(e.target) && !trigger.contains(e.target)) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && box.classList.contains("is-open")) {
      close();
      trigger.focus();
    }
  });
}

init();
