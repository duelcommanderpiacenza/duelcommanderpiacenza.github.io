// social.html: the latest videos and Moxfield decks, from decks.json /
// videos.json (repo files refreshed daily by a GitHub Actions cron —
// scripts/update-latest-*.mjs). Two sections behind the site's segmented
// control (js/tabs.js, like event.html's): Video — a grid of thumbnails, the
// matchup big over its series and date; Mazzi — the site's sub-card list
// (js/history-list.js), the commander big over the event and the pilot, the
// finishing position as the round chip. Every card opens the video / deck
// on YouTube / Moxfield, in a new tab.
import { hidePageLoading } from "./page-loading.js";
import { initTabs } from "./tabs.js";
import { escapeHtml, formatDate } from "./ui.js";
import { historyPanelHtml, historyPosHtml } from "./history-list.js";

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

// The filters above a list, a small segmented control (styles.css
// .social-chips; Tutti, then one per kind — always all of
// them, even a kind with nothing yet: its own empty line then), redrawing
// it on a tap. `kindOf(row)`: the row's kind key; `kinds`: [{ key, label,
// empty }] in order.
function renderWithChips({ rows, chipsEl, listEl, kinds, kindOf, draw, emptyAll }) {
  listEl.className = "";
  let current = "";
  const chip = (key, label) =>
    `<button type="button" class="social-chip${key === current ? " is-active" : ""}" aria-pressed="${key === current}" data-kind="${key}">${escapeHtml(label)}</button>`;
  const redraw = () => {
    chipsEl.innerHTML = `<div class="social-chips">${chip("", "Tutti")}${kinds.map((k) => chip(k.key, k.label)).join("")}</div>`;
    const shown = current ? rows.filter((r) => kindOf(r) === current) : rows;
    const empty = current ? kinds.find((k) => k.key === current).empty : emptyAll;
    listEl.innerHTML = shown.length ? draw(shown) : `<p class="page-empty">${empty}</p>`;
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
  { key: "gameplay", label: "IRL Gameplay", empty: "Nessun video di gameplay dal vivo ancora." },
  { key: "anatomy", label: "Commander Anatomy", empty: "Nessun episodio di Commander Anatomy ancora." },
];
const videoKind = (video) => (/commander anatomy/i.test(video.title ?? "") ? "anatomy" : "gameplay");

function renderVideos(videos) {
  renderWithChips({
    rows: videos,
    chipsEl: document.getElementById("video-filters-slot"),
    listEl: document.getElementById("videos"),
    kinds: VIDEO_KINDS,
    kindOf: videoKind,
    draw: (shown) => `<div class="social-video-grid">${shown.map(videoCardHtml).join("")}</div>`,
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
    <a class="history-item social-deck" href="${escapeHtml(deck.url)}" target="_blank" rel="noopener noreferrer">
      <span class="social-deck-art">${art}</span>
      <div class="history-main">
        <span class="history-title">${escapeHtml(deck.commanderName || deck.name)}${isRecent(deck.updatedAtUtc) ? NEW_CHIP : ""}</span>
        <span class="history-meta">${meta.map(escapeHtml).join(" · ")}</span>
      </div>
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
    draw: (shown) => historyPanelHtml(shown.map(deckRowHtml).join(""), { scroll: false }),
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
  initTabs(document.querySelector(".social-tabs"));
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
