import { Commanders, EventEntries, Matches, Events } from "./db.js";
import { matchRoundOutcome, isBye, isDrop, computeEventLeaderboard } from "./leaderboard.js";
import { tallyOutcome, renderWinrateTiles } from "./winrate.js";
import { renderLineChart } from "./line-chart.js";
import {
  escapeHtml,
  playerLabel,
  commanderBadgesHtml,
  formatDate,
  showError,
  isoDateYearsAgo,
  DEFAULT_DATE_FROM_YEARS,
} from "./ui.js";
import {
  historyPanelHtml,
  matchGroupsHtml,
  initScrollFade,
  capScrollToItems,
  capScrollToHeightOf,
  setHistoryCount,
} from "./history-list.js";
import { hidePageLoading } from "./page-loading.js";
import { initTitleFit, fitTitleToOneLine } from "./page-title-fit.js";
import { initFollowButton } from "./follow-button.js";
import { createArtPainter } from "./player-card.js";
import { initTabs } from "./tabs.js";
import { initBackToTop } from "./back-to-top.js";

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

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
// The commander's badges after its name in the title, in a wrapper one text
// line tall (styles.css .commander-title-badges) that centres them on the
// name's line, like player.html's beside its name.
function titleBadgesHtml(commander) {
  const badges = commanderBadgesHtml({ banned: commander.is_banned, isNew: commander.is_new });
  return badges ? `<span class="commander-title-badges">${badges}</span>` : "";
}

export async function mount({ signal = new AbortController().signal } = {}) {
  const id = getId();
  const titleEl = document.getElementById("commander-title");
  const cardFigureEl = document.getElementById("commander-card-figure");
  const cardFlipperEl = document.getElementById("commander-card-flipper");
  const cardImageFrontEl = document.getElementById("commander-card-image-front");
  const cardImageBackEl = document.getElementById("commander-card-image-back");
  const cardFlipBtnEl = document.getElementById("commander-card-flip-btn");
  const winrateEl = document.getElementById("commander-winrate");
  const heroEl = document.getElementById("commander-hero");
  const playersEl = document.getElementById("commander-players");
  const matchesEl = document.getElementById("commander-matches");
  const decksChartEl = document.getElementById("commander-decks-chart");

  // Giocatori / Storico partite: tabs on phones and touch screens (the CSS
  // hides them on a computer, the two side by side), each list whole there —
  // a long page, hence the back-to-top button.
  initTabs(document.querySelector(".commander-tabs"));
  initBackToTop({ signal });

  // "☆ Segui" right below the name, for signed-in accounts (not awaited: it
  // never holds up the page).
  if (id) initFollowButton(titleEl, "commander", id, { signal });

  if (!id) {
    titleEl.textContent = "Commander non trovato";
    document.getElementById("commander-card-skeleton")?.setAttribute("hidden", "");
    hidePageLoading(signal);
    return;
  }

  // The card (Scryfall) in the hero's left column: a card-shaped
  // placeholder until its image has loaded, then the card; no image for this
  // commander (not found, or failed): no column, the text takes the whole
  // width (.is-no-card).
  const cardSkeletonEl = document.getElementById("commander-card-skeleton");
  function revealCard() {
    if (cardSkeletonEl) cardSkeletonEl.hidden = true;
    cardFigureEl.hidden = false;
  }
  function dropCard() {
    if (cardSkeletonEl) cardSkeletonEl.hidden = true;
    cardFigureEl.hidden = true;
    heroEl.classList.add("is-no-card");
  }

  try {
    // The commander, the entries that piloted it and every event (for the
    // usage chart's zeros) each need only the id: started together. Every
    // event isn't fatal — without them the chart just shows the dates it
    // was played. The no-op catch only marks the entries request as
    // handled, should the commander request fail first; awaiting it below
    // still throws.
    const playedEntriesRequest = EventEntries.listByCommander(id);
    const allEventsRequest = Events.list().catch((err) => (console.error(err), []));
    playedEntriesRequest.catch(() => {});
    const commander = await Commanders.get(id);
    if (signal.aborted) return;
    // The name (and the ⚠️ if banned) — no colour pips: the card image beside
    // it already shows the commander's colours.
    titleEl.innerHTML = `${escapeHtml(commander.name)}${
      titleBadgesHtml(commander)
    }`;
    document.title = `${commander.name} - Duel Commander Piacenza`;
    // On phones: a long name shrunk to one line.
    initTitleFit(titleEl, { signal });
    // The hero's backdrop: the commander's own art.
    createArtPainter(document.getElementById("commander-hero-art"))(commander.name);

    // Loaded independently of everything else below (not awaited here) — a
    // slow/unreachable Scryfall never blocks the actual page data, and a
    // failed/mismatched lookup just leaves the figure hidden rather than
    // showing a broken image icon.
    cardImageFrontEl.alt = commander.name;
    cardImageFrontEl.addEventListener("load", revealCard, { once: true });
    cardImageFrontEl.addEventListener("error", dropCard, { once: true });

    fetchScryfallCard(commander.name).then((card) => {
      if (!card) return dropCard();
      const images = scryfallCardImages(card);
      if (images.length === 0) return dropCard();
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

    // Every (event, player) pair that piloted this commander — as the main
    // commander or as someone's partner.
    const playedEntries = await playedEntriesRequest;
    if (signal.aborted) return;

    if (playedEntries.length === 0) {
      winrateEl.innerHTML = '<p class="page-empty">Non ci sono ancora dati sufficienti.</p>';
      playersEl.innerHTML = '<p class="page-empty">Nessun giocatore ha ancora usato questo commander.</p>';
      matchesEl.innerHTML = '<p class="page-empty">Nessuna partita registrata.</p>';
      decksChartEl.innerHTML = renderLineChart([], "Non ci sono ancora dati sufficienti.", "Utilizzo");
      return;
    }

    const eventIds = [...new Set(playedEntries.map((e) => e.event_id))];

    const [allEntries, matches, allEvents] = await Promise.all([
      EventEntries.listByEvents(eventIds),
      Matches.listByEvents(eventIds),
      allEventsRequest,
    ]);
    if (signal.aborted) return;
    const entryByKey = new Map(allEntries.map((e) => [`${e.event_id}_${e.player_id}`, e]));

    // Storico partite: newest first — the rows built from `matches` below
    // inherit this order (each match contributes 1-2 consecutive rows), so
    // sorting here is enough without needing to sort `rows` again after.
    matches.sort((a, b) => {
      const dateCompare = (b.event?.event_date ?? "").localeCompare(a.event?.event_date ?? "");
      return dateCompare !== 0 ? dateCompare : (b.round ?? 0) - (a.round ?? 0);
    });

    // Every pilot's final position in each event (Storico partite's
    // sub-cards), whatever the pairing shown.
    const positionByEventPlayer = new Map(); // `${event id}_${player id}` -> position
    for (const eventId of eventIds) {
      computeEventLeaderboard(
        matches.filter((m) => m.event_id === eventId),
        allEntries.filter((e) => e.event_id === eventId)
      ).forEach((s, i) => {
        if (s.player) positionByEventPlayer.set(`${eventId}_${s.player.id}`, i + 1);
      });
    }

    // The pairings this commander was played in: an entry's other commander
    // is its partner — whichever seat each was entered in (X + Y is Y + X);
    // none, played alone. "Tutti" every entry; then alone, then each
    // partner, most played first.
    const partnerOf = (e) => (e.commander_id === id ? e.partner_commander ?? null : e.commander ?? null);
    const byPartner = new Map(); // "none" | partner id -> { key, commander, count }
    for (const e of playedEntries) {
      const partner = partnerOf(e);
      const key = partner?.id ?? "none";
      if (!byPartner.has(key)) byPartner.set(key, { key, commander: partner, count: 0 });
      byPartner.get(key).count += 1;
    }
    const partnerOptions = [...byPartner.values()]
      .filter((o) => o.key !== "none")
      .sort((a, b) => b.count - a.count || a.commander.name.localeCompare(b.commander.name));
    const options = [
      { key: "all", label: "Tutti", count: playedEntries.length },
      ...(byPartner.has("none") ? [{ key: "none", label: "Da solo", count: byPartner.get("none").count }] : []),
      ...partnerOptions.map((o) => ({ key: o.key, label: `con ${o.commander.name.split(",")[0]}`, count: o.count, commander: o.commander })),
    ];

    // Draws the page's sections from `entries` (the pairing shown): the
    // usage chart, Giocatori, Storico partite and the hero's numbers.
    function renderSections(entries) {
      const playedEntryByKey = new Map(entries.map((e) => [`${e.event_id}_${e.player_id}`, e]));

      const playersMap = new Map();
      // One count per player of how many entries (events) they piloted this
      // commander in — the entries themselves, not `rows` below, since rows
      // is per-match-side and would overcount a player across a multi-round
      // event.
      const timesPlayedByPlayer = new Map();
      for (const e of entries) {
        if (!e.player) continue;
        playersMap.set(e.player.id, e.player);
        timesPlayedByPlayer.set(e.player.id, (timesPlayedByPlayer.get(e.player.id) ?? 0) + 1);
      }
      const playerList = Array.from(playersMap.values()).sort((a, b) => a.name.localeCompare(b.name));

      // Decks played per event date — the entries (one per pilot per event),
      // not `rows` (per match-side, which would inflate the count by however
      // many rounds that event had). Every played event is a point, 0 where
      // nobody played it — from the club's first event (not this commander's:
      // the line shows when it arrived too), at most the last
      // DEFAULT_DATE_FROM_YEARS years (the filters' default "Dal"), up to the
      // latest one (events on the same date added together).
      const chartFrom = isoDateYearsAgo(DEFAULT_DATE_FROM_YEARS);
      const deckCountByDate = new Map();
      for (const e of entries) {
        const date = e.event?.event_date;
        if (!date || date < chartFrom) continue;
        deckCountByDate.set(date, (deckCountByDate.get(date) ?? 0) + 1);
      }
      const chartDates = new Set(deckCountByDate.keys());
      for (const ev of allEvents) {
        if (!ev.is_open && ev.event_date && ev.event_date >= chartFrom) chartDates.add(ev.event_date);
      }
      const deckChartPoints = [...chartDates]
        .sort()
        .map((date) => ({ date, value: deckCountByDate.get(date) ?? 0 }));
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
      // Giocatori: one sub-card per pilot, the whole card a link to the
      // player's page — name and last match, events played on the right.
      playersEl.innerHTML = playerList.length
        ? historyPanelHtml(
            playerList
              .map(
                (p) => `
      <a class="history-item history-player" href="player.html?id=${p.id}">
        <div class="history-main">
          <span class="history-title"><span class="history-name">${playerLabel(p, { link: false })}</span></span>
          <span class="history-meta">Ultima partita: ${formatDate(lastPlayedByPlayer.get(p.id))}</span>
        </div>
        <div class="history-stat">
          <span class="history-stat-value">${timesPlayedByPlayer.get(p.id) ?? 0}</span>
          <span class="history-stat-label">Volte giocato</span>
        </div>
      </a>`
              )
              .join("")
          )
        : '<p class="page-empty">Nessun giocatore ha ancora usato questo commander.</p>';
      initScrollFade(playersEl);
      setHistoryCount("commander-players-count", playerList.length);

      // Every round played with it, byes included ("Bye", no opponent — as on
      // player.html), whether or not the hero's numbers below count them.
      // Event date (newest first) as the primary sort, then alphabetically by
      // the player who piloted this commander (groups a date's rows by player
      // instead of interleaving them round-by-round), then by round ascending
      // within that player's own rows on that date (turno 1 before turno 2).
      const matchRows = rows
        .sort((a, b) => {
          const dateCompare = (b.event?.event_date ?? "").localeCompare(a.event?.event_date ?? "");
          if (dateCompare !== 0) return dateCompare;
          const nameCompare = (a.self?.name ?? "").localeCompare(b.self?.name ?? "");
          if (nameCompare !== 0) return nameCompare;
          return (a.round ?? 0) - (b.round ?? 0);
        });
      // Storico partite: one sub-card per event + pilot (matchRows' order),
      // with the pilot and their final position in that event.
      const matchGroups = new Map();
      for (const r of matchRows) {
        const key = `${r.event?.id ?? ""}_${r.self?.id ?? ""}`;
        if (!matchGroups.has(key)) {
          matchGroups.set(key, {
            event: r.event,
            // Unlinked: the whole sub-card links to the event.
            subline: playerLabel(r.self, { link: false }),
            position: positionByEventPlayer.get(key),
            rounds: [],
          });
        }
        matchGroups.get(key).rounds.push(r);
      }
      matchesEl.innerHTML = matchRows.length
        ? // The opponents' decks first, big, their names under them.
          matchGroupsHtml([...matchGroups.values()], { deckFirst: true })
        : '<p class="page-empty">Nessuna partita registrata.</p>';
      initScrollFade(matchesEl);
      // Past 8 matches it scrolls; the Giocatori list beside it keeps its own
      // height, never taller than this one (scrolling past that).
      capScrollToItems(matchesEl, ".history-round", 8);
      capScrollToHeightOf(playersEl, matchesEl);
      setHistoryCount("commander-matches-count", matchRows.length);

      // The hero's numbers. A bye is a free win for the player, not a
      // "victory" for the commander — it never actually beat anything. A
      // drop isn't a "victory" either, and isn't a match played at all.
      const bucket = { wins: 0, draws: 0, losses: 0 };
      for (const r of rows) {
        if (r.isBye || r.isDrop) continue;
        tallyOutcome(bucket, r.outcome);
      }
      renderWinrateTiles(winrateEl, bucket);
    }

    // The partner's card beside the commander's (Scryfall, fetched once per
    // partner). One figure, two places: with a partner picked, beside the
    // commander's (.has-partner); with none, the first partner's card tucked
    // behind it, dimmed — the hint there's more to swipe to. Picking that
    // first partner just brings the same card forward (CSS transitions);
    // another one: the shown card slides back out, the new one in.
    const cardColEl = document.getElementById("commander-card-col");
    const partnerFigureEl = document.getElementById("commander-partner-figure");
    const partnerImageEl = document.getElementById("commander-partner-image");
    const partnerImageById = new Map();
    const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const firstPartner = partnerOptions[0]?.commander ?? null;
    let wantedId = null; // the card the figure should hold
    let visibleId = null; // the card it holds on screen
    function imageFor(c) {
      if (!partnerImageById.has(c.id)) {
        partnerImageById.set(
          c.id,
          fetchScryfallCard(c.name).then((card) => (card ? scryfallCardImages(card)[0] ?? null : null))
        );
      }
      return partnerImageById.get(c.id);
    }
    function retractPartner(done) {
      if (partnerFigureEl.hidden) {
        done?.();
        return;
      }
      // Once: the animation's end, or a moment after it should have ended
      // (animationend can go missing — an interrupted animation, a tab in the
      // background — and the next card mustn't wait on it forever).
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        partnerFigureEl.classList.remove("is-leaving");
        partnerFigureEl.hidden = true;
        visibleId = null;
        done?.();
      };
      if (reduceMotion()) return finish();
      partnerFigureEl.classList.add("is-leaving");
      partnerFigureEl.addEventListener("animationend", finish, { once: true });
      setTimeout(finish, 260);
    }
    function showPartnerCard(partner) {
      // The card to hold: the picked partner, else the first one (the hint).
      const target = partner ?? firstPartner;
      wantedId = target?.id ?? null;
      // The commander's card takes its place for the pairing at once.
      cardColEl.classList.toggle("has-partner", Boolean(partner));
      if (!target) return retractPartner();
      if (visibleId === target.id && !partnerFigureEl.classList.contains("is-leaving")) return;
      imageFor(target).then((src) => {
        if (wantedId !== target.id || signal.aborted) return;
        if (!src) return retractPartner();
        retractPartner(() => {
          if (wantedId !== target.id) return;
          const reveal = () => {
            if (wantedId !== target.id) return;
            partnerFigureEl.hidden = false;
            visibleId = target.id;
          };
          partnerImageEl.alt = target.name;
          if (partnerImageEl.getAttribute("src") === src && partnerImageEl.complete) reveal();
          else {
            partnerImageEl.addEventListener("load", reveal, { once: true });
            partnerImageEl.src = src;
          }
        });
      });
    }

    // The hero's pairing picker — only for a commander played with a partner
    // at least once: Tutti / Da solo / con … (how many times each). Picking
    // one redraws the page for it, with the partner's name in the title and
    // its card beside the commander's; the address follows (?partner=<id> /
    // none — no new history entry), so a link or a reload shows the same.
    const picker = document.getElementById("commander-pairings");
    let current = "all";
    const titleHtml = `${escapeHtml(commander.name)}${titleBadgesHtml(commander)}`;
    // What changes with a pairing picked slides in from the side of the arrow
    // used (styles.css .is-swapped-next / -prev: › from the right, ‹ from the
    // left) — not on the page's first render (updateUrl false).
    let swapDir = 1;
    const replaySwap = (el) => {
      el.classList.remove("is-swapped-next", "is-swapped-prev");
      void el.offsetWidth;
      el.classList.add(swapDir < 0 ? "is-swapped-prev" : "is-swapped-next");
    };
    function select(key, { updateUrl = true, dir = 1 } = {}) {
      swapDir = dir;
      const option = options.find((o) => o.key === key) ?? options[0];
      const entries =
        option.key === "all"
          ? playedEntries
          : playedEntries.filter((e) => (partnerOf(e)?.id ?? "none") === option.key);
      const shownTitle = titleEl.innerText;
      titleEl.innerHTML = option.commander
        ? `${titleHtml} <span class="commander-title-partner">+ ${escapeHtml(option.commander.name)}</span>`
        : titleHtml;
      fitTitleToOneLine(titleEl);
      // (Only when the name shown actually changed: up to 820px the partner's
      // part is hidden.)
      if (updateUrl && titleEl.innerText !== shownTitle) replaySwap(titleEl);
      showPartnerCard(option.commander ?? null);
      current = option.key;
      const compactLabel = picker.querySelector(".pairing-compact-label");
      if (compactLabel) {
        compactLabel.textContent = option.key === "all" ? "Tutti i partner" : option.label;
        if (updateUrl) replaySwap(compactLabel);
      }
      renderSections(entries);
      if (updateUrl) {
        const url = new URL(window.location.href);
        if (option.key === "all") url.searchParams.delete("partner");
        else url.searchParams.set("partner", option.key);
        history.replaceState(history.state, "", url);
      }
    }
    // One badge with the pairing shown ("Tutti i partner", "Da solo", "con
    // …"), ‹ › either side going to the previous / next one (round). While no partner is picked, the first
    // partner's card is tucked dimmed behind the commander's (showPartnerCard
    // above): there are partners to pick.
    const step = (by) => {
      const i = options.findIndex((o) => o.key === current);
      select(options[(i + by + options.length) % options.length].key, { dir: by });
    };
    if (partnerOptions.length > 0) {
      picker.innerHTML = `
        <div class="pairing-compact">
          <button type="button" class="pairing-step" data-step="-1" aria-label="Partner precedente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg></button>
          <span class="pairing-compact-label" aria-live="polite"></span>
          <button type="button" class="pairing-step" data-step="1" aria-label="Partner successivo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></button>
        </div>`;
      picker.hidden = false;
      cardColEl.classList.add("has-pairings");
      picker.addEventListener("click", (e) => {
        const arrow = e.target.closest("[data-step]");
        if (arrow) step(Number(arrow.dataset.step));
      });
    }
    const requested = new URLSearchParams(window.location.search).get("partner");
    select(options.some((o) => o.key === requested) ? requested : "all", { updateUrl: false });
  } catch (err) {
    showError(document.getElementById("commander-content"), err);
  } finally {
    hidePageLoading(signal);
  }
}
