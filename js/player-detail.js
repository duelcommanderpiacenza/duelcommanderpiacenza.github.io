import { Players, EventEntries, Matches, PlayerAutoBadges, EventStandings, PlayerCards, PlayerProgress } from "./db.js";
import { matchRoundOutcome, isBye, isDrop, computeEventLeaderboard } from "./leaderboard.js";
import { tallyOutcome, renderWinrateTiles } from "./winrate.js";
import {
  escapeHtml,
  badgeDiscHtml,
  badgeTooltipAttrs,
  uniqueBadges,
  commanderPairLabel,
  showError,
} from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initTitleFit } from "./page-title-fit.js";
import { renderCommanderCarousel, albumItems, commanderPairKey, openAlbumEffectsInfo } from "./commander-carousel.js";
import { matchGroupsHtml, initScrollFade, setHistoryCount } from "./history-list.js";
import { renderPublicPlayerCard, createArtPainter } from "./player-card.js";
import { initFollowButton } from "./follow-button.js";

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

function matchOutcome(m, viewerIsP1) {
  const outcome = matchRoundOutcome(m);
  if (outcome === "draw") return "draw";
  if ((outcome === "player1" && viewerIsP1) || (outcome === "player2" && !viewerIsP1)) return "win";
  return "loss";
}

// The score is shown from the viewer's own point of view (their wins first),
// rather than the raw player1/player2 orientation used elsewhere.
function viewerScoreLabel(m, viewerIsP1) {
  return viewerIsP1 ? `${m.player1_wins}-${m.player2_wins}-${m.draws}` : `${m.player2_wins}-${m.player1_wins}-${m.draws}`;
}

// Manual (badge1/badge2) and auto badges together — the auto ones are a
// plain read of PlayerAutoBadges, precomputed by admin/js/badges-sync.js
// whenever an event/league closes, not a live js/auto-badges.js
// computation (that would recompute every player's standings/stats just
// to extract this one player's result). Plain icons with their tooltip, not
// links — same as next to names everywhere else.
function playerBadgesHtml(badges) {
  if (!badges.length) return "";
  // In one group (.badge-group) that never splits: when they don't all fit
  // beside the name in the title, they go to the next line together, not
  // one by one.
  return `<span class="badge-group">${badges
    .map((b) => `<span class="icon-badge" ${badgeTooltipAttrs(b)} tabindex="0">${badgeDiscHtml(b)}</span>`)
    .join("")}</span>`;
}

// Storico partite (js/history-list.js): the matches grouped by event (newest
// first, as `rows` already are), with the deck played and the final position
// (`positionByEvent`: event id -> position).
function matchGroupsByEvent(rows, positionByEvent) {
  const groups = new Map(); // event id -> group
  for (const r of rows) {
    const key = r.event?.id ?? "";
    if (!groups.has(key)) {
      groups.set(key, {
        event: r.event,
        // Unlinked: the whole sub-card links to the event.
        subline: r.myCommander ? commanderPairLabel(r.myCommander, r.myPartner, { link: false }) : "",
        position: positionByEvent.get(r.event?.id),
        rounds: [],
      });
    }
    groups.get(key).rounds.push(r);
  }
  return [...groups.values()];
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("player-title");
  const commandersEl = document.getElementById("player-commanders");
  document.getElementById("album-help").addEventListener("click", openAlbumEffectsInfo);
  const overallEl = document.getElementById("player-winrate-overall");
  const matchesEl = document.getElementById("player-matches");
  // The hero's backdrop (styles.css .profile-hero-art): the card's
  // background art, else the player's most played commander's.
  const paintHeroArt = createArtPainter(document.getElementById("player-hero-art"));

  // "☆ Segui" right below the name, for signed-in accounts (not awaited: it
  // never holds up the page).
  if (id) initFollowButton(titleEl, "player", id);

  if (!id) {
    titleEl.textContent = "Giocatore non trovato";
    hidePageLoading();
    return;
  }

  try {
    // Four independent requests (each needs only the id), all started at
    // once rather than one after another — then used in this order, so the
    // title still shows as soon as the player's own row arrives. The no-op
    // catches only mark the badges and entries requests as handled, should
    // the player request fail first and leave them never awaited; awaiting
    // them below still throws as usual. The linked account's card, when
    // there's one to show, is never fatal: the page works the same without
    // it.
    const playerRequest = Players.get(id);
    const autoBadgesRequest = PlayerAutoBadges.listByPlayer(id);
    const entriesRequest = EventEntries.listByPlayer(id);
    const cardRequest = PlayerCards.get(id).catch((err) => {
      console.error(err);
      return null;
    });
    // The card's cosmetics (js/card-cosmetics.js) — never fatal either: no
    // progress just means a card without them.
    const progressRequest = PlayerProgress.get(id).catch((err) => {
      console.error(err);
      return null;
    });
    autoBadgesRequest.catch(() => {});
    entriesRequest.catch(() => {});

    const player = await playerRequest;
    // Known before the title is drawn (started alongside, so barely a wait):
    // with a card shown, the badges are on the card, not after the name.
    const card = await cardRequest;
    const nameLabel = player.handle ? `${player.name} (${player.handle})` : player.name;
    // Not fatal if this fails — the page still works with just the
    // manually assigned badges, so it's kept out of this try/catch.
    let autoBadges = [];
    try {
      // The player list caps this to a few (highest priority first); this
      // page shows every auto badge a player has, uncapped — still sorted
      // the same way, just not sliced.
      autoBadges = (await autoBadgesRequest)
        .map((r) => r.badge)
        .filter(Boolean)
        .sort((a, b) => b.priority - a.priority);
    } catch (err) {
      console.error(err);
    }
    const playerBadges = uniqueBadges([player.badge1, player.badge2, ...autoBadges]);
    titleEl.innerHTML = `${escapeHtml(nameLabel)} ${card ? "" : playerBadgesHtml(playerBadges)}`;
    // Same as the other detail pages: on phones, fits the name to one line
    // and keeps the back button vertically centered on it.
    initTitleFit(titleEl);

    const entries = await entriesRequest;

    // The card, once the year of the player's first event ("Dal …") is
    // known: in the hero's left column (without one, the text takes the
    // whole width — .is-no-card).
    if (card) {
      const firstDate = entries.reduce((min, e) => {
        const d = e.event?.event_date;
        return d && (!min || d < min) ? d : min;
      }, null);
      const cardWrapEl = document.getElementById("player-page-card");
      renderPublicPlayerCard(cardWrapEl, card, {
        name: nameLabel,
        since: firstDate ? firstDate.slice(0, 4) : null,
        // The same badges as next to the title.
        badges: playerBadges,
        progress: await progressRequest,
      });
      cardWrapEl.hidden = false;
      document.getElementById("player-hero").classList.remove("is-no-card");
    }

    // Album comandanti: one card per commander + partner pair, most played
    // first (js/commander-carousel.js albumItems).
    const commanderList = albumItems(entries);
    paintHeroArt(card?.commander_name ?? commanderList[0]?.commander.name ?? null, card?.card_print ?? null);
    const carousel = renderCommanderCarousel(commandersEl, commanderList);

    // The player's final position in each event they entered (Storico
    // partite's per-event chip). Read from the cached standings (EventStandings, rebuilt by the
    // admin on every event change) — just this player's own few rows.
    // Any event not in the cache yet (table not created on this DB, not
    // yet rebuilt since the event closed, or an open event only a logged-in
    // admin can see) falls back to computing it here from that event's full
    // entries + matches, same as before the cache existed.
    const historyEventIds = [...new Set(entries.map((e) => e.event_id))];
    const standingByEvent = new Map(); // event id -> { position, wins, draws, losses }
    try {
      for (const row of await EventStandings.listByPlayer(id)) standingByEvent.set(row.event_id, row);
    } catch (err) {
      console.error(err);
    }
    const uncachedIds = historyEventIds.filter((eventId) => !standingByEvent.has(eventId));
    if (uncachedIds.length) {
      const [historyEntries, historyMatches] = await Promise.all([
        EventEntries.listByEvents(uncachedIds),
        Matches.listByEvents(uncachedIds),
      ]);
      for (const eventId of uncachedIds) {
        const standings = computeEventLeaderboard(
          historyMatches.filter((m) => m.event_id === eventId),
          historyEntries.filter((e) => e.event_id === eventId)
        );
        const index = standings.findIndex((s) => s.player?.id === id);
        if (index === -1) continue;
        const s = standings[index];
        standingByEvent.set(eventId, { position: index + 1, wins: s.wins, draws: s.draws, losses: s.losses });
      }
    }
    const entryByEvent = new Map(entries.map((e) => [e.event_id, e]));

    const { asP1, asP2 } = await Matches.listByPlayer(id);
    const rawMatches = [...asP1.map((m) => ({ m, viewerIsP1: true })), ...asP2.map((m) => ({ m, viewerIsP1: false }))];
    // Storico partite: newest first.
    rawMatches.sort((a, b) => {
      const dateCompare = (b.m.event?.event_date ?? "").localeCompare(a.m.event?.event_date ?? "");
      return dateCompare !== 0 ? dateCompare : (b.m.round ?? 0) - (a.m.round ?? 0);
    });

    const eventIds = [...new Set(rawMatches.map(({ m }) => m.event_id))];
    const eventEntries = eventIds.length ? await EventEntries.listByEvents(eventIds) : [];
    const entryByEventPlayer = new Map(eventEntries.map((e) => [`${e.event_id}_${e.player_id}`, e]));

    const rows = rawMatches.map(({ m, viewerIsP1 }) => {
      const opponent = viewerIsP1 ? m.player2 : m.player1;
      const opponentId = viewerIsP1 ? m.player2_id : m.player1_id;
      const myEntry = entryByEvent.get(m.event_id);
      const oppEntry = entryByEventPlayer.get(`${m.event_id}_${opponentId}`);
      return {
        event: m.event,
        round: m.round,
        opponent,
        isBye: isBye(m),
        isDrop: isDrop(m),
        outcome: matchOutcome(m, viewerIsP1),
        scoreLabel: isBye(m) ? "Bye" : isDrop(m) ? "Drop" : viewerScoreLabel(m, viewerIsP1),
        myCommander: myEntry?.commander ?? null,
        myPartner: myEntry?.partner_commander ?? null,
        oppCommander: oppEntry?.commander ?? null,
        oppPartner: oppEntry?.partner_commander ?? null,
      };
    });

    // Album comandanti's Winrate tile: each pair's match record over the
    // player's whole history, counted like the hero's tiles — a drop is
    // skipped, a bye counts as a win.
    const recordsByPair = new Map();
    for (const r of rows) {
      if (!r.myCommander || r.isDrop) continue;
      const key = commanderPairKey(r.myCommander, r.myPartner);
      if (!recordsByPair.has(key)) recordsByPair.set(key, { wins: 0, draws: 0, losses: 0 });
      tallyOutcome(recordsByPair.get(key), r.outcome);
    }
    carousel.setRecords(recordsByPair);

    // The hero's numbers, over the player's whole history: a drop isn't a
    // win, a loss, or a match played — skipped entirely; a bye counts as a
    // played match won, same as any other match win. Events: entries (an
    // event counts even if the player dropped before playing a round).
    const bucket = { wins: 0, draws: 0, losses: 0 };
    for (const r of rows) if (!r.isDrop) tallyOutcome(bucket, r.outcome);
    renderWinrateTiles(overallEl, bucket, { events: entries.length });

    matchesEl.innerHTML = matchGroupsHtml(
      matchGroupsByEvent(rows, new Map([...standingByEvent].map(([eventId, s]) => [eventId, s.position])))
    );
    initScrollFade(matchesEl);
    setHistoryCount("player-matches-count", rows.length);
  } catch (err) {
    showError(document.getElementById("player-content"), err);
  } finally {
    hidePageLoading();
  }
}

init();
