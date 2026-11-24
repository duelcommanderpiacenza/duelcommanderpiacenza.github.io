// social.html: the latest videos and Moxfield decks, from decks.json /
// videos.json (repo files refreshed daily by a GitHub Actions cron —
// scripts/update-latest-*.mjs). Two sections, each in its own card like the
// Bacheca's (since 2026-11-24, user — they were behind a Video | Mazzi
// switcher): Video — a row of thumbnails sliding sideways
// (js/chart-carousel.js: the charts' dots, and arrows on a computer), the
// matchup over its series and date; Mazzi — the latest DECKS_SHOWN as the
// Classifica's rows, the commander over the event and the pilot, the
// finishing position as the round chip. Every card opens the video / deck
// on YouTube / Moxfield, in a new tab.
import { hidePageLoading } from "./page-loading.js";
import { escapeHtml, formatDate } from "./ui.js";
import { historyPosHtml } from "./history-list.js";
import { initChartCarousel } from "./chart-carousel.js";

// How many decks the Mazzi card lists (the rest: "Tutti i mazzi su Moxfield")
// — a computer shows only the first 5 (styles.css .social-deck-list), so
// its two cards side by side stay level.
const DECKS_SHOWN = 8;

// Added in the last day: a small "Nuovo" chip.
const RECENT_MS = 24 * 60 * 60 * 1000;
const isRecent = (iso) => {
  const t = new Date(iso ?? "").getTime();
  return !Number.isNaN(t) && Date.now() - t <= RECENT_MS;
};
const NEW_CHIP = '<span class="social-new">Nuovo</span>';
const dateOf = (iso) => (iso ? formatDate(iso.slice(0, 10)) : "");

// --- Video ---------------------------------------------------------------------

// "Duel Commander MTGO // Brigid VS Nissa // Commander Anatomy" → the matchup
// as the title; the series (and "MTGO" when the first part says so) as the
// line under it. Any other title: as it is.
function videoParts(title) {
  const parts = (title ?? "").split("//").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return { title: title ?? "", meta: [] };
  const platform = parts[0].replace(/^Duel Commander/i, "").trim();
  return { title: parts[1], meta: [platform, parts.slice(2).join(" · ")].filter(Boolean) };
}

function videoCardHtml(video) {
  const { title, meta } = videoParts(video.title);
  const line = [...meta, dateOf(video.publishedAtUtc)].filter(Boolean).map(escapeHtml).join(" · ");
  return `
    <a class="social-video" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">
      <span class="social-video-thumb"><img src="${escapeHtml(video.thumbnailUrl)}" alt="" loading="lazy"></span>
      <span class="social-video-text">
        <span class="social-video-title">${escapeHtml(title)}${isRecent(video.publishedAtUtc) ? NEW_CHIP : ""}</span>
        <span class="social-video-meta">${line}</span>
      </span>
    </a>`;
}

// The filters above a list, the Dove bar's shape (styles.css .social-chips;
// Tutti, then one per kind — always all of them, even a kind with nothing
// yet: its own empty line then), redrawing it on a tap — then `after(listEl)`.
// `kindOf(row)`: the row's kind key; `kinds`: [{ key, label, short, empty }]
// in order — `short`, if any, the label on narrow screens (styles.css
// .social-chip-short: the filters beside the title on phones too).
function renderWithChips({ rows, chipsEl, listEl, kinds, kindOf, draw, emptyAll, after = () => {} }) {
  listEl.className = "";
  let current = "";
  const chip = (key, label, short) =>
    `<button type="button" class="social-chip${key === current ? " is-active" : ""}" aria-pressed="${key === current}" data-kind="${key}"${short ? ` aria-label="${escapeHtml(label)}"` : ""}>${
      short
        ? `<span class="social-chip-long">${escapeHtml(label)}</span><span class="social-chip-short" aria-hidden="true">${escapeHtml(short)}</span>`
        : escapeHtml(label)
    }</button>`;
  const redraw = () => {
    chipsEl.innerHTML = `<div class="social-chips">${chip("", "Tutti")}${kinds.map((k) => chip(k.key, k.label, k.short)).join("")}</div>`;
    const shown = current ? rows.filter((r) => kindOf(r) === current) : rows;
    const empty = current ? kinds.find((k) => k.key === current).empty : emptyAll;
    listEl.innerHTML = shown.length ? draw(shown) : `<p class="page-empty">${empty}</p>`;
    after(listEl);
  };
  chipsEl.addEventListener("click", (e) => {
    const button = e.target.closest("[data-kind]");
    if (!button) return;
    current = button.dataset.kind;
    redraw();
  });
  redraw();
}

// Gameplay (the matches played live) or Commander Anatomy (the MTGO
// series) — from the title: every video's YouTube category is "Gameplay".
const VIDEO_KINDS = [
  { key: "gameplay", label: "IRL Gameplay", short: "IRL", empty: "Nessun video di gameplay dal vivo ancora." },
  { key: "anatomy", label: "Commander Anatomy", short: "Anatomy", empty: "Nessun episodio di Commander Anatomy ancora." },
];
const videoKind = (video) => (/commander anatomy/i.test(video.title ?? "") ? "anatomy" : "gameplay");

// The row's edges fade out where there's more to scroll that way (styles.css
// .social-video-row, like the scrolling lists' .history-scroll fades).
function initRowFade(row) {
  if (!row) return;
  const update = () => {
    row.classList.toggle("can-scroll-left", row.scrollLeft > 1);
    row.classList.toggle("can-scroll-right", row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
  };
  row.addEventListener("scroll", update, { passive: true });
  // On the row itself: nothing to clean up when a redraw throws it away.
  new ResizeObserver(update).observe(row);
  update();
}

function renderVideos(videos) {
  renderWithChips({
    rows: videos,
    chipsEl: document.getElementById("video-filters-slot"),
    listEl: document.getElementById("videos"),
    kinds: VIDEO_KINDS,
    kindOf: videoKind,
    // A row sliding sideways (.chart-grid: the charts' scroll-snap row), its
    // dots / arrows rebuilt on every redraw.
    draw: (shown) => `<div class="chart-grid social-video-row">${shown.map(videoCardHtml).join("")}</div>`,
    after: (listEl) => {
      initChartCarousel(listEl, { prevLabel: "Video precedente", nextLabel: "Video successivo" });
      initRowFade(listEl.querySelector(".social-video-row"));
    },
    emptyAll: "Nessun video ancora.",
  });
}

// --- Mazzi ----------------------------------------------------------------------

// "W26 2/7 - Rank 01/29 - DC - Silver Chariot 🤺 (Sancho182)" → the event
// ("Tappa 2/7"), the position (1, of 29) and the pilot (the last bracket); a
// "[PRIMER]" deck is a primer. Any other name: shown as it is under the
// commander.
function deckParts(deck) {
  const name = deck.name ?? "";
  if (/^\[PRIMER\]/i.test(name)) return { meta: ["Primer"], position: null };
  const m = name.match(/^\s*[A-Z]\d{2}\s+(\d+\/\d+)\s*-\s*Rank\s+(\d+)\s*\/\s*(\d+)\s*-?\s*(.*)$/i);
  if (!m) return { meta: [name], position: null };
  const pilot = m[4].match(/\(([^()]+)\)\s*$/)?.[1] ?? null;
  return { meta: [`Tappa ${m[1]}`, pilot].filter(Boolean), position: Number(m[2]), of: Number(m[3]) };
}

function deckRowHtml(deck) {
  const { meta, position, of } = deckParts(deck);
  const art = deck.previewImageUrl
    ? `<img src="${escapeHtml(deck.previewImageUrl)}" alt="" loading="lazy">`
    : `<span>${escapeHtml((deck.commanderName || "?").slice(0, 1))}</span>`;
  return `
    <a class="social-deck" href="${escapeHtml(deck.url)}" target="_blank" rel="noopener noreferrer">
      <span class="social-deck-art">${art}</span>
      <span class="social-deck-text">
        <span class="social-deck-name">${escapeHtml(deck.commanderName || deck.name)}${isRecent(deck.updatedAtUtc) ? NEW_CHIP : ""}</span>
        <span class="social-deck-meta">${meta.map(escapeHtml).join(" · ")}</span>
      </span>
      <span class="social-deck-side">
        ${position ? `<span title="${position}° su ${of}">${historyPosHtml(position)}</span>` : ""}
        <span class="social-deck-date">${escapeHtml(dateOf(deck.updatedAtUtc))}</span>
      </span>
    </a>`;
}

// A tournament's decklist or a primer (a name starting with "[PRIMER]").
const DECK_KINDS = [
  { key: "tournament", label: "Tornei", empty: "Nessuna lista da torneo ancora." },
  { key: "primer", label: "Primer", empty: "Nessun primer ancora." },
];
const deckKind = (deck) => (/^\[PRIMER\]/i.test(deck.name ?? "") ? "primer" : "tournament");

function renderDecks(decks) {
  renderWithChips({
    rows: decks,
    chipsEl: document.getElementById("deck-filters-slot"),
    listEl: document.getElementById("decks"),
    kinds: DECK_KINDS,
    kindOf: deckKind,
    draw: (shown) => `<div class="social-deck-list">${shown.slice(0, DECKS_SHOWN).map(deckRowHtml).join("")}</div>`,
    emptyAll: "Nessun mazzo ancora.",
  });
}

// --- Loading --------------------------------------------------------------------

async function load(file, render, elId, what) {
  try {
    const rows = await (await fetch(file)).json();
    render(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error(err);
    const el = document.getElementById(elId);
    el.className = "";
    el.innerHTML = `<p class="page-empty">Impossibile caricare ${what}.</p>`;
  }
}

// In-app page (js/router.js): social.html's <main> (data-page="social") is
// mounted by the router, on first load and after each in-app navigation;
// `signal` aborts when the page is left. Opened straight from a file://
// path, the two JSON files can't be fetched: a note instead.
export function mount({ signal = new AbortController().signal } = {}) {
  if (window.location.protocol === "file:") {
    for (const id of ["videos", "decks"]) {
      document.getElementById(id).innerHTML =
        '<p class="page-empty">Apri il sito da un piccolo server locale: da <code>file://</code> i dati non si caricano.</p>';
    }
    hidePageLoading(signal);
    return;
  }
  return Promise.allSettled([
    load("videos.json", renderVideos, "videos", "i video"),
    load("decks.json", renderDecks, "decks", "i mazzi"),
  ]).then(() => hidePageLoading(signal));
}
