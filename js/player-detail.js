import { Players, EventEntries, Matches } from "./db.js";
import { matchRoundOutcome, isBye, computeEventLeaderboard } from "./leaderboard.js";
import { tallyOutcome, tallyGames, renderWinrateTiles } from "./winrate.js";
import { escapeHtml, playerLabel, commanderPairLabel, colorIdentityPips, eventTitle, formatDate, showError } from "./ui.js";

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

async function init() {
  const id = getId();
  const titleEl = document.getElementById("player-title");
  const commandersEl = document.getElementById("player-commanders");
  const eventHistoryEl = document.getElementById("player-event-history");
  const overallEl = document.getElementById("player-winrate-overall");
  const commanderFilter = document.getElementById("player-commander-filter");
  const leagueFilter = document.getElementById("player-league-filter");
  const matchesEl = document.getElementById("player-matches");

  if (!id) {
    titleEl.textContent = "Giocatore non trovato";
    return;
  }

  try {
    const player = await Players.get(id);
    titleEl.textContent = player.handle ? `${player.name} (${player.handle})` : player.name;

    const entries = await EventEntries.listByPlayer(id);

    // Commander giocati: a plain, de-duplicated list — not split by event.
    // Keyed by the commander+partner pair, so "X / Y" and "X / Z" both show.
    // lastPlayed tracks the latest event_date across every entry with that
    // pair, regardless of the order entries happen to be iterated in.
    const uniqueCommanders = new Map();
    for (const e of entries) {
      if (!e.commander) continue;
      const key = `${e.commander.id}_${e.partner_commander?.id ?? ""}`;
      const eventDate = e.event?.event_date ?? null;
      const existing = uniqueCommanders.get(key);
      if (!existing) {
        uniqueCommanders.set(key, { commander: e.commander, partner: e.partner_commander ?? null, lastPlayed: eventDate });
      } else if (eventDate && (!existing.lastPlayed || eventDate > existing.lastPlayed)) {
        existing.lastPlayed = eventDate;
      }
    }
    const commanderList = Array.from(uniqueCommanders.values()).sort((a, b) =>
      a.commander.name.localeCompare(b.commander.name)
    );
    commandersEl.innerHTML =
      commanderList.length === 0
        ? '<p class="page-empty">Nessun dato registrato per questo giocatore.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Commander</th><th>Ultima volta giocato</th></tr></thead>
            <tbody>
              ${commanderList
                .map(
                  (c) => `<tr><td>${commanderPairLabel(c.commander, c.partner)} ${colorIdentityPips(
                    (c.commander.color_identity ?? "") + (c.partner?.color_identity ?? "")
                  )}</td><td>${formatDate(c.lastPlayed)}</td></tr>`
                )
                .join("")}
            </tbody>
          </table></div>`;

    // One row per event this player entered, with the full field's
    // standings computed to find their own final position in each — not
    // just this player's own matches, so it needs every entry/match of
    // that event, not only the ones involving them.
    const historyEventIds = [...new Set(entries.map((e) => e.event_id))];
    const [historyEntries, historyMatches] = await Promise.all([
      historyEventIds.length ? EventEntries.listByEvents(historyEventIds) : [],
      historyEventIds.length ? Matches.listByEvents(historyEventIds) : [],
    ]);
    const historyEntriesByEvent = new Map();
    for (const e of historyEntries) {
      if (!historyEntriesByEvent.has(e.event_id)) historyEntriesByEvent.set(e.event_id, []);
      historyEntriesByEvent.get(e.event_id).push(e);
    }
    const historyMatchesByEvent = new Map();
    for (const m of historyMatches) {
      if (!historyMatchesByEvent.has(m.event_id)) historyMatchesByEvent.set(m.event_id, []);
      historyMatchesByEvent.get(m.event_id).push(m);
    }
    const eventHistoryRows = entries
      .filter((e) => e.event)
      .map((e) => {
        const standings = computeEventLeaderboard(
          historyMatchesByEvent.get(e.event_id) ?? [],
          historyEntriesByEvent.get(e.event_id) ?? []
        );
        const position = standings.findIndex((s) => s.player?.id === id);
        return {
          event: e.event,
          commander: e.commander,
          partner: e.partner_commander,
          position: position === -1 ? null : position + 1,
        };
      })
      .sort((a, b) => (b.event?.event_date ?? "").localeCompare(a.event?.event_date ?? ""));

    eventHistoryEl.innerHTML =
      eventHistoryRows.length === 0
        ? '<p class="page-empty">Nessun evento registrato per questo giocatore.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Evento</th><th>Commander</th><th>Posizione in classifica</th></tr></thead>
            <tbody>
              ${eventHistoryRows
                .map(
                  (r) => `
                <tr>
                  <td>${r.event ? `<a href="event.html?id=${r.event.id}">${escapeHtml(eventTitle(r.event))}</a>` : "—"}</td>
                  <td>${commanderPairLabel(r.commander, r.partner)}</td>
                  <td>${r.position === null ? "—" : `#${r.position}`}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`;

    const entryByEvent = new Map(entries.map((e) => [e.event_id, e]));

    const { asP1, asP2 } = await Matches.listByPlayer(id);
    const rawMatches = [...asP1.map((m) => ({ m, viewerIsP1: true })), ...asP2.map((m) => ({ m, viewerIsP1: false }))];

    const eventIds = [...new Set(rawMatches.map(({ m }) => m.event_id))];
    const eventEntries = eventIds.length ? await EventEntries.listByEvents(eventIds) : [];
    const entryByEventPlayer = new Map(eventEntries.map((e) => [`${e.event_id}_${e.player_id}`, e]));

    const rows = rawMatches.map(({ m, viewerIsP1 }) => {
      const opponent = viewerIsP1 ? m.player2 : m.player1;
      const opponentId = viewerIsP1 ? m.player2_id : m.player1_id;
      const myEntry = entryByEvent.get(m.event_id);
      const oppEntry = entryByEventPlayer.get(`${m.event_id}_${opponentId}`);
      const gameTotal = m.player1_wins + m.draws + m.player2_wins;
      return {
        event: m.event,
        opponent,
        isBye: isBye(m),
        outcome: matchOutcome(m, viewerIsP1),
        scoreLabel: isBye(m) ? "Bye" : viewerScoreLabel(m, viewerIsP1),
        gameWins: viewerIsP1 ? m.player1_wins : m.player2_wins,
        gameTotal,
        myCommander: myEntry?.commander ?? null,
        myPartner: myEntry?.partner_commander ?? null,
        oppCommander: oppEntry?.commander ?? null,
        oppPartner: oppEntry?.partner_commander ?? null,
      };
    });

    // Filters: the two dropdowns narrow the same rows already loaded above,
    // updating the winrate tiles in place instead of separate breakdown tables.
    // The commander filter matches either seat (primary or partner).
    const commanderOptions = new Map();
    const leagueOptions = new Map();
    for (const r of rows) {
      if (r.myCommander) commanderOptions.set(r.myCommander.id, r.myCommander.name);
      if (r.myPartner) commanderOptions.set(r.myPartner.id, r.myPartner.name);
      const league = r.event?.league;
      if (league) leagueOptions.set(league.id, league.name);
    }
    commanderFilter.innerHTML =
      '<option value="">Tutti</option>' +
      Array.from(commanderOptions.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([cid, name]) => `<option value="${cid}">${escapeHtml(name)}</option>`)
        .join("");
    leagueFilter.innerHTML =
      '<option value="">Tutte</option>' +
      Array.from(leagueOptions.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([lid, name]) => `<option value="${lid}">${escapeHtml(name)}</option>`)
        .join("");

    function applyFilters() {
      const commanderId = commanderFilter.value;
      const leagueId = leagueFilter.value;
      const bucket = { wins: 0, draws: 0, losses: 0, gameWins: 0, gameTotal: 0 };
      for (const r of rows) {
        if (commanderId && r.myCommander?.id !== commanderId && r.myPartner?.id !== commanderId) continue;
        if (leagueId && r.event?.league?.id !== leagueId) continue;
        tallyOutcome(bucket, r.outcome);
        tallyGames(bucket, r.gameWins, r.gameTotal);
      }
      renderWinrateTiles(overallEl, bucket);
    }
    commanderFilter.addEventListener("change", applyFilters);
    leagueFilter.addEventListener("change", applyFilters);
    applyFilters();

    matchesEl.innerHTML =
      rows.length === 0
        ? '<p class="page-empty">Nessuna partita registrata.</p>'
        : `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Evento</th><th>Commander</th><th>Avversario</th><th>Commander avversario</th><th>Risultato</th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${r.event ? `<a href="event.html?id=${r.event.id}">${escapeHtml(eventTitle(r.event))}</a>` : "—"}</td>
                  <td>${commanderPairLabel(r.myCommander, r.myPartner)}</td>
                  <td>${r.isBye ? "Bye" : playerLabel(r.opponent)}</td>
                  <td>${r.isBye ? "—" : commanderPairLabel(r.oppCommander, r.oppPartner)}</td>
                  <td>${r.scoreLabel}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>`;
  } catch (err) {
    showError(document.getElementById("player-content"), err);
  }
}

init();
