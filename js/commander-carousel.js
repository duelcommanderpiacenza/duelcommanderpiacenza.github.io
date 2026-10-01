// player.html's "Album comandanti": a card carousel instead of a table —
// one commander's card (Scryfall image) at a time — on desktop lined up
// with the page's left margin, the next ones peeking in on the right turned
// away as if on a drum and a card leaving on the left fading out; on phones
// centered, its neighbours peeking on both sides (applyDepth) — with the
// current one's stats (times played, winrate, first and last played) under
// it on phones and
// beside it on desktop (styles.css .cmd-carousel). The track is a native
// scroll-snap row, so touch swipes and trackpads already land on whole
// cards; ‹ › arrows (hidden on touch devices, like js/chart-carousel.js's),
// the arrow keys, clicking a peeking card, and dragging with the mouse
// (js/drag-scroll.js's enableSnapDrag: glides to the next card in the
// drag's direction on release, like the chart carousel) move it too.

import { escapeHtml, commanderPairWithColors, formatDate } from "./ui.js";
import { winRatePct } from "./winrate.js";
import { enableSnapDrag } from "./drag-scroll.js";
import { openInfoDialog } from "./info-dialog.js";

// Scryfall's collection endpoint takes up to this many cards per request —
// one request for a whole player's commanders instead of one each (and
// Scryfall asks clients to keep to ~10 requests a second).
const SCRYFALL_BATCH = 75;

// Lowercased card name -> front image URL ("normal" size, same as
// commander.html's card). Keyed by both the full name and each face's own,
// since a double-faced commander may be stored under its front face's name
// ("A") while Scryfall's full name is "A // B". Only the front face is ever
// used. Never rejects — a missing image just leaves the card's placeholder.
async function fetchCardImages(names) {
  const images = new Map();
  for (let i = 0; i < names.length; i += SCRYFALL_BATCH) {
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identifiers: names.slice(i, i + SCRYFALL_BATCH).map((name) => ({ name })) }),
      });
      if (!res.ok) continue;
      for (const card of (await res.json()).data ?? []) {
        const url = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
        if (!url) continue;
        for (const name of [card.name, ...(card.card_faces ?? []).map((f) => f.name)]) {
          images.set(name.toLowerCase(), url);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
  return images;
}

// Special card finishes in the album, earned by how many events the player
// has played that commander in (its "Volte giocato"). Lowest first; a card
// gets the highest one it qualifies for, and each one's classes (styles.css)
// usually include the ones below it — the gilded card is still a foil. The
// "?" explanation is built from this same list, so a new finish is a row
// here plus its look in styles.css (.cmd-carousel-slide.<class> and the
// dialog's .card-finish-preview.<class>), nothing else.
export const CARD_FINISHES = [
  { minTimesPlayed: 10, classes: "is-foil", name: "Foil" },
  { minTimesPlayed: 25, classes: "is-foil is-gilded", name: "Foil dorata" },
  { minTimesPlayed: 50, classes: "is-foil is-gilded is-sparks", name: "Leggendaria" },
];

// Every card (album and dialog preview) carries this empty layer for the
// finishes that need more than the card's own ::before/::after (taken by
// the gilded frame and the foil sheen) — e.g. .is-sparks draws on it.
const FINISH_LAYER = '<span class="card-finish-fx" aria-hidden="true"></span>';

function cardFinish(timesPlayed) {
  let finish = null;
  for (const f of CARD_FINISHES) if (timesPlayed >= f.minTimesPlayed) finish = f;
  return finish;
}

// The "?" next to "Volte giocato" opens this (js/info-dialog.js's shared
// pop-up): one row per finish, each with a small live preview of its look
// on a blank card.
function openFinishInfo() {
  openInfoDialog({
    id: "card-finish-dialog",
    title: "Carte speciali",
    bodyHtml: `
      <p>Più eventi giochi con lo stesso comandante, più la sua carta nell&rsquo;album diventa speciale:</p>
      <ul class="card-finish-list">
        ${CARD_FINISHES.map(
          (f) => `
          <li>
            <span class="card-finish-preview ${f.classes}" aria-hidden="true">${FINISH_LAYER}</span>
            <span class="card-finish-text"><strong>${f.name}</strong> &middot; da ${f.minTimesPlayed} eventi</span>
          </li>`
        ).join("")}
      </ul>`,
  });
}

const ARROW_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
const ARROW_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';

/**
 * @param {HTMLElement} el
 * @param {Array<{key: string, commander: object, partner: object|null, timesPlayed: number,
 *   firstPlayed: string|null, lastPlayed: string|null}>} items
 *   in display order. A commander + partner pair shows the primary's card.
 * @returns {{ setRecords: (records: Map<string, {wins: number, draws: number, losses: number}>) => void }}
 *   the Winrate tile's match record per item key, handed over once the
 *   player's matches have loaded (after the carousel is already showing) —
 *   "…" until then.
 */
export function renderCommanderCarousel(el, items) {
  if (items.length === 0) {
    el.innerHTML = '<p class="page-empty">Nessun dato registrato per questo giocatore.</p>';
    return { setRecords() {} };
  }
  let records = null;

  el.innerHTML = `<div class="cmd-carousel">
    <div class="cmd-carousel-main">
      <div class="cmd-carousel-track" tabindex="0" role="region" aria-label="Album comandanti">
        ${items
          .map(
            (c, i) => `<div class="cmd-carousel-slide is-loading ${
              cardFinish(c.timesPlayed)?.classes ?? ""
            }" data-index="${i}">
              <span class="cmd-carousel-fallback">${escapeHtml(c.commander.name)}</span>
              ${FINISH_LAYER}
            </div>`
          )
          .join("")}
      </div>
      <div class="cmd-carousel-nav">
        <button type="button" class="chart-carousel-arrow" data-dir="-1" aria-label="Commander precedente">${ARROW_PREV}</button>
        <div class="chart-carousel-dots cmd-carousel-dots" aria-hidden="true"></div>
        <button type="button" class="chart-carousel-arrow" data-dir="1" aria-label="Commander successivo">${ARROW_NEXT}</button>
      </div>
    </div>
    <div class="cmd-carousel-stats" aria-live="polite">
      <div class="cmd-carousel-name"></div>
      <div class="cmd-carousel-tiles">
        <div class="stat-tile">
          <div class="stat-tile-label cmd-carousel-label-help">
            Volte giocato
            <button type="button" class="help-toggle-btn cmd-carousel-help-btn" aria-haspopup="dialog" aria-label="Come si ottiene una carta speciale">?</button>
          </div>
          <div class="stat-tile-value cmd-carousel-stat-value" data-stat="times"></div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-label">Winrate</div>
          <div class="stat-tile-value cmd-carousel-stat-value" data-stat="winrate"></div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-label">Prima partita</div>
          <div class="stat-tile-value cmd-carousel-stat-value" data-stat="first"></div>
        </div>
        <div class="stat-tile">
          <div class="stat-tile-label">Ultima partita</div>
          <div class="stat-tile-value cmd-carousel-stat-value" data-stat="last"></div>
        </div>
      </div>
    </div>
  </div>`;

  const track = el.querySelector(".cmd-carousel-track");
  const slides = [...track.children];
  const dotsEl = el.querySelector(".cmd-carousel-dots");
  const nameEl = el.querySelector(".cmd-carousel-name");
  const timesEl = el.querySelector('[data-stat="times"]');
  const lastEl = el.querySelector('[data-stat="last"]');
  const firstEl = el.querySelector('[data-stat="first"]');
  const winrateEl = el.querySelector('[data-stat="winrate"]');
  const prevBtn = el.querySelector('[data-dir="-1"]');
  const nextBtn = el.querySelector('[data-dir="1"]');
  let active = -1;

  // Card images: once Scryfall's batch lookup has answered, downloaded
  // nearest-first from the current card, a few at a time — not all at once,
  // where a player's 30 cards would share the connection with the one card
  // actually on screen. The order is re-picked from the current card each
  // time a download finishes, so moving to another card moves its
  // neighbourhood to the front of the queue; the current card itself never
  // waits for a free slot.
  const MAX_PARALLEL_IMAGES = 3;
  let imageUrls = null; // slide index -> image URL (null = no image), once Scryfall answers
  const imageStarted = new Set();
  let imagesInFlight = 0;

  function startImage(i) {
    imageStarted.add(i);
    const slide = slides[i];
    const url = imageUrls[i];
    if (!url) return slide.classList.remove("is-loading");
    imagesInFlight += 1;
    const done = () => {
      imagesInFlight -= 1;
      loadNextImages();
    };
    const img = new Image();
    img.alt = items[i].commander.name;
    img.className = "cmd-carousel-img";
    img.draggable = false;
    if (i === active) img.fetchPriority = "high";
    img.onload = () => {
      slide.classList.replace("is-loading", "has-image");
      done();
    };
    img.onerror = () => {
      img.remove();
      slide.classList.remove("is-loading");
      done();
    };
    img.src = url;
    slide.append(img);
  }

  // The not-yet-started slide nearest the current card; at equal distance
  // the next one (on the right, where the desktop peeks) before the previous.
  function nextImageIndex() {
    let best = -1;
    let bestKey = Infinity;
    for (let i = 0; i < slides.length; i++) {
      if (imageStarted.has(i)) continue;
      const d = i - active;
      const key = Math.abs(d) * 2 + (d < 0 ? 1 : 0);
      if (key < bestKey) {
        bestKey = key;
        best = i;
      }
    }
    return best;
  }

  function loadNextImages() {
    if (!imageUrls) return;
    if (!imageStarted.has(active)) startImage(active);
    while (imagesInFlight < MAX_PARALLEL_IMAGES) {
      const i = nextImageIndex();
      if (i < 0) return;
      startImage(i);
    }
  }

  // The slide nearest the current-card slot (the track's left edge) —
  // measured from offsetLeft, which ignores the transforms, so this doesn't
  // shift as they animate.
  function nearestIndex() {
    return Math.max(0, Math.min(items.length - 1, Math.round(track.scrollLeft / step)));
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    slides.forEach((s, j) => s.classList.toggle("is-active", j === i));
    const c = items[i];
    nameEl.innerHTML = commanderPairWithColors(c.commander, c.partner);
    timesEl.textContent = c.timesPlayed;
    lastEl.innerHTML = formatDate(c.lastPlayed);
    firstEl.innerHTML = formatDate(c.firstPlayed);
    renderWinrate();
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === items.length - 1;
    renderDots(i);
    loadNextImages();
  }

  // Match-basis winrate (js/winrate.js). "—" for a commander with no match
  // played (e.g. dropped before round 1).
  function renderWinrate() {
    if (!records) {
      winrateEl.textContent = "…";
      return;
    }
    const r = records.get(items[active].key);
    const rate = r ? winRatePct(r.wins, r.wins + r.draws + r.losses) : null;
    winrateEl.textContent = rate === null ? "—" : `${rate}%`;
  }

  // Not one dot per card (there can be dozens): a window of up to 3 — the
  // current card's (red) and its neighbours' (lighter). On the first/last
  // card, which only have one neighbour, the red dot moves to that end
  // ("• ○ ○" / "○ ○ •").
  function renderDots(i) {
    const count = Math.min(3, items.length);
    const start = Math.max(0, Math.min(i - 1, items.length - count));
    dotsEl.innerHTML = Array.from(
      { length: count },
      (_, k) => `<span class="chart-carousel-dot${start + k === i ? " is-active" : ""}"></span>`
    ).join("");
  }

  // Card positions, step and width, measured once (and again on resize)
  // rather than read back from the layout on every scroll frame — only
  // scrollLeft is read per frame, keeping the drag smooth. The current-card
  // slot is the track's left edge, where the first card sits at
  // scrollLeft 0, so a card's distance from it is its own left minus the
  // first card's.
  let lefts = [];
  let step = 1;
  let cardWidth = 1;
  function measure() {
    lefts = slides.map((s) => s.offsetLeft);
    cardWidth = slides[0].offsetWidth || 1;
    // A lone card has no neighbour to measure the step from — its own width
    // stands in (a tiny fallback like 1px would blow a sub-pixel offset
    // up into "2 cards away" and turn it sideways).
    step = (slides.length > 1 ? lefts[1] - lefts[0] : cardWidth) || 1;
  }

  // Share of the card's width over which a card leaving on the left fades.
  const LEAVE_FADE = 0.45;

  // Two looks, switched at the same width as the layout (styles.css
  // .cmd-carousel's 880px breakpoint), which also moves the current-card
  // slot: the track's left edge on desktop, its center on phones. Either
  // way the first card sits in the slot at scrollLeft 0, so positions,
  // nearestIndex and go() work the same for both — only the looks differ.
  const desktopQuery = window.matchMedia("(min-width: 880px)");

  // Recomputed every scroll frame, so it follows the finger rather than
  // jumping between states. Offsets are in card steps from the current-card
  // slot, capped at ±2 (past that it's off-screen anyway).
  // Phones (centered): the drum on both sides — each card turns away and
  // shrinks the further it is from the center (rotateY(+) turns a
  // right-hand card's outer edge away, rotateY(-) a left-hand one's), both
  // sides dimmed by the track's edge fades (styles.css mask).
  // Desktop (left-aligned):
  // - Right (next cards): the drum, steeper — see below.
  // - Left (a card leaving): it can't turn and peek like on the right —
  //   that would go past the page's left edge — so it fades out instead: a
  //   mask gradient that follows the track's left edge across the card (the
  //   part past the edge is clipped by the track anyway, the part just
  //   inside fades from transparent over LEAVE_FADE of the card), plus an
  //   overall fade as it goes.
  function applyDepth() {
    const anchor = track.scrollLeft + lefts[0];
    const desktop = desktopQuery.matches;
    slides.forEach((s, i) => {
      let offset = Math.max(-2, Math.min(2, (lefts[i] - anchor) / step));
      // A card at rest can sit a sub-pixel off its slot (fractional scroll
      // positions vs. whole-px offsetLeft) — that's "in place", not leaving.
      if (Math.abs(offset) < 0.01) offset = 0;
      if (!desktop) {
        const dist = Math.abs(offset);
        s.style.transform = `perspective(1000px) rotateY(${offset * 26}deg) scale(${1 - dist * 0.1})`;
        s.style.opacity = String(1 - Math.min(dist, 1) * 0.2);
        s.style.maskImage = s.style.webkitMaskImage = "";
        return;
      }
      if (offset >= 0) {
        // Steeply turned, and pulled back toward the current card by a share
        // of the step (its foreshortened silhouette would otherwise leave a
        // gap), so the peek takes little width — the carousel's box is
        // sized for it (styles.css .cmd-carousel-main).
        s.style.transform = `perspective(1000px) translateX(${-offset * step * 0.15}px) rotateY(${
          offset * 45
        }deg) scale(${1 - offset * 0.1})`;
        s.style.opacity = String(1 - Math.min(offset, 1) * 0.2);
        s.style.maskImage = s.style.webkitMaskImage = "";
        return;
      }
      const out = Math.min(1, -offset);
      // Where the track's left edge crosses this card, in its own px.
      const edge = out * step;
      // The fade's strength grows with how far out the card is — fully
      // transparent at the edge only from a fifth of a step on — so it
      // eases in as the card starts to leave rather than switching on.
      const edgeAlpha = 1 - Math.min(1, out * 5);
      const mask = `linear-gradient(to right, rgba(0, 0, 0, ${edgeAlpha}) ${edge}px, #000 ${edge + LEAVE_FADE * cardWidth}px)`;
      // Kept flat (no turn), so the mask's px line up with the track edge.
      s.style.transform = "none";
      s.style.opacity = String(1 - out * 0.8);
      s.style.maskImage = s.style.webkitMaskImage = mask;
    });
  }

  function go(i) {
    track.scrollTo({ left: lefts[Math.max(0, Math.min(items.length - 1, i))] - lefts[0], behavior: "smooth" });
  }

  let frame = 0;
  track.addEventListener(
    "scroll",
    () => {
      // At most one update per frame, however many scroll events arrive.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyDepth();
        setActive(nearestIndex());
      });
    },
    { passive: true }
  );
  // Card width changes at the 880px breakpoint (and with the viewport on
  // phones) — the depth goes by card steps, so recompute, and keep the
  // current card in its slot (which the breakpoint moves: left edge ↔
  // center).
  new ResizeObserver(() => {
    measure();
    if (active >= 0) track.scrollLeft = lefts[active] - lefts[0];
    applyDepth();
  }).observe(track);
  track.addEventListener("click", (e) => {
    const slide = e.target.closest(".cmd-carousel-slide");
    if (slide && !slide.classList.contains("is-active")) go(Number(slide.dataset.index));
  });
  track.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    go(active + (e.key === "ArrowRight" ? 1 : -1));
  });
  // A drag released over a peeking card doesn't also jump to it (the
  // click-to-go above) — enableSnapDrag swallows that click.
  track.classList.toggle("is-draggable", items.length > 1);
  enableSnapDrag(track, {
    canDrag: () => items.length > 1,
    targetLeft: (forward) => {
      const at = track.scrollLeft / step;
      const i = Math.max(0, Math.min(items.length - 1, forward ? Math.ceil(at) : Math.floor(at)));
      return lefts[i] - lefts[0];
    },
  });
  el.querySelector(".cmd-carousel-help-btn").addEventListener("click", openFinishInfo);
  prevBtn.addEventListener("click", () => go(active - 1));
  nextBtn.addEventListener("click", () => go(active + 1));
  measure();
  setActive(0);
  applyDepth();

  fetchCardImages([...new Set(items.map((c) => c.commander.name))]).then((images) => {
    imageUrls = items.map((c) => images.get(c.commander.name.toLowerCase()) ?? null);
    loadNextImages();
  });

  return {
    setRecords(map) {
      records = map;
      renderWinrate();
    },
  };
}
