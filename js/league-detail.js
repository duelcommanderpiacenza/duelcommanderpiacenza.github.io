import { Leagues, Events, EventCounts, fetchEventsResults } from "./db.js";
import { computeLeaguePoints, previousLeaguePositions } from "./leaderboard.js";
import { fetchPlayerBadgesRenderer } from "./player-badges.js";
import { computeLeagueSummary, computeLeagueWrapped } from "./stats.js";
import {
  capitalize,
  escapeHtml,
  formatDate,
  formatTime,
  leagueStatusBadge,
  localIso,
  playerLabel,
  showError,
  statTileHtml,
} from "./ui.js";
import { hidePageLoading, sectionLoadingHtml, statTilesLoadingHtml } from "./page-loading.js";
import { initTitleFit } from "./page-title-fit.js";
import { historyPanelHtml, historyStatsHtml, leaguePosHtml } from "./history-list.js";
import { createArtPainter } from "./player-card.js";
import { initTabs } from "./tabs.js";
import { initBackToTop } from "./back-to-top.js";
import { openLeagueRules } from "./league-rules.js";
import { openSeasonRecap } from "./event-recap.js";
import { nestedResultsMenu } from "./results-link.js";
import { renderMetaCharts } from "./meta-charts.js";
import { locale } from "./locale.js";

// How many leaderboard rows get the "top 8" highlight (styles.css .is-top8).
const LEAGUE_TOP_HIGHLIGHT = 8;


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
  if (dates[0] > localIso()) return { html: `Inizia il ${start}`, withStatus: false };
  if (league.is_open) return { html: `${start} – ${leagueStatusBadge(true)}`, withStatus: true };
  const end = escapeHtml(formatDate(dates[dates.length - 1]));
  return { html: start === end ? start : `${start} – ${end}`, withStatus: false };
}

// "Eventi della lega" as a timeline (styles.css .league-timeline), looking
// just like the Bacheca's (.home-timeline — its card layout and rules):
// oldest first, one node on a vertical line per event — its day and month
// in the circle (wide: its weekday left of the line) — and its card
// beside it, the name over a line of its own:
//  - played (closed): "👥 players" under its name, "Liste" (its
//    Moxfield / mtgtop8 links) on the right; the card a link to it; the
//    line up to it red;
//  - the next one (the soonest still open, today or later): solid red, its
//    circle pulsing, its time at the bottom right; not a link (its page
//    fills in once it's played);
//  - later open ones: hollow, their time;
//  - an open one whose day has passed (played, results not in yet):
//    "Risultati in arrivo", right after the played ones. Visitors can't
//    see those at all (events_public_read: closed, or dated today or
//    later), so they're counted instead — all the league's events
//    (league_event_count) minus those shown — and drawn without their date
//    ("?"). (An open event with no date is hidden the same way and would
//    show here too.)
// The name: an unnamed event by its weekday.
const cardName = (ev) => {
  if (ev.name) return escapeHtml(ev.name);
  const d = new Date(`${ev.event_date}T00:00:00`);
  if (!ev.event_date || Number.isNaN(d.getTime())) return "Evento";
  const day = d.toLocaleDateString(locale(), { weekday: "long" });
  return capitalize(day);
};

const TL_ICON = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const TL_USERS = TL_ICON(
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>'
);

const byDate = (a, b) => (a.event_date ?? "9999").localeCompare(b.event_date ?? "9999");

function timelineItemHtml({ ev, state, players }, number, today) {
  const date = ev?.event_date ? new Date(`${ev.event_date}T00:00:00`) : null;
  const node = date
    ? `<b>${String(date.getDate()).padStart(2, "0")}</b><span>${date.toLocaleDateString(locale(), { month: "short" }).replace(".", "")}</span>`
    : "<b>?</b>";
  // Wide: just the weekday left of the line (the day and month are in the
  // circle already).
  const weekday = date ? date.toLocaleDateString(locale(), { weekday: "long" }) : "";
  const fullDate = weekday ? capitalize(weekday) : "—";
  const kicker =
    state === "pending"
      ? "Risultati in arrivo"
      : state === "played"
        ? `<span class="league-tl-players">${TL_USERS}${players}</span>`
        : "";
  // Played: "Liste" beside the text, centred; upcoming: nothing under the
  // name, so the name alone, centred, and the time at the card's bottom
  // right (.league-tl-time).
  const upcoming = state === "next" || state === "future";
  const links = state === "played" ? nestedResultsMenu(ev.results_url, ev.decklists_url) : "";
  const time = upcoming && ev?.start_time ? `<span class="league-tl-side league-tl-time">${formatTime(ev.start_time)}</span>` : "";
  const body = `
          <span class="league-tl-text">
            <span class="league-tl-t">${ev ? cardName(ev) : `Evento ${number}`}</span>
            ${upcoming ? "" : `<span class="league-tl-k">${kicker}</span>`}
          </span>
          ${links ? `<span class="league-tl-side">${links}</span>` : time}`;
  const card =
    state === "played"
      ? `<a class="league-tl-card" href="event.html?id=${ev.id}">${body}</a>`
      : `<div class="league-tl-card">${body}</div>`;
  return `
      <li class="league-tl-item is-${state}">
        <span class="league-tl-date">${fullDate}</span>
        <span class="league-tl-node">${node}</span>
        ${card}
      </li>`;
}

// The closed events, then those awaiting results (hidden — counted), then
// the open ones the visitor can see, by date; "" with none at all.
// `playersById`: each closed event's number of players. (An admin sees the
// awaiting ones themselves: by date among the open ones.)
function timelineHtml(allEvents, playersById, scheduled, today) {
  const closed = allEvents.filter((ev) => !ev.is_open).sort(byDate);
  const open = allEvents.filter((ev) => ev.is_open).sort(byDate);
  const nextId = open.find((ev) => ev.event_date && ev.event_date >= today)?.id;
  const items = closed.map((ev) => ({ ev, state: "played", players: playersById.get(ev.id) ?? 0 }));
  for (let i = allEvents.length; i < scheduled; i += 1) items.push({ state: "pending" });
  for (const ev of open) {
    items.push({ ev, state: ev.id === nextId ? "next" : ev.event_date && ev.event_date < today ? "pending" : "future" });
  }
  if (!items.length) return "";
  return `<ol class="league-timeline home-timeline">${items.map((item, i) => timelineItemHtml(item, i + 1, today)).join("")}</ol>`;
}

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
export async function mount({ signal = new AbortController().signal } = {}) {
  const id = new URLSearchParams(window.location.search).get("id");
  const titleEl = document.getElementById("league-title");
  const statusEl = document.getElementById("league-status");
  const datesEl = document.getElementById("league-dates");
  const statsEl = document.getElementById("league-stats");
  const eventsEl = document.getElementById("league-events");
  const leaderboardSectionEl = document.getElementById("league-leaderboard-section");
  const leaderboardEl = document.getElementById("league-leaderboard");
  const tabsEl = document.querySelector(".league-tabs");

  // Eventi / Classifica: tabs on phones and touch screens (the CSS hides
  // them on a computer, one section under the other), each list whole there
  // — a long page, hence the back-to-top button.
  const tabs = initTabs(tabsEl);
  initBackToTop({ signal });
  // "Regolamento" in the hero (shown below, once the league is known not to
  // be a Topdeck series): how the standings are scored.
  const rulesBtn = document.getElementById("league-rules");
  rulesBtn.addEventListener("click", openLeagueRules);
  // "Recap" beside it, a closed league's season in stories (js/event-recap.js).
  // (Missing from an old copy of the page: nothing — a stand-in so the rest
  // reads the same.)
  const recapBtn = document.getElementById("league-recap") ?? document.createElement("button");
  recapBtn.addEventListener("click", () => openSeasonRecap(id));

  if (!id) {
    titleEl.textContent = "Lega non trovata";
    hidePageLoading(signal);
    return;
  }

  try {
    // The league, its events and its total event count (open ones
    // included, even those hidden from visitors) each need only the id:
    // started together. The count falls back to the visible events' (null
    // until they're known). The no-op catches only mark the two as handled,
    // should the league request fail first; awaiting them still throws.
    const eventsRequest = Events.listByLeague(id);
    const countRequest = Leagues.eventCount(id, null);
    // Each event's number of players (the database's event_counts view,
    // as Leghe & Eventi's) — all Eventi needs besides the events, so a page
    // opening on it is shown before the results (below). Null when the view
    // isn't there (migration 021 not run): then it waits for the results.
    const playerCountsRequest = EventCounts.list().catch((err) => (console.error(err), null));
    eventsRequest.catch(() => {});
    countRequest.catch(() => {});
    const league = await Leagues.get(id);
    if (signal.aborted) return;
    titleEl.textContent = league.name;
    document.title = `${league.name} - Duel Commander Piacenza`;
    initTitleFit(titleEl, { signal });
    rulesBtn.hidden = league.is_topdeck;
    recapBtn.hidden = league.is_topdeck || league.is_open;
    // Beside "Recap" (the hero's colour), "Regolamento" white — like an
    // event's "Liste".
    rulesBtn.classList.toggle("is-light", !recapBtn.hidden);
    const actionsEl = document.getElementById("league-actions");
    if (actionsEl) actionsEl.hidden = league.is_topdeck;
    // A shared season recap link (league.html?id=…&recap=1): opened at once.
    if (!recapBtn.hidden && new URLSearchParams(location.search).get("recap") === "1") openSeasonRecap(id);

    // A Topdeck series is just a bucket of events, with no points leaderboard:
    // no Classifica tab (Eventi and Meta). A closed league: its Classifica —
    // its final standings — the first tab and the open one (Classifica /
    // Eventi / Meta); an open one keeps Eventi / Classifica / Meta, on Eventi.
    if (league.is_topdeck) {
      leaderboardSectionEl.hidden = true;
      document.getElementById("league-tab-leaderboard").hidden = true;
    } else if (!league.is_open) {
      const leaderboardTab = document.getElementById("league-tab-leaderboard");
      leaderboardTab.parentElement.prepend(leaderboardTab);
      tabs.select("league-leaderboard-section");
    }
    // Started now (a Topdeck series has no leaderboard to need it), awaited
    // only right before the leaderboard renders, so it loads alongside the
    // league's results rather than after them.
    const badgesPromise = league.is_topdeck ? null : fetchPlayerBadgesRenderer();

    // A still-open (including future) event isn't published yet — it has no
    // entries/matches for RLS to even hand back, and would otherwise inflate
    // this league's own event count/grid before anything's actually happened.
    const allEvents = await eventsRequest;
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

    const today = localIso();
    const resultsRequest = fetchEventsResults(events.map((ev) => ev.id));
    resultsRequest.catch(() => {});
    const count = await countRequest;
    if (signal.aborted) return;
    const scheduledEvents = count ?? allEvents.length;
    const renderTimeline = (playersById) => {
      eventsEl.innerHTML =
        timelineHtml(allEvents, playersById, scheduledEvents, today) ||
        '<p class="page-empty">Nessun evento associato a questa lega.</p>';
    };

    // Opening on Eventi (an open league, a Topdeck series): shown now, with
    // the players per event from their counts — the hero's numbers and art,
    // Classifica and Meta shimmering until the results are in.
    const playerCounts = league.is_open || league.is_topdeck ? await playerCountsRequest : null;
    if (signal.aborted) return;
    if (playerCounts) {
      const countByEvent = new Map(playerCounts.map((r) => [r.event_id, r.players]));
      renderTimeline(new Map(events.map((ev) => [ev.id, countByEvent.get(ev.id) ?? 0])));
      if (events.length) statsEl.innerHTML = statTilesLoadingHtml(["Eventi", "Giocatori", "Presenza media", "Partite giocate"]);
      if (!league.is_topdeck) leaderboardEl.innerHTML = sectionLoadingHtml(6);
      document.getElementById("league-meta-charts").innerHTML = sectionLoadingHtml(4);
      hidePageLoading(signal);
    }

    const eventsData = await resultsRequest;
    if (signal.aborted) return;
    if (!playerCounts) renderTimeline(new Map(events.map((ev, i) => [ev.id, eventsData[i].entries.length])));

    // Meta: the league's commanders and archetypes over its played events
    // (js/meta-charts.js, as event.html's).
    renderMetaCharts(
      document.getElementById("league-meta-charts"),
      document.getElementById("league-meta-card"),
      eventsData.flatMap((d) => d.entries)
    );

    if (events.length === 0) {
      leaderboardEl.innerHTML = '<p class="page-empty">Nessun dato per la classifica.</p>';
      return;
    }

    const summary = computeLeagueSummary(eventsData);
    statsEl.innerHTML = [
      ["Eventi", summary.events],
      ["Giocatori", summary.uniquePlayers],
      ["Presenza media", summary.avgPlayersPerEvent.toFixed(1)],
      ["Partite giocate", summary.totalMatches],
    ]
      .map(([label, value]) => statTileHtml(label, value))
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

    // While the league runs: each player's place before its latest event,
    // for the change shown in the position chip (leaguePosHtml).
    const before = league.is_open ? previousLeaguePositions(eventsData, events, { scheduledEvents }) : null;
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
                  ${leaguePosHtml(i + 1, before, s.player?.id)}
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
