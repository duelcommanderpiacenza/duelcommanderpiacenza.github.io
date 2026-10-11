// archetype.html?id=<archetype> (linked from the Archetipi list): one
// archetype over the whole history of closed events — a hero (its most
// played commander's art, the name, Winrate / Metashare / Mazzi / Piloti),
// its usage over time, the commanders played as it, and how it fares
// against the other archetypes (a diverging bar chart around 50%).
import { Events, fetchEventsResults } from "./db.js";
import { matchRoundOutcome, isBye, isDrop } from "./leaderboard.js";
import { computeGroupedStats } from "./stats.js";
import { ARCHETYPES } from "./metagame-chart.js";
import { commanderPairWithColors, archetypeBadge, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { initTitleFit } from "./page-title-fit.js";
import { historyPanelHtml, historyStatsHtml, setHistoryCount } from "./history-list.js";
import { initBackToTop } from "./back-to-top.js";
import { renderLineChart } from "./line-chart.js";
import { initChartCarousel } from "./chart-carousel.js";
import { createArtPainter } from "./player-card.js";

const NO_LINK = { link: false };

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (n) => (n === null ? "—" : `${n.toFixed(1)}%`);

function statTile(label, value) {
  return `<div class="stat-tile"><div class="stat-tile-label">${label}</div><div class="stat-tile-value">${value}</div></div>`;
}

// Contro gli altri archetipi as a diverging bar chart: one row per other
// archetype, a bar from the 50% axis in the middle — right and green the
// more it wins against it, left and red the more it loses — its winrate
// beside it (the record and the number of matches on hover); each row a
// link to that archetype's page. Best matchup first; one never played: no bar, "—".
function vsChartHtml(matchups) {
  const rows = matchups
    .map((m) => {
      const wr = m.winRate;
      const side = wr === null ? "" : wr > 50 ? "is-win" : wr < 50 ? "is-loss" : "is-even";
      const bar =
        wr === null ? "" : `<span class="vs-bar ${side}" style="--vs-len:${Math.abs(wr - 50).toFixed(2)}%"></span>`;
      const title =
        wr === null
          ? "Nessuna partita"
          : `${m.wins}-${m.losses}-${m.draws} (V-S-P), ${m.played} ${m.played === 1 ? "partita" : "partite"}`;
      return `
      <a class="vs-row" href="archetype.html?id=${m.opp}" title="${title}">
        <span class="vs-label">${archetypeBadge(m.opp)}</span>
        <span class="vs-track">${bar}</span>
        <span class="vs-value ${side}">
          <strong>${pct(wr)}</strong>
        </span>
      </a>`;
    })
    .join("");
  return `
    <div class="pie-chart-wrap vs-chart">
      <h2 class="pie-chart-title">Contro gli altri archetipi</h2>
      <div class="vs-rows">${rows}</div>
      <div class="vs-axis" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
    </div>`;
}

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left.
export async function mount({ signal = new AbortController().signal } = {}) {
  // The commanders list is shown whole (no inner scroll): a long page.
  initBackToTop({ signal });
  const archetype = new URLSearchParams(window.location.search).get("id");
  const titleEl = document.getElementById("archetype-title");
  const statsEl = document.getElementById("archetype-stats");
  const chartsEl = document.getElementById("archetype-charts");
  const commandersEl = document.getElementById("archetype-commanders");

  if (!ARCHETYPES.includes(archetype)) {
    titleEl.textContent = "Archetipo non trovato";
    for (const el of [chartsEl, commandersEl]) el.innerHTML = "";
    hidePageLoading(signal);
    return;
  }

  const name = capitalize(archetype);
  titleEl.textContent = name;
  document.title = `${name} - Duel Commander Piacenza`;
  initTitleFit(titleEl, { signal });

  try {
    // Every closed event (an open one isn't published yet), oldest first.
    const events = (await Events.list())
      .filter((ev) => !ev.is_open)
      .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
    const eventsData = await fetchEventsResults(events.map((ev) => ev.id));
    if (signal.aborted) return;

    // The archetype's own numbers, and the whole field's deck count (for
    // its metashare): match-basis, byes and drops not counted
    // (computeGroupedStats, same as the Archetipi page).
    const byArchetype = computeGroupedStats(eventsData, (e) => e.archetype, () => ({}));
    const own = byArchetype.find((s) => s.key === archetype) ?? null;
    const fieldDecks = byArchetype.reduce((sum, s) => sum + s.entries, 0);
    const share = own && fieldDecks ? (own.entries / fieldDecks) * 100 : null;

    // Its decks, and per event date its decks out of the whole field's
    // (events on the same date added together).
    const decks = [];
    const usageByDate = new Map(); // date -> { mine, field }
    let firstDate = null;
    events.forEach((ev, i) => {
      const { entries } = eventsData[i];
      const mine = entries.filter((e) => e.archetype === archetype);
      decks.push(...mine);
      if (!ev.event_date || entries.length === 0) return;
      const day = usageByDate.get(ev.event_date) ?? { mine: 0, field: 0 };
      day.mine += mine.length;
      day.field += entries.length;
      usageByDate.set(ev.event_date, day);
      if (mine.length && (!firstDate || ev.event_date < firstDate)) firstDate = ev.event_date;
    });

    // The hero.
    const pilots = new Set(decks.map((e) => e.player_id));
    statsEl.innerHTML = [
      statTile("Winrate", pct(own?.winRate ?? null)),
      statTile("Metashare", pct(share)),
      statTile("Mazzi", decks.length),
      statTile("Piloti", pilots.size),
    ].join("");

    // Utilizzo: its share of each event's decks (%), from its first
    // appearance to the latest event, 0% where nobody played it — the
    // count behind it in the hover tip ("3 di 12 mazzi").
    const usagePoints = [...usageByDate]
      .filter(([date]) => firstDate && date >= firstDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { mine, field }]) => ({
        date,
        value: (mine / field) * 100,
        detail: `${mine} di ${field} mazzi`,
      }));
    const usageChartHtml = renderLineChart(usagePoints, "Non ci sono ancora dati sufficienti.", "Utilizzo", {
      percent: true,
    });

    // Comandanti: the commander (+ partner) pairings played as this
    // archetype, most played first — each a link to the commander's page:
    // Mazzi / V-S-P / Winrate, counted on these decks only.
    const commanders = computeGroupedStats(
      eventsData,
      (e) => (e.archetype === archetype && e.commander_id ? `${e.commander_id}_${e.partner_commander_id ?? ""}` : null),
      (e) => ({ commander: e.commander, partner: e.partner_commander ?? null })
    );
    createArtPainter(document.getElementById("archetype-hero-art"))(commanders[0]?.commander?.name ?? null);
    commandersEl.innerHTML = commanders.length
      ? historyPanelHtml(
          commanders
            .map((c) => {
              const inner = `
              <div class="history-main"><span class="history-title">${commanderPairWithColors(c.commander, c.partner, NO_LINK)}</span></div>
              ${historyStatsHtml([
                { label: "Mazzi", value: c.entries },
                { label: "V-S-P", value: `${c.wins}-${c.losses}-${c.draws}` },
                { label: "Winrate", value: pct(c.winRate), main: true },
              ])}`;
              return c.commander?.id
                ? `<a class="history-item history-ranked" href="commander.html?id=${c.commander.id}">${inner}</a>`
                : `<article class="history-item history-ranked">${inner}</article>`;
            })
            .join(""),
          { scroll: false }
        )
      : '<p class="page-empty">Nessun mazzo registrato con questo archetipo.</p>';
    setHistoryCount("archetype-commanders-count", commanders.length);

    // Contro gli altri archetipi: its matches against each other archetype,
    // from its own side (a mirror, and byes / drops, left out) — each a
    // link to that archetype's page.
    const vs = new Map(ARCHETYPES.filter((a) => a !== archetype).map((a) => [a, { wins: 0, draws: 0, losses: 0 }]));
    for (const { entries, matches } of eventsData) {
      const entryByPlayer = new Map(entries.map((e) => [e.player_id, e]));
      for (const m of matches) {
        if (isBye(m) || isDrop(m)) continue;
        const a1 = entryByPlayer.get(m.player1_id)?.archetype;
        const a2 = entryByPlayer.get(m.player2_id)?.archetype;
        if ((a1 === archetype) === (a2 === archetype)) continue;
        const ourSide = a1 === archetype ? "player1" : "player2";
        const bucket = vs.get(ourSide === "player1" ? a2 : a1);
        if (!bucket) continue;
        const outcome = matchRoundOutcome(m);
        if (outcome === ourSide) bucket.wins += 1;
        else if (outcome === "draw" || !outcome) bucket.draws += 1;
        else bucket.losses += 1;
      }
    }
    const matchups = [...vs]
      .map(([opp, b]) => {
        const played = b.wins + b.draws + b.losses;
        return { opp, ...b, played, winRate: played ? (b.wins / played) * 100 : null };
      })
      .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));
    // The two charts on one row: Utilizzo 2/3, the matchups 1/3 (styles.css
    // .chart-grid.is-wide-first); narrower, one per view with ‹ • ›.
    chartsEl.innerHTML = `<div class="chart-grid is-wide-first">${usageChartHtml}${vsChartHtml(matchups)}</div>`;
    initChartCarousel(chartsEl);
  } catch (err) {
    showError(document.getElementById("archetype-content"), err);
  } finally {
    hidePageLoading(signal);
  }
}
