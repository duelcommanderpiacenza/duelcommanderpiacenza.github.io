import { Commanders, EventEntries, Matches } from "./db.js";
import { matchRoundOutcome, isBye, isDrop } from "./leaderboard.js";
import { initScopeFilter } from "./scope-filter.js";
import { tallyOutcome, renderWinrateTiles } from "./winrate.js";
import { renderLineChart } from "./line-chart.js";
import {
  escapeHtml,
  playerLabel,
  commanderPairLabel,
  colorIdentityPips,
  bannedBadge,
  eventTitle,
  formatDate,
  showError,
  renderPaginated,
} from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { fitTitleToOneLine, alignBackButtonToTitle } from "./page-title-fit.js";

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

// A real JSON lookup rather than Scryfall's simpler image-redirect
// shortcut (.../cards/named?...&format=image) — that one only ever gives
// a single image, but a double-faced commander needs both faces' own
// image URLs to flip between. Returns null (figure stays hidden) rather
// than throwing, for a name Scryfall can't match exactly or if the
// request itself fails — a missing card image is never worth blocking on.
async function fetchScryfallCard(name) {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Split/adventure/flip cards also have a card_faces array in Scryfall's
// data, but only ONE physical image showing both halves already — their
// faces don't carry their own image_uris, only true double-faced cards
// (transform, modal DFC, meld) do, one full image per side. That's the
// actual signal for "this needs a flip button", not just the presence of
// card_faces.
function scryfallCardImages(card) {
  if (card.card_faces?.length >= 2 && card.card_faces.every((f) => f.image_uris)) {
    return card.card_faces.map((f) => f.image_uris.normal);
  }
  return card.image_uris ? [card.image_uris.normal] : [];
}

// The card's top is already pinned to the title's own top for free, via
// position: absolute + top: 0 on .commander-card-figure (see the CSS) —
// this sets its height, in px, so the bottom lands exactly at the stat
// tiles' own bottom edge (#commander-winrate, not its .commander-top-row-main
// wrapper — measuring the wrapper instead of the tiles themselves left a
// few px of slack whenever they didn't happen to be the same). Spanning
// two separate elements (.page-heading and the stat tiles) like that isn't
// something CSS alone can do. Then, now that the image has a real
// rendered width (derived from that height via its own aspect ratio, see
// the CSS), reads it back and sets it as .commander-top-row-main's own
// padding-right — so the stat tiles grow to fill the space right up to
// the card's actual edge, rather than stopping short at a fixed guess
// that doesn't match the image's real (height-dependent) width. Below
// 640px the card drops below the title instead of floating beside it (see
// the CSS), so there's no column layout to match there at all — both
// inline overrides are cleared and the CSS fallbacks take over.
function syncCardImageLayout(cardImageEl) {
  const mainColEl = document.querySelector(".commander-top-row-main");
  if (window.innerWidth <= 640) {
    cardImageEl.style.height = "";
    if (mainColEl) mainColEl.style.paddingRight = "";
    return;
  }
  const headingEl = document.querySelector(".page-heading");
  const winrateBoxesEl = document.getElementById("commander-winrate");
  if (!headingEl || !mainColEl || !winrateBoxesEl) return;
  const top = headingEl.getBoundingClientRect().top;
  const bottom = winrateBoxesEl.getBoundingClientRect().bottom;
  cardImageEl.style.height = `${Math.round(bottom - top)}px`;
  const imageWidth = cardImageEl.getBoundingClientRect().width;
  mainColEl.style.paddingRight = `${Math.round(imageWidth) + 24}px`;
}

function outcomeFor(m, selfIsP1) {
  const outcome = matchRoundOutcome(m);
  if (outcome === "draw") return "draw";
  if ((outcome === "player1" && selfIsP1) || (outcome === "player2" && !selfIsP1)) return "win";
  return "loss";
}

// The score is shown from this commander's own point of view (its wins first).
function selfScoreLabel(m, selfIsP1) {
  return selfIsP1 ? `${m.player1_wins}-${m.player2_wins}-${m.draws}` : `${m.player2_wins}-${m.player1_wins}-${m.draws}`;
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("commander-title");
  const cardFigureEl = document.getElementById("commander-card-figure");
  const cardFlipperEl = document.getElementById("commander-card-flipper");
  const cardImageFrontEl = document.getElementById("commander-card-image-front");
  const cardImageBackEl = document.getElementById("commander-card-image-back");
  const cardFlipBtnEl = document.getElementById("commander-card-flip-btn");
  const winrateEl = document.getElementById("commander-winrate");
  const leagueFilter = document.getElementById("commander-league-filter");
  const eventFilter = document.getElementById("commander-event-filter");
  const playersEl = document.getElementById("commander-players");
  const matchesEl = document.getElementById("commander-matches");
  const decksChartEl = document.getElementById("commander-decks-chart");

  if (!id) {
    titleEl.textContent = "Commander non trovato";
    hidePageLoading();
    return;
  }

  // Scryfall's image and the Winrate stats below (Supabase) load
  // independently, in whichever order actually finishes first — revealing
  // the card as soon as *it* is ready, on its own, meant syncCardImageLayout
  // sometimes measured against the stat tiles' still-showing "Caricamento..."
  // placeholder rather than the real tiles, since those hadn't rendered yet:
  // a visibly smaller card that then jumped to full size once the real
  // stats did land a moment later. Both readiness flags below have to be
  // true before the card is revealed at all, so it only ever appears
  // already at its final, correct size.
  let cardImageReady = false;
  let statsReady = false;
  function revealCardIfReady() {
    if (!cardImageReady || !statsReady || !cardFigureEl.hidden) return;
    cardFigureEl.hidden = false;
    syncCardImageLayout(cardImageFrontEl);
  }

  try {
    const commander = await Commanders.get(id);
    titleEl.innerHTML = `${escapeHtml(commander.name)} ${colorIdentityPips(commander.color_identity)}${
      commander.is_banned ? bannedBadge() : ""
    }`;
    fitTitleToOneLine(titleEl);
    alignBackButtonToTitle(titleEl);

    // Loaded independently of everything else below (not awaited here) — a
    // slow/unreachable Scryfall never blocks the actual page data, and a
    // failed/mismatched lookup just leaves the figure hidden rather than
    // showing a broken image icon.
    cardImageFrontEl.alt = commander.name;
    cardImageFrontEl.addEventListener(
      "load",
      () => {
        cardImageReady = true;
        revealCardIfReady();
      },
      { once: true }
    );
    cardImageFrontEl.addEventListener("error", () => cardFigureEl.hidden = true, { once: true });
    window.addEventListener("resize", () => {
      syncCardImageLayout(cardImageFrontEl);
      fitTitleToOneLine(titleEl);
      alignBackButtonToTitle(titleEl);
    });

    fetchScryfallCard(commander.name).then((card) => {
      if (!card) return;
      const images = scryfallCardImages(card);
      if (images.length === 0) return;
      cardImageFrontEl.src = images[0];
      if (images.length < 2) return;

      // Double-faced (transform/modal DFC) — wire up the flip button and
      // load the back face too, same reasoning as the front: it fails
      // silently (button just never appears) rather than anything visible
      // breaking if this particular URL doesn't resolve.
      cardImageBackEl.alt = `${commander.name} (retro)`;
      cardImageBackEl.src = images[1];
      cardFlipBtnEl.hidden = false;
      cardFlipBtnEl.addEventListener("click", () => {
        const isFlipped = cardFlipperEl.classList.toggle("is-flipped");
        cardFlipBtnEl.setAttribute(
          "aria-label",
          isFlipped ? "Mostra il lato frontale della carta" : "Mostra l'altro lato della carta"
        );
      });
    });

    // Every (event, player) pair that piloted this commander.
    const playedEntries = await EventEntries.listByCommander(id);

    if (playedEntries.length === 0) {
      winrateEl.innerHTML = '<p class="page-empty">Non ci sono ancora dati sufficienti.</p>';
      playersEl.innerHTML = '<p class="page-empty">Nessun giocatore ha ancora usato questo commander.</p>';
      matchesEl.innerHTML = '<p class="page-empty">Nessuna partita registrata.</p>';
      decksChartEl.innerHTML = renderLineChart([], "Non ci sono ancora dati sufficienti.", "Utilizzo");
      // This path skips computeWinrate entirely, which is the only other
      // place statsReady gets set — without this, a commander with no
      // recorded data at all would leave the card permanently hidden even
      // once its image finishes loading.
      statsReady = true;
      revealCardIfReady();
      return;
    }

    const playedEntryByKey = new Map(playedEntries.map((e) => [`${e.event_id}_${e.player_id}`, e]));
    const eventIds = [...new Set(playedEntries.map((e) => e.event_id))];

    const [allEntries, matches] = await Promise.all([
      EventEntries.listByEvents(eventIds),
      Matches.listByEvents(eventIds),
    ]);
    const entryByKey = new Map(allEntries.map((e) => [`${e.event_id}_${e.player_id}`, e]));

    // Storico partite: newest first — the rows built from `matches` below
    // inherit this order (each match contributes 1-2 consecutive rows), so
    // sorting here is enough without needing to sort `rows` again after.
    matches.sort((a, b) => {
      const dateCompare = (b.event?.event_date ?? "").localeCompare(a.event?.event_date ?? "");
      return dateCompare !== 0 ? dateCompare : (b.round ?? 0) - (a.round ?? 0);
    });

    const playersMap = new Map();
    // One count per player of how many entries (events) they piloted this
    // commander in — playedEntries itself, not `rows` below, since rows is
    // per-match-side and would overcount a player across a multi-round event.
    const timesPlayedByPlayer = new Map();
    for (const e of playedEntries) {
      if (!e.player) continue;
      playersMap.set(e.player.id, e.player);
      timesPlayedByPlayer.set(e.player.id, (timesPlayedByPlayer.get(e.player.id) ?? 0) + 1);
    }
    const playerList = Array.from(playersMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // One data point per event date this commander appeared in at least one
    // entry — decks played, not matches, so this counts playedEntries
    // (one per pilot per event) rather than `rows` (per match-side, which
    // would inflate the count by however many rounds that event had).
    const deckCountByDate = new Map();
    for (const e of playedEntries) {
      const date = e.event?.event_date;
      if (!date) continue;
      deckCountByDate.set(date, (deckCountByDate.get(date) ?? 0) + 1);
    }
    const deckChartPoints = [...deckCountByDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value }));
    decksChartEl.innerHTML = renderLineChart(deckChartPoints, "Non ci sono ancora dati sufficienti.", "Utilizzo");

    // One row per (match, side) where that side piloted this commander — a
    // mirror match (both sides on this commander) legitimately yields two rows.
    const rows = [];
    for (const m of matches) {
      const selfEntry1 = playedEntryByKey.get(`${m.event_id}_${m.player1_id}`);
      if (selfEntry1) {
        const oppEntry = entryByKey.get(`${m.event_id}_${m.player2_id}`);
        rows.push({
          event: m.event,
          round: m.round,
          self: m.player1,
          opponent: m.player2,
          isBye: isBye(m),
          isDrop: isDrop(m),
          outcome: outcomeFor(m, true),
          scoreLabel: isBye(m) ? "Bye" : isDrop(m) ? "Drop" : selfScoreLabel(m, true),
          oppCommander: oppEntry?.commander ?? null,
          oppPartner: oppEntry?.partner_commander ?? null,
        });
      }
      // player2_id is null for a bye, so this lookup naturally never matches
      // one — a bye can only ever be "self as player1" above.
      const selfEntry2 = playedEntryByKey.get(`${m.event_id}_${m.player2_id}`);
      if (selfEntry2) {
        const oppEntry = entryByKey.get(`${m.event_id}_${m.player1_id}`);
        rows.push({
          event: m.event,
          round: m.round,
          self: m.player2,
          opponent: m.player1,
          outcome: outcomeFor(m, false),
          scoreLabel: selfScoreLabel(m, false),
          oppCommander: oppEntry?.commander ?? null,
          oppPartner: oppEntry?.partner_commander ?? null,
        });
      }
    }

    // Most recent event date among a player's own rows above — i.e. the
    // last time they actually played a match on this commander, not just
    // the last event they were entered into with it.
    const lastPlayedByPlayer = new Map();
    for (const r of rows) {
      if (!r.self || !r.event?.event_date) continue;
      const current = lastPlayedByPlayer.get(r.self.id);
      if (!current || r.event.event_date > current) lastPlayedByPlayer.set(r.self.id, r.event.event_date);
    }
    renderPaginated(
      playersEl,
      playerList,
      (visible) =>
        visible.length === 0
          ? '<p class="page-empty">Nessun giocatore ha ancora usato questo commander.</p>'
          : `<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Giocatore</th><th>Volte giocato</th><th>Ultima partita</th></tr></thead>
      <tbody>${visible
        .map(
          (p) =>
            `<tr><td>${playerLabel(p)}</td><td>${timesPlayedByPlayer.get(p.id) ?? 0}</td><td>${formatDate(lastPlayedByPlayer.get(p.id))}</td></tr>`
        )
        .join("")}</tbody>
    </table></div>`
    );

    // A bye has no real opponent/commander matchup to show — computeWinrate
    // below still counts it (via the full, unfiltered `rows`), only the
    // table listing itself drops it.
    // Event date (newest first) as the primary sort, then alphabetically by
    // the player who piloted this commander (groups a date's rows by player
    // instead of interleaving them round-by-round), then by round ascending
    // within that player's own rows on that date (turno 1 before turno 2).
    const matchRows = rows
      .filter((r) => !r.isBye)
      .sort((a, b) => {
        const dateCompare = (b.event?.event_date ?? "").localeCompare(a.event?.event_date ?? "");
        if (dateCompare !== 0) return dateCompare;
        const nameCompare = (a.self?.name ?? "").localeCompare(b.self?.name ?? "");
        if (nameCompare !== 0) return nameCompare;
        return (a.round ?? 0) - (b.round ?? 0);
      });
    renderPaginated(
      matchesEl,
      matchRows,
      (visible) =>
        visible.length === 0
          ? '<p class="page-empty">Nessuna partita registrata.</p>'
          : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Evento</th><th>Giocatore</th><th>Avversario</th><th>Commander avversario</th><th>Risultato</th></tr></thead>
            <tbody>
              ${visible
                .map(
                  (r) => `
                <tr>
                  <td>${r.event ? `<a href="event.html?id=${r.event.id}">${escapeHtml(eventTitle(r.event))}</a>` : "—"}</td>
                  <td>${playerLabel(r.self)}</td>
                  <td>${r.isDrop ? "Drop" : playerLabel(r.opponent)}</td>
                  <td>${r.isDrop ? "—" : commanderPairLabel(r.oppCommander, r.oppPartner)}</td>
                  <td>${r.scoreLabel}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`
    );

    function computeWinrate(scopedEventIds) {
      const scoped = new Set(scopedEventIds);
      const bucket = { wins: 0, draws: 0, losses: 0 };
      for (const r of rows) {
        if (r.event && !scoped.has(r.event.id)) continue;
        // A bye is a free win for the player, not a "victory" for the
        // commander — it never actually beat anything. A drop isn't a
        // "victory" either, and isn't a match played at all.
        if (r.isBye || r.isDrop) continue;
        tallyOutcome(bucket, r.outcome);
      }
      renderWinrateTiles(winrateEl, bucket);
      statsReady = true;
      revealCardIfReady();
      // The stat tiles just replaced their own "Caricamento..." placeholder
      // (or a filter change re-rendered them) — either can change their own
      // height, so the card needs re-measuring. A no-op if the card isn't
      // visible yet (revealCardIfReady above handles that first reveal).
      syncCardImageLayout(cardImageFrontEl);
    }

    await initScopeFilter({ leagueSelect: leagueFilter, eventSelect: eventFilter, onChange: computeWinrate });
  } catch (err) {
    showError(document.getElementById("commander-content"), err);
  } finally {
    hidePageLoading();
  }
}

init();
