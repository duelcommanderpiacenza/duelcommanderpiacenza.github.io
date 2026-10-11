import { Leagues, Events, fetchEventsResults } from "./db.js";
import { computeLeaguePoints } from "./leaderboard.js";
import { fetchPlayerBadgesRenderer } from "./player-badges.js";
import { computeLeagueSummary, computeLeagueWrapped } from "./stats.js";
import {
  escapeHtml,
  formatDate,
  formatTime,
  leagueStatusBadge,
  playerLabel,
  showError,
} from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initTitleFit } from "./page-title-fit.js";
import { historyPanelHtml, historyStatsHtml, historyPosHtml } from "./history-list.js";
import { createArtPainter } from "./player-card.js";
import { initFollowButton } from "./follow-button.js";

// How many leaderboard rows get the "top 8" highlight (styles.css .is-top8).
const LEAGUE_TOP_HIGHLIGHT = 8;

function getId() {
  return new URLSearchParams(window.location.search).get("id");
}

// Local-time YYYY-MM-DD, directly comparable with an event_date string.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The hero's dates, as HTML: "12 set 2026 – 30 nov 2026", first event's date
// to the last one's, once the league is closed; while it's running, the
// "In corso" chip in place of the end ("12 set 2026 – ● In corso" — the chip
// then isn't shown on its own too: withStatus); "Inizia il 12 set 2026" when
// even the first event hasn't happened yet. "" when no event has a date yet
// — the dates are then hidden entirely.
function leagueDateRange(league, events) {
  const dates = events.map((ev) => ev.event_date).filter(Boolean).sort();
  if (dates.length === 0) return { html: "", withStatus: false };
  const start = escapeHtml(formatDate(dates[0]));
  if (dates[0] > todayIso()) return { html: `Inizia il ${start}`, withStatus: false };
  if (league.is_open) return { html: `${start} – ${leagueStatusBadge(true)}`, withStatus: true };
  const end = escapeHtml(formatDate(dates[dates.length - 1]));
  return { html: start === end ? start : `${start} – ${end}`, withStatus: false };
}

// "Eventi della lega": every card the same three lines — a small label,
// the name (an unnamed event by its weekday, the date being on the line
// under it), the date. A played event's label is its number in the season
// ("Evento 3"), the card a link to it; the next one comes first, not a link
// (its page fills in once it's played) — a dashed red card, "Prossimo
// evento" with a pulsing dot, the time after the date (styles.css
// .entity-card-next).
const cardName = (ev) => {
  if (ev.name) return escapeHtml(ev.name);
  const d = new Date(`${ev.event_date}T00:00:00`);
  if (!ev.event_date || Number.isNaN(d.getTime())) return "Evento";
  const day = d.toLocaleDateString("it-IT", { weekday: "long" });
  return day.charAt(0).toUpperCase() + day.slice(1);
};

function nextEventCardHtml(ev) {
  const when = [formatDate(ev.event_date), ev.start_time ? `ore ${formatTime(ev.start_time)}` : ""].filter(Boolean).join(" · ");
  return `
      <div class="entity-card entity-card-next">
        <div class="entity-card-label"><span class="entity-card-next-dot" aria-hidden="true"></span>Prossimo evento</div>
        <div class="entity-card-title">${cardName(ev)}</div>
        <div class="entity-card-meta">${when}</div>
      </div>`;
}

function playedEventCardHtml(ev, number) {
  return `
      <a class="entity-card" href="event.html?id=${ev.id}">
        <div class="entity-card-label">Evento ${number}</div>
        <div class="entity-card-title">${cardName(ev)}</div>
        <div class="entity-card-meta">${formatDate(ev.event_date)}</div>
      </a>`;
}

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
export async function mount({ signal = new AbortController().signal } = {}) {
  const id = getId();
  const titleEl = document.getElementById("league-title");
  const statusEl = document.getElementById("league-status");
  const datesEl = document.getElementById("league-dates");
  const statsEl = document.getElementById("league-stats");
  const eventsEl = document.getElementById("league-events");
  const leaderboardSectionEl = document.getElementById("league-leaderboard-section");
  const leaderboardEl = document.getElementById("league-leaderboard");

  // The ★ on the hero's edge, for signed-in accounts (not awaited: it never
  // holds up the page).
  if (id) initFollowButton(titleEl, "league", id, { signal });

  if (!id) {
    titleEl.textContent = "Lega non trovata";
    hidePageLoading(signal);
    return;
  }

  try {
    const league = await Leagues.get(id);
    if (signal.aborted) return;
    titleEl.textContent = league.name;
    initTitleFit(titleEl, { signal });

    // A Topdeck series is just a bucket of events, with no points leaderboard.
    if (league.is_topdeck) leaderboardSectionEl.hidden = true;
    // Started now, awaited only right before the leaderboard renders, so it
    // loads alongside the league's events rather than after them.
    const badgesPromise = league.is_topdeck ? null : fetchPlayerBadgesRenderer();

    // A still-open (including future) event isn't published yet — it has no
    // entries/matches for RLS to even hand back, and would otherwise inflate
    // this league's own event count/grid before anything's actually happened.
    const allEvents = await Events.listByLeague(id);
    if (signal.aborted) return;
    const events = allEvents.filter((ev) => !ev.is_open);

    // Date range under the title — from every event the league has, open
    // ones included (unlike everything else on this page).
    // The status chip on its own, unless the dates already end with it.
    const dateRange = leagueDateRange(league, allEvents);
    datesEl.innerHTML = dateRange.html;
    datesEl.hidden = !dateRange.html;
    statusEl.innerHTML = leagueStatusBadge(league.is_open);
    statusEl.hidden = dateRange.withStatus;

    // The league's next event (the soonest still open, today or later —
    // readable from its own date on), shown first among its events.
    const today = todayIso();
    const nextEvent = allEvents
      .filter((ev) => ev.is_open && ev.event_date && ev.event_date >= today)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
    const nextHtml = nextEvent ? nextEventCardHtml(nextEvent) : "";

    if (events.length === 0) {
      eventsEl.innerHTML = nextHtml
        ? `<div class="entity-grid">${nextHtml}</div>`
        : '<p class="page-empty">Nessun evento associato a questa lega.</p>';
      leaderboardEl.innerHTML = '<p class="page-empty">Nessun dato per la classifica.</p>';
      return;
    }

    // Newest first; numbered from the season's first (Evento 1).
    eventsEl.innerHTML = `<div class="entity-grid">${nextHtml}${events
      .map((ev, i) => playedEventCardHtml(ev, events.length - i))
      .join("")}</div>`;

    const [eventsData, scheduledEvents] = await Promise.all([
      fetchEventsResults(events.map((ev) => ev.id)),
      Leagues.eventCount(id, allEvents.length),
    ]);

    const summary = computeLeagueSummary(eventsData);
    statsEl.innerHTML = [
      ["Eventi", summary.events],
      ["Giocatori", summary.uniquePlayers],
      ["Presenza media", summary.avgPlayersPerEvent.toFixed(1)],
      ["Partite giocate", summary.totalMatches],
    ]
      .map(
        ([label, value]) =>
          `<div class="stat-tile"><div class="stat-tile-label">${label}</div><div class="stat-tile-value">${value}</div></div>`
      )
      .join("");

    // Computed for Topdeck series too (no leaderboard shown for those) — the
    // hero's art comes from computeLeagueWrapped's most played commanders.
    // Full-attendance bonus only once the league is closed; the best-results
    // cap counts every event the league has, open ones included, even those
    // hidden from visitors (computeLeaguePoints, Leagues.eventCount).
    const standings = computeLeaguePoints(eventsData, {
      leagueClosed: !league.is_open,
      scheduledEvents,
    });
    const wrapped = computeLeagueWrapped(eventsData, standings);
    // The hero's backdrop (styles.css .profile-hero-art): the league's most
    // played commander's art (the hero's own reds alone without one).
    createArtPainter(document.getElementById("league-hero-art"))(wrapped.topCommanders[0]?.commander?.name ?? null);

    if (league.is_topdeck) return;

    const badgesFor = await badgesPromise;
    if (signal.aborted) return;
    // One sub-card per player (js/history-list.js), the whole card a link to
    // the player's page: position chip, name + badges, then Punti / V-S-P /
    // Winrate / Eventi. The top LEAGUE_TOP_HIGHLIGHT get a red edge and tint
    // (styles.css .history-item.is-top8).
    leaderboardEl.innerHTML =
      standings.length === 0
        ? '<p class="page-empty">Nessun dato per la classifica.</p>'
        : historyPanelHtml(
            standings
              .map((s, i) => {
                const inner = `
                <div class="history-lead">
                  ${historyPosHtml(i + 1)}
                  <div class="history-main">
                    <span class="history-title"><span class="history-name">${playerLabel(s.player, { link: false })}</span>${badgesFor(s.player)}</span>
                  </div>
                </div>
                ${historyStatsHtml([
                  { label: "Punti", value: s.points, main: true },
                  { label: "V-S-P", value: `${s.wins}-${s.losses}-${s.draws}` },
                  { label: "Winrate", value: s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%` },
                  { label: "Eventi", value: s.eventsPlayed },
                ])}`;
                const cls = `history-item history-ranked${i < LEAGUE_TOP_HIGHLIGHT ? " is-top8" : ""}`;
                return s.player?.id
                  ? `<a class="${cls}" href="player.html?id=${s.player.id}">${inner}</a>`
                  : `<article class="${cls}">${inner}</article>`;
              })
              .join(""),
            { scroll: false }
          );
  } catch (err) {
    showError(document.getElementById("league-content"), err);
  } finally {
    hidePageLoading(signal);
  }
}
