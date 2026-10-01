import { Players, EventEntries, Matches, PlayerAutoBadges, EventStandings } from "./db.js";
import { matchRoundOutcome, isBye, isDrop, computeEventLeaderboard } from "./leaderboard.js";
import { tallyOutcome, renderWinrateTiles } from "./winrate.js";
import {
  escapeHtml,
  badgeDiscHtml,
  badgeTooltipAttrs,
  uniqueBadges,
  playerLabel,
  commanderPairLabel,
  eventCellLabel,
  eventTitle,
  showError,
  renderPaginated,
  isoDateYearsAgo,
  DEFAULT_DATE_FROM_YEARS,
} from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initTitleFit } from "./page-title-fit.js";
import { initFilterToggle } from "./filter-toggle.js";
import { renderCommanderCarousel } from "./commander-carousel.js";

// Album comandanti's grouping: one "deck" = the exact commander + partner pair.
function commanderPairKey(commander, partner) {
  return `${commander.id}_${partner?.id ?? ""}`;
}

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
  return badges
    .map((b) => `<span class="icon-badge" ${badgeTooltipAttrs(b)} tabindex="0">${badgeDiscHtml(b)}</span>`)
    .join("");
}

async function init() {
  const id = getId();
  const titleEl = document.getElementById("player-title");
  const commandersEl = document.getElementById("player-commanders");
  const eventHistoryEl = document.getElementById("player-event-history");
  const overallEl = document.getElementById("player-winrate-overall");
  const leagueFilter = document.getElementById("player-league-filter");
  const eventFilter = document.getElementById("player-event-filter");
  const dateFromFilter = document.getElementById("player-date-from");
  // Same round button, box and active-filter dot as the list pages: a plain
  // collapsing panel, the rest of the page moving with it. Same default
  // "Dal" too: the last DEFAULT_DATE_FROM_YEARS years (js/ui.js) — set
  // before the stats first render, which read it.
  dateFromFilter.value = isoDateYearsAgo(DEFAULT_DATE_FROM_YEARS);
  initFilterToggle("player-filter-toggle", "player-filter-panel");
  const matchesEl = document.getElementById("player-matches");

  if (!id) {
    titleEl.textContent = "Giocatore non trovato";
    hidePageLoading();
    return;
  }

  try {
    // Three independent requests (each needs only the id), all started at
    // once rather than one after another — then used in this order, so the
    // title still shows as soon as the player's own row arrives. The no-op
    // catches only mark the other two as handled, should the player request
    // fail first and leave them never awaited; awaiting them below still
    // throws as usual.
    const playerRequest = Players.get(id);
    const autoBadgesRequest = PlayerAutoBadges.listByPlayer(id);
    const entriesRequest = EventEntries.listByPlayer(id);
    autoBadgesRequest.catch(() => {});
    entriesRequest.catch(() => {});

    const player = await playerRequest;
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
    titleEl.innerHTML = `${escapeHtml(nameLabel)} ${playerBadgesHtml(playerBadges)}`;
    // Same as the other detail pages: on phones, fits the name to one line
    // and keeps the back button vertically centered on it.
    initTitleFit(titleEl);

    const entries = await entriesRequest;

    // Album comandanti: a plain, de-duplicated list — not split by event.
    // Keyed by the commander+partner pair, so "X / Y" and "X / Z" both show.
    // timesPlayed counts the entries (events) with that pair; firstPlayed /
    // lastPlayed track the earliest / latest event_date across them,
    // regardless of the order entries happen to be iterated in.
    const uniqueCommanders = new Map();
    for (const e of entries) {
      if (!e.commander) continue;
      const key = commanderPairKey(e.commander, e.partner_commander);
      const eventDate = e.event?.event_date ?? null;
      const existing = uniqueCommanders.get(key);
      if (!existing) {
        uniqueCommanders.set(key, {
          key,
          commander: e.commander,
          partner: e.partner_commander ?? null,
          timesPlayed: 1,
          firstPlayed: eventDate,
          lastPlayed: eventDate,
        });
      } else {
        existing.timesPlayed += 1;
        if (eventDate && (!existing.lastPlayed || eventDate > existing.lastPlayed)) existing.lastPlayed = eventDate;
        if (eventDate && (!existing.firstPlayed || eventDate < existing.firstPlayed)) existing.firstPlayed = eventDate;
      }
    }
    // Shown as a card carousel (js/commander-carousel.js), most played
    // first, then most recently played, then by name.
    const commanderList = Array.from(uniqueCommanders.values()).sort(
      (a, b) =>
        b.timesPlayed - a.timesPlayed ||
        (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? "") ||
        a.commander.name.localeCompare(b.commander.name)
    );
    const carousel = renderCommanderCarousel(commandersEl, commanderList);

    // One row per event this player entered, with their final position in
    // each. Read from the cached standings (EventStandings, rebuilt by the
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
    const eventHistoryRows = entries
      .filter((e) => e.event)
      .map((e) => {
        const standing = standingByEvent.get(e.event_id);
        return {
          event: e.event,
          commander: e.commander,
          partner: e.partner_commander,
          position: standing ? standing.position : null,
          wins: standing?.wins ?? 0,
          losses: standing?.losses ?? 0,
          draws: standing?.draws ?? 0,
        };
      })
      .sort((a, b) => (b.event?.event_date ?? "").localeCompare(a.event?.event_date ?? ""));

    renderPaginated(
      eventHistoryEl,
      eventHistoryRows,
      (visible) =>
        visible.length === 0
          ? '<p class="page-empty">Nessun evento registrato per questo giocatore.</p>'
          : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Evento</th><th>Commander</th><th>V-S-P</th><th>Posizione</th></tr></thead>
            <tbody>
              ${visible
                .map(
                  (r) => `
                <tr>
                  <td>${eventCellLabel(r.event)}</td>
                  <td>${commanderPairLabel(r.commander, r.partner)}</td>
                  <td>${r.wins}-${r.losses}-${r.draws}</td>
                  <td>${r.position === null ? "—" : `#${r.position}`}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`
    );

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
    // player's whole history (not the filters below, same as the rest of
    // the carousel), counted like the overall tiles — a drop is skipped, a
    // bye counts as a win.
    const recordsByPair = new Map();
    for (const r of rows) {
      if (!r.myCommander || r.isDrop) continue;
      const key = commanderPairKey(r.myCommander, r.myPartner);
      if (!recordsByPair.has(key)) recordsByPair.set(key, { wins: 0, draws: 0, losses: 0 });
      tallyOutcome(recordsByPair.get(key), r.outcome);
    }
    carousel.setRecords(recordsByPair);

    // Filters (Lega, Evento, Dal): narrow the same rows already loaded
    // above, updating the winrate tiles in place instead of separate
    // breakdown tables. Only this player's own leagues and events are
    // offered (unlike js/scope-filter.js's site-wide lists, which the
    // commander page uses) — picking a league narrows Evento to that
    // league's events, the same pairing as there.
    const leagueOptions = new Map();
    const playedEvents = new Map(); // event id -> event (with its league embed)
    for (const e of entries) {
      if (!e.event) continue;
      playedEvents.set(e.event.id, e.event);
      if (e.event.league) leagueOptions.set(e.event.league.id, e.event.league.name);
    }
    leagueFilter.innerHTML =
      '<option value="">Tutte</option>' +
      Array.from(leagueOptions.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([lid, name]) => `<option value="${lid}">${escapeHtml(name)}</option>`)
        .join("");

    // Newest first. data-label/data-sublabel: js/custom-select.js's popup
    // shows the event name with its league on a smaller line below (same
    // as js/scope-filter.js); the option text stays the plain combined
    // string for the native <select>.
    function populateEvents() {
      const leagueId = leagueFilter.value;
      const scoped = [...playedEvents.values()]
        .filter((ev) => !leagueId || ev.league?.id === leagueId)
        .sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? ""));
      eventFilter.innerHTML =
        '<option value="">Tutti</option>' +
        scoped
          .map((ev) => {
            const name = eventTitle(ev);
            return `<option value="${ev.id}" data-label="${escapeHtml(name)}"${
              ev.league ? ` data-sublabel="${escapeHtml(ev.league.name)}"` : ""
            }>${escapeHtml(name)}${ev.league ? ` — ${escapeHtml(ev.league.name)}` : ""}</option>`;
          })
          .join("");
    }
    populateEvents();

    // "Dal": only events on/after that date (ISO dates compare as strings).
    function inScope(event, leagueId, eventId, from) {
      if (eventId && event?.id !== eventId) return false;
      if (leagueId && event?.league?.id !== leagueId) return false;
      if (from && (event?.event_date ?? "") < from) return false;
      return true;
    }
    function applyFilters() {
      const leagueId = leagueFilter.value;
      const eventId = eventFilter.value;
      const from = dateFromFilter.value;
      const bucket = { wins: 0, draws: 0, losses: 0 };
      for (const r of rows) {
        if (!inScope(r.event, leagueId, eventId, from)) continue;
        // A drop isn't a win, a loss, or a match played — skipped entirely.
        // A bye counts as a played match won, same as any other match win.
        if (r.isDrop) continue;
        tallyOutcome(bucket, r.outcome);
      }
      // Events entered within the same filters (an entry, not a match, so an
      // event is counted even if the player dropped before playing a round).
      const events = entries.filter((e) => inScope(e.event, leagueId, eventId, from)).length;
      renderWinrateTiles(overallEl, bucket, { events });
    }
    leagueFilter.addEventListener("change", () => {
      // A new league: Evento lists just its events, back to "Tutti".
      populateEvents();
      applyFilters();
    });
    eventFilter.addEventListener("change", applyFilters);
    dateFromFilter.addEventListener("change", applyFilters);
    applyFilters();

    renderPaginated(
      matchesEl,
      rows,
      (visible) =>
        visible.length === 0
          ? '<p class="page-empty">Nessuna partita registrata.</p>'
          : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Evento</th><th>Commander</th><th>Avversario</th><th>Commander avversario</th><th>Risultato</th></tr></thead>
            <tbody>
              ${visible
                .map(
                  (r) => `
                <tr>
                  <td>${eventCellLabel(r.event)}</td>
                  <td>${commanderPairLabel(r.myCommander, r.myPartner)}</td>
                  <td>${r.isBye ? "Bye" : r.isDrop ? "Drop" : playerLabel(r.opponent)}</td>
                  <td>${r.isBye || r.isDrop ? "—" : commanderPairLabel(r.oppCommander, r.oppPartner)}</td>
                  <td>${r.scoreLabel}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`
    );
  } catch (err) {
    showError(document.getElementById("player-content"), err);
  } finally {
    hidePageLoading();
  }
}

init();
