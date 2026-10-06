// The player card's cosmetics, earned from the linked player's results
// (player_progress, js/card-progress.js) — on account.html's own card and
// player.html's public one. Each criterion family dresses its own part of
// the card, so effects of different families stack on the same card;
// within a family only the highest tier reached shows. The looks are
// styles.css's .fx-* / .pc-fx-* rules (the player card section).
//
//   Presenze  (events played)        frame round the card: silver → foil →
//                                    gold → mythic orange
//   Vittorie  (matches won)          over the commander art: light foil →
//                                    etched foil → rainbow holo → holo +
//                                    sparks rising over the card
//   Podio     (top 8s, 20+ players)  a bar behind the name: grey → gold →
//                                    mythic orange
//   Collezione (distinct commanders) a foil seal at the card's foot, like
//                                    real rares: silver → gold → rainbow
//   Campione  (real leagues won)     one gold star after "Dal …" with the
//                                    number of leagues won beside it
//
import { openInfoDialog } from "./info-dialog.js";
import { BIG_EVENT_MIN_PLAYERS } from "./card-progress.js";

// A family's thresholds, lowest first: tier n (1-based) = the n-th reached.
export const CARD_COSMETICS = {
  rim: { stat: "events_played", thresholds: [10, 25, 50, 100] },
  art: { stat: "matches_won", thresholds: [25, 50, 100, 150] },
  podium: { stat: "big_top8s", thresholds: [3, 10, 20] },
  seal: { stat: "commanders", thresholds: [5, 10, 20] },
};

export function cosmeticTier(family, progress) {
  const { stat, thresholds } = CARD_COSMETICS[family];
  const value = progress?.[stat] ?? 0;
  return thresholds.filter((threshold) => value >= threshold).length;
}

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Dresses a player card (the .player-card element) from its progress row, or
 * strips every cosmetic when `progress` is null (no linked player, no
 * results, the table missing). Safe to call again on the same card — the
 * profile redraws its card on every edit: it first removes what it added.
 */
export function applyCardCosmetics(cardEl, progress) {
  if (!cardEl) return;
  cardEl.querySelectorAll(".pc-fx").forEach((el) => el.remove());
  cardEl.classList.remove(...[...cardEl.classList].filter((c) => c.startsWith("fx-")));
  if (!progress) return;

  const tiers = Object.fromEntries(Object.keys(CARD_COSMETICS).map((family) => [family, cosmeticTier(family, progress)]));

  if (tiers.rim) cardEl.classList.add("fx-rim", `fx-rim-${tiers.rim}`);
  if (tiers.art) {
    cardEl.classList.add(`fx-art-${tiers.art}`);
    // The top tier is the one below's holo plus the sparks.
    if (tiers.art === 4) cardEl.classList.add("fx-art-3");
    cardEl.querySelector(".pc-art")?.insertAdjacentHTML("afterend", '<div class="pc-fx pc-fx-art" aria-hidden="true"></div>');
    if (tiers.art === 4) {
      cardEl.querySelector(".pc-surface")?.insertAdjacentHTML("beforeend", '<div class="pc-fx pc-fx-sparks" aria-hidden="true"></div>');
    }
  }
  if (tiers.podium) {
    cardEl.classList.add(`fx-podium-${tiers.podium}`);
    cardEl.querySelector(".pc-nameplate")?.insertAdjacentHTML("afterbegin", '<span class="pc-fx pc-fx-ribbon" aria-hidden="true"></span>');
  }
  if (tiers.seal) {
    cardEl.classList.add(`fx-seal-${tiers.seal}`);
    cardEl.querySelector(".pc-foot")?.insertAdjacentHTML(
      "beforeend",
      `<span class="pc-fx pc-fx-seal" title="${progress.commanders} comandanti diversi giocati"></span>`
    );
  }

  const leagues = progress.leagues_won ?? [];
  const sinceEl = cardEl.querySelector(".pc-since");
  if (leagues.length && sinceEl) {
    // One star with the number beside it, however many (the hover text
    // lists the leagues).
    sinceEl.insertAdjacentHTML(
      "beforeend",
      `<span class="pc-fx pc-fx-stars"><span class="pc-fx-star" title="Campione: ${escapeAttr(leagues.join(", "))}">★<span class="pc-fx-star-count">${leagues.length}</span></span></span>`
    );
  }
}

// --- The "?" explanation (account.html, next to "Le tue statistiche") ---

// What each family's tiers are called and counted in, for the pop-up — its
// thresholds come from CARD_COSMETICS above, so the two never disagree.
const FAMILY_INFO = {
  rim: {
    title: "Presenze",
    text: "La cornice della carta",
    count: (n) => `${n} eventi`,
    tiers: ["Argento", "Foil", "Oro", "Mitica"],
  },
  art: {
    title: "Vittorie",
    text: "Effetti foil",
    count: (n) => `${n} vittorie`,
    tiers: ["Foil", "Foil inciso", "Olografica", "Olografica con scintille"],
  },
  podium: {
    title: "Podio",
    text: `Una barra dietro il nome (top 8 in eventi con ${BIG_EVENT_MIN_PLAYERS} o più giocatori)`,
    count: (n) => `${n} top 8`,
    tiers: ["Grigia", "Oro", "Mitica"],
  },
  seal: {
    title: "Comandanti giocati",
    text: "Un sigillo in fondo alla carta",
    count: (n) => `${n} comandanti`,
    tiers: ["Argento", "Oro", "Arcobaleno"],
  },
};

// A small blank card (a neutral "art" gradient, no text, an invisible
// stand-in for the glass panel — so the name's bar sits where it does on a
// real card) — the same
// .player-card markup the real ones use, so the very same CSS dresses it;
// everything in it is sized in cqw, so it just scales down.
function previewCardHtml(attrs) {
  return `<article class="player-card pc-preview" aria-hidden="true" ${attrs}>
    <div class="pc-frame"><div class="pc-surface">
      <div class="pc-art is-loaded"></div>
      <div class="pc-content">
        <div class="pc-art-space"></div>
        <div class="pc-nameplate"><div class="pc-nameplate-text"><p class="pc-name">&nbsp;</p></div></div>
        <div class="pc-panel"></div>
        <div class="pc-foot"><span class="pc-since">&nbsp;</span></div>
      </div>
    </div></div>
  </article>`;
}

// One family's row of previews: each a blank card dressed as `progress`,
// with its tier's name and what it takes.
function tiersHtml(tiers) {
  return `<ul class="card-effects-tiers">${tiers
    .map(
      (t) => `
      <li>
        ${previewCardHtml(`data-progress="${escapeAttr(JSON.stringify(t.progress))}"`)}
        <span><strong>${t.name}</strong>${t.count}</span>
      </li>`
    )
    .join("")}</ul>`;
}

// The pop-up: each family with one small live preview per tier (the effect
// on a blank card) and how much it takes; then the league stars.
export function openCardEffectsInfo() {
  const families = Object.entries(FAMILY_INFO)
    .map(
      ([family, info]) => `
      <section class="card-effects-family">
        <h4>${info.title}</h4>
        <p>${info.text}</p>
        ${tiersHtml(
          CARD_COSMETICS[family].thresholds.map((threshold, i) => ({
            name: info.tiers[i],
            count: info.count(threshold),
            progress: { [CARD_COSMETICS[family].stat]: threshold },
          }))
        )}
      </section>`
    )
    .join("");
  const leagues = (n) => Array.from({ length: n }, (_, i) => `Lega ${i + 1}`);
  const dialog = openInfoDialog({
    id: "card-effects-dialog",
    title: "Effetti della carta",
    bodyHtml: `
      <p>La tua carta si arricchisce giocando</p>
      ${families}
      <section class="card-effects-family">
        <h4>Campione</h4>
        <p>Una stella dorata con il numero di leghe vinte</p>
        ${tiersHtml([{ name: "Stella", count: "da 1 lega vinta", progress: { leagues_won: leagues(1) } }])}
      </section>`,
  });
  // The previews dressed by the real code (idempotent: fine on every
  // reopening).
  for (const card of dialog.querySelectorAll(".pc-preview[data-progress]")) {
    applyCardCosmetics(card, JSON.parse(card.dataset.progress));
  }
}

// The frame's width on each side (px) — the cards' sizing code (player.html,
// account.html) measures it rather than assuming one: a Presenze frame is
// wider than none.
export function cardFrameWidth(cardEl) {
  const frame = cardEl?.querySelector(".pc-frame");
  return frame ? parseFloat(getComputedStyle(frame).paddingLeft) || 0 : 0;
}
