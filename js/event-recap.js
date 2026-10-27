// An event's recap, in stories (since 2026-10-26 — the "Wrapped" mockup):
// full-screen on a phone (a phone-sized panel over a dark backdrop on a
// computer), one screen at a time — bars across the top fill as each plays
// (RECAP_STEP), a tap on the right goes on, on the left back, holding pauses;
// the arrow keys too; it closes once the last screen's time is over (or on
// a tap on the right there). The screens: the cover (the event, players /
// rounds / matches, on the winner's commander art), the winner (their commander's art
// as a foil card, confetti), the top 8, the unbeaten (no losses AND a real
// match won — a bye isn't one, only draws isn't a result to celebrate), the
// commander of the day (the most played; a tie: the best placed), the
// archetypes, and the end ("Ci vediamo al prossimo evento!", the next event — the
// same league's, else the soonest of any kind — and "Condividi il recap").
// Opened by the Bacheca's recap card (js/home.js), the event's hero
// ("Recap", js/event-detail.js) and a shared link (event.html?id=…&recap=1).
//
// A closed league's season recap the same way (openSeasonRecap): the season
// (its events, players, matches), the champion, the final top 8, the
// season's records (most events won, most matches won, full attendance), the
// commander of the season, the archetypes, and "Ci vediamo alla prossima
// stagione!" with the new season's first upcoming event (only an open real
// league's — none, no event). Opened by the Bacheca's card (instead of
// an event's, for a while after the season's last event), the league's
// hero ("Recap") and league.html?id=…&recap=1. Styles: css/6 "Event recap".

import { Events, Leagues, fetchEventsResults } from "./db.js";
import { computeEventLeaderboard, computeLeaguePoints } from "./leaderboard.js";
import { ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { archetypeIcon } from "./archetype-icons.js";
import { createArtPainter } from "./player-card.js";
import { escapeHtml } from "./ui.js";

const RECAP_STEP = 6500;

// The recap's music: one of these, at random, each time a recap opens —
// royalty-free tracks in audio/ (their licences: audio/README.md). Empty:
// no music, no sound button. On by default, at MUSIC_VOLUME, fading in and
// out; the speaker button beside × mutes / unmutes it, remembered in this
// browser (localStorage "recapMuted"). A recap opened without a tap first (a
// shared link) can't start sound: then it starts muted, the button there to
// turn it on.
const RECAP_TRACKS = Array.from({ length: 7 }, (_, i) => `audio/recap-${i + 1}.mp3`);
const MUSIC_VOLUME = 0.45;
const MUTE_KEY = "recapMuted";

const SOUND_ON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>';
const SOUND_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"></path><path d="m22 9-6 6"></path><path d="m16 9 6 6"></path></svg>';

const mutedPref = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

// One track for one recap: start / pause / resume / stop (fading out) /
// toggle; `onState(muted)` tells the button. Null without tracks.
function createMusic(onState) {
  if (!RECAP_TRACKS.length) return null;
  const audio = new Audio(RECAP_TRACKS[Math.floor(Math.random() * RECAP_TRACKS.length)]);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  let muted = mutedPref();
  let fadeTimer = 0;
  let stopped = false;

  const fadeTo = (target, ms, then) => {
    clearInterval(fadeTimer);
    const from = audio.volume;
    const steps = Math.max(1, Math.round(ms / 40));
    let i = 0;
    fadeTimer = setInterval(() => {
      i += 1;
      audio.volume = Math.min(1, Math.max(0, from + ((target - from) * i) / steps));
      if (i >= steps) {
        clearInterval(fadeTimer);
        then?.();
      }
    }, 40);
  };

  const play = () =>
    audio.play().then(
      () => fadeTo(MUSIC_VOLUME, 900),
      () => {
        // No tap first (a shared link): muted until the button is pressed.
        muted = true;
        onState(true);
      }
    );

  return {
    get muted() {
      return muted;
    },
    start() {
      onState(muted);
      if (!muted) play();
    },
    pause() {
      if (!muted && !stopped) audio.pause();
    },
    resume() {
      if (!muted && !stopped) audio.play().catch(() => {});
    },
    toggle() {
      muted = !muted;
      try {
        localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
      } catch {
        // No storage: just for this recap.
      }
      onState(muted);
      if (muted) fadeTo(0, 250, () => audio.pause());
      else play();
    },
    stop() {
      stopped = true;
      fadeTo(0, 500, () => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      });
    },
    onError(fn) {
      audio.addEventListener("error", fn, { once: true });
    },
  };
}
// A Topdeck series' event: no top 8 — its best, the players with at least
// this many points ("I migliori").
const TOPDECK_MIN_POINTS = 6;
// Watched (the Bacheca's card's ring turns grey): per event / per league.
const EVENT_SEEN = (id) => `recapSeen:${id}`;
const SEASON_SEEN = (id) => `recapSeen:league:${id}`;

const SHIELD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';

const commanderOf = (entry) =>
  entry ? `${entry.commander?.name ?? "—"}${entry.partner_commander ? ` / ${entry.partner_commander.name}` : ""}` : "—";
// The archetypes' colours on the recap's dark screens: their own, but
// Combo's near-black (#2a2226) — invisible there — a light grey instead, its
// icon dark (.recap-bar.is-light).
const RECAP_LIGHT = { combo: "#d8cfd1" };

const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

// --- The data (once per event per visit) ---------------------------------------

const cache = new Map();

/** The recap's numbers for an event — shared by the Bacheca's card and the story. */
export function loadRecapData(eventId) {
  if (!cache.has(eventId)) {
    const request = (async () => {
      const [ev, [results], upcoming] = await Promise.all([
        Events.get(eventId),
        fetchEventsResults([eventId]),
        Events.listUpcoming().catch(() => []),
      ]);
      const { entries, matches } = results;
      const rows = computeEventLeaderboard(matches, entries);
      const posOf = new Map(rows.map((r, i) => [r.player?.id, i + 1]));
      const entryOf = new Map(entries.map((e) => [e.player_id, e]));
      const realMatches = matches.filter((m) => m.player2_id && !m.is_drop);
      const realWins = new Map();
      for (const m of realMatches) {
        if (m.player1_wins === m.player2_wins) continue;
        const w = m.player1_wins > m.player2_wins ? m.player1_id : m.player2_id;
        realWins.set(w, (realWins.get(w) ?? 0) + 1);
      }
      const bestOf = (list) => Math.min(...list.map((e) => posOf.get(e.player_id) ?? 999));
      const [topCommander, topEntries] = mostPlayed(entries, posOf);
      const winner = rows[0] ?? null;
      return {
        ev,
        name: ev.name || ev.league?.name || "Evento",
        rows,
        entryOf,
        rounds: Math.max(0, ...matches.map((m) => m.round)),
        matchCount: realMatches.length,
        winner,
        winnerCommander: winner ? commanderOf(entryOf.get(winner.player?.id)) : "—",
        unbeaten: rows.filter((r) => r.losses === 0 && (realWins.get(r.player?.id) ?? 0) > 0),
        topCommander,
        topCount: topEntries.length,
        topBest: topEntries.length ? bestOf(topEntries) : null,
        archetypes: archetypeCounts(entries),
        // The end's next event: the same league's next one, else (a league
        // over, a standalone event) the soonest upcoming one of any kind.
        next: (() => {
          const later = upcoming.filter((u) => u.event_date >= ev.event_date && u.id !== ev.id);
          return (ev.league_id && later.find((u) => u.league_id === ev.league_id)) || later[0] || null;
        })(),
      };
    })();
    cache.set(eventId, request);
    request.catch(() => cache.delete(eventId));
  }
  return cache.get(eventId);
}

const seen = (key) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
export const recapSeen = (eventId) => seen(EVENT_SEEN(eventId));
export const seasonRecapSeen = (leagueId) => seen(SEASON_SEEN(leagueId));

// The most played commander (pair) among `entries`: [name, its entries].
function mostPlayed(entries, posOf = null) {
  const byCommander = new Map();
  for (const e of entries) {
    const key = commanderOf(e);
    byCommander.set(key, [...(byCommander.get(key) ?? []), e]);
  }
  const bestOf = (list) => (posOf ? Math.min(...list.map((e) => posOf.get(e.player_id) ?? 999)) : 0);
  return [...byCommander.entries()].sort((a, b) => b[1].length - a[1].length || bestOf(a[1]) - bestOf(b[1]))[0] ?? ["—", []];
}

const archetypeCounts = (entries) =>
  ARCHETYPES.map((a) => ({ a, n: entries.filter((e) => e.archetype === a).length })).sort((x, y) => y.n - x.n);

/** A closed league's season recap numbers (cached per visit). */
export function loadSeasonData(leagueId) {
  const key = `league:${leagueId}`;
  if (!cache.has(key)) {
    const request = (async () => {
      const [league, leagueEvents, upcoming] = await Promise.all([
        Leagues.get(leagueId),
        Events.listByLeague(leagueId),
        Events.listUpcoming().catch(() => []),
      ]);
      const played = leagueEvents.filter((e) => !e.is_open).sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
      const [eventsData, scheduled] = await Promise.all([
        fetchEventsResults(played.map((e) => e.id)),
        Leagues.eventCount(leagueId, played.length),
      ]);
      const standings = computeLeaguePoints(eventsData, { leagueClosed: !league.is_open, scheduledEvents: scheduled ?? played.length });
      const entries = eventsData.flatMap((d) => d.entries);
      const champion = standings[0] ?? null;
      const [championCommander] = champion ? mostPlayed(entries.filter((e) => e.player_id === champion.player?.id)) : ["—"];
      const [topCommander, topEntries] = mostPlayed(entries);
      // A record and everyone sharing it (ties all named).
      const leaders = (valueOf) => {
        const n = Math.max(0, ...standings.map(valueOf));
        return n > 0 ? { players: standings.filter((r) => valueOf(r) === n).map((r) => r.player), n } : null;
      };
      return {
        league,
        name: league.name,
        from: played[0]?.event_date ?? null,
        to: played.at(-1)?.event_date ?? null,
        eventCount: played.length,
        players: standings.length,
        matchCount: eventsData.reduce((sum, d) => sum + d.matches.filter((m) => m.player2_id && !m.is_drop).length, 0),
        standings,
        champion,
        championCommander,
        mostFirsts: leaders((r) => r.placements?.[0] ?? 0),
        mostWins: leaders((r) => r.wins),
        fullAttendance: standings.filter((r) => r.fullAttendance),
        topCommander,
        topCount: topEntries.length,
        topPilots: new Set(topEntries.map((e) => e.player_id)).size,
        archetypes: archetypeCounts(entries),
        // The end's next event: only a new season's — the soonest upcoming
        // event of another open real league (not a Topdeck series); none:
        // no event shown.
        next: upcoming.find((u) => u.league && !u.league.is_topdeck && u.league_id !== leagueId) ?? null,
      };
    })();
    cache.set(key, request);
    request.catch(() => cache.delete(key));
  }
  return cache.get(key);
}

// --- The screens ----------------------------------------------------------------

// [data-in] items rise in, staggered by --d (styles.css).
const at = (d) => `data-in style="--d:${d}"`;

const CONFETTI = Array.from({ length: 34 }, (_, i) => {
  const colors = ["#ffd25a", "#ff5257", "#78dcff", "#ff78c8", "#fff"];
  return `<i style="left:${(i * 37) % 100}%;background:${colors[i % 5]};animation-delay:${(i % 9) * 0.18}s"></i>`;
}).join("");

// The archetypes' screen's headline, by how far ahead the most played is
// (`archetypes` sorted, most decks first): tied → "Pari: A e B" (or more);
// within a deck, or the second with 85%+ of the first → "Testa a testa: A e
// B"; 1.5× the second and 3+ decks more → "Ha dominato A"; else "Il più
// giocato: A".
function archetypeHeadline(archetypes) {
  const name = (a) => `<span class="recap-cap">${a}</span>`;
  const and = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} e ${list.at(-1)}` : list[0]);
  const [first, second] = archetypes;
  if (!first || first.n === 0) return "Nessun archetipo";
  if (!second || second.n === 0) return `Ha dominato ${name(first.a)}`;
  const tied = archetypes.filter((x) => x.n === first.n);
  if (tied.length > 1) return `Pari: ${and(tied.map((x) => name(x.a)))}`;
  if (first.n - second.n <= 1 || second.n >= first.n * 0.85) return `Testa a testa: ${name(first.a)} e ${name(second.a)}`;
  if (first.n >= second.n * 1.5 && first.n - second.n >= 3) return `Ha dominato ${name(first.a)}`;
  return `Il più giocato: ${name(first.a)}`;
}

// The archetypes' screen (event and season alike).
function archetypesSlide(archetypes, kicker) {
  const maxArch = Math.max(1, ...archetypes.map((x) => x.n));
  return `<section class="recap-slide"><div class="recap-bg is-dark"></div>
      <p class="recap-k" ${at(0)}>${kicker}</p>
      <h2 class="recap-big is-small" ${at(1)}>${archetypeHeadline(archetypes)}</h2>
      <div class="recap-bars">${archetypes
        .map(
          (x, i) =>
            `<div class="recap-bar${RECAP_LIGHT[x.a] ? " is-light" : ""}" style="--c:${RECAP_LIGHT[x.a] ?? ARCHETYPE_COLORS[x.a]};--d:${i}"><span class="recap-bar-ic">${archetypeIcon(x.a, "")}</span><div><small>${x.a}</small><div class="recap-bar-tr"><i style="--w:${(x.n / maxArch) * 100}%"></i></div></div><b>${x.n}</b></div>`
        )
        .join("")}</div></section>`;
}

// The last screen: `title`, the next event (when there is one), "Condividi".
function endSlide(title, next) {
  return `<section class="recap-slide is-center"><div class="recap-bg is-red"></div>
      <h2 class="recap-big" ${at(0)}>${title}</h2>
      ${
        next
          ? `<div class="recap-next" ${at(1)}><b>${escapeHtml(next.name || next.league?.name || "Evento")}</b><span>${escapeHtml(
              longDate(next.event_date)
            )}${next.start_time ? ` · ${next.start_time.slice(0, 5)}` : ""}</span></div>`
          : ""
      }
      <button type="button" class="recap-share" ${at(2)}>Condividi il recap</button></section>`;
}

// A list of the best (an event's top 8, a Topdeck event's best, a league's
// top 8 — `rows` already cut): position, name, a line under it, the points.
function topEightSlide(kicker, rows, lineOf) {
  return `<section class="recap-slide"><div class="recap-bg is-dark"></div>
      <p class="recap-k" ${at(0)}>${kicker}</p>
      <ol class="recap-list">${rows
        .map(
          (r, i) =>
            `<li ${at(i + 1)}><span class="recap-pos">${i + 1}</span><span class="recap-who"><b>${escapeHtml(r.player?.name)}</b><small>${escapeHtml(
              lineOf(r)
            )}</small></span><span class="recap-pts">${r.points} pt</span></li>`
        )
        .join("")}</ol></section>`;
}

function eventSlidesHtml(data) {
  const { ev, name, rows, entryOf, winner } = data;
  const league = ev.league?.name && ev.league.name !== name ? `${escapeHtml(ev.league.name)} · ` : "";
  const slides = [
    `<section class="recap-slide"><div class="recap-bg" data-art="${escapeHtml(data.winnerCommander)}"></div>
      <p class="recap-k" ${at(0)}>Il recap</p>
      <h2 class="recap-big" ${at(1)}>${escapeHtml(name)}</h2>
      <p class="recap-mid" ${at(2)}>${league}${escapeHtml(longDate(ev.event_date))}</p>
      <div class="recap-tiles" ${at(3)}><div><b>${rows.length}</b><span>giocatori</span></div><div><b>${data.rounds}</b><span>turni</span></div><div><b>${data.matchCount}</b><span>partite</span></div></div>
      <p class="recap-tap" ${at(5)}>Tocca per continuare ›</p></section>`,
  ];
  if (winner) {
    slides.push(`<section class="recap-slide is-center"><div class="recap-bg is-red"></div><div class="recap-confetti">${CONFETTI}</div>
      <p class="recap-k" ${at(0)}>Il vincitore</p>
      <div class="recap-trophy" ${at(1)}>🏆</div>
      <h2 class="recap-big" ${at(1)}>${escapeHtml(winner.player?.name)}</h2>
      <p class="recap-mid" ${at(2)}>con ${escapeHtml(data.winnerCommander)}</p>
      <div class="recap-card-art" ${at(3)} data-art="${escapeHtml(data.winnerCommander)}"></div>
      <div class="recap-pills" ${at(4)}><span>${winner.wins}-${winner.losses}-${winner.draws} V-S-P</span><span>${winner.points} punti</span></div></section>`);
    // A league's (or standalone) event: its top 8; a Topdeck series': its
    // best, TOPDECK_MIN_POINTS or more (none: no screen).
    const lineOf = (r) => commanderOf(entryOf.get(r.player?.id));
    if (!ev.league?.is_topdeck) slides.push(topEightSlide("La top 8", rows.slice(0, 8), lineOf));
    else {
      const best = rows.filter((r) => r.points >= TOPDECK_MIN_POINTS);
      if (best.length) slides.push(topEightSlide(`I migliori · ${TOPDECK_MIN_POINTS} punti o più`, best, lineOf));
    }
  }
  slides.push(`<section class="recap-slide"><div class="recap-bg is-red"></div>
      <p class="recap-k" ${at(0)}>Imbattuti</p>
      <h2 class="recap-big" ${at(1)}>${
        data.unbeaten.length
          ? `${data.unbeaten.length} ${data.unbeaten.length === 1 ? "giocatore" : "giocatori"} senza sconfitte`
          : "Nessuno imbattuto"
      }</h2>
      <div class="recap-chips">${
        data.unbeaten
          .map(
            (r, i) =>
              `<span class="recap-chip" ${at(i + 2)}>${SHIELD}${escapeHtml(r.player?.name)}<small>${r.wins}-${r.losses}-${r.draws}</small></span>`
          )
          .join("") || `<p class="recap-mid" ${at(2)}>Ogni giocatore ha perso almeno una partita.</p>`
      }</div></section>`);
  if (data.topCount) {
    slides.push(`<section class="recap-slide is-center"><div class="recap-bg" data-art="${escapeHtml(data.topCommander)}"></div>
      <p class="recap-k" ${at(0)}>Il comandante del giorno</p>
      <div class="recap-card-art" ${at(1)} data-art="${escapeHtml(data.topCommander)}"></div>
      <h2 class="recap-big is-small" ${at(2)}>${escapeHtml(data.topCommander)}</h2>
      <div class="recap-pills" ${at(3)}><span>${data.topCount} ${data.topCount === 1 ? "mazzo" : "mazzi"}</span><span>miglior risultato: ${data.topBest}°</span></div></section>`);
  }
  slides.push(archetypesSlide(data.archetypes, "Gli archetipi"));
  slides.push(endSlide("Ci vediamo al prossimo evento!", data.next));
  return slides.join("");
}

function seasonSlidesHtml(data) {
  const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  const slides = [
    `<section class="recap-slide"><div class="recap-bg" data-art="${escapeHtml(data.championCommander)}"></div>
      <p class="recap-k" ${at(0)}>La stagione</p>
      <h2 class="recap-big" ${at(1)}>${escapeHtml(data.name)}</h2>
      ${data.from ? `<p class="recap-mid" ${at(2)}>dal ${escapeHtml(shortDate(data.from))} al ${escapeHtml(shortDate(data.to))}</p>` : ""}
      <div class="recap-tiles" ${at(3)}><div><b>${data.eventCount}</b><span>eventi</span></div><div><b>${data.players}</b><span>giocatori</span></div><div><b>${data.matchCount}</b><span>partite</span></div></div>
      <p class="recap-tap" ${at(5)}>Tocca per continuare ›</p></section>`,
  ];
  const c = data.champion;
  if (c) {
    const firsts = c.placements?.[0] ?? 0;
    slides.push(`<section class="recap-slide is-center"><div class="recap-bg is-red"></div><div class="recap-confetti">${CONFETTI}</div>
      <p class="recap-k" ${at(0)}>Il campione</p>
      <div class="recap-trophy" ${at(1)}>🏆</div>
      <h2 class="recap-big" ${at(1)}>${escapeHtml(c.player?.name)}</h2>
      <p class="recap-mid" ${at(2)}>con ${escapeHtml(data.championCommander)}</p>
      <div class="recap-card-art" ${at(3)} data-art="${escapeHtml(data.championCommander)}"></div>
      <div class="recap-pills" ${at(4)}><span>${c.points} punti</span><span>${
        firsts ? `${firsts} ${firsts === 1 ? "evento vinto" : "eventi vinti"}` : `${c.wins}-${c.losses}-${c.draws} V-S-P`
      }</span></div></section>`);
    slides.push(topEightSlide("La classifica finale", data.standings.slice(0, 8), (r) => `${r.eventsPlayed} ${r.eventsPlayed === 1 ? "evento" : "eventi"} · ${r.wins}-${r.losses}-${r.draws}`));
  }
  // Everyone sharing a record: "A e B", "A, B e altri N".
  const names = (players) => {
    const list = players.map((p) => p?.name ?? "?");
    return list.length <= 2 ? list.join(" e ") : `${list[0]}, ${list[1]} e altri ${list.length - 2}`;
  };
  const records = [
    data.mostFirsts && { k: "Più eventi vinti", who: names(data.mostFirsts.players), n: data.mostFirsts.n },
    data.mostWins && { k: "Più partite vinte", who: names(data.mostWins.players), n: data.mostWins.n },
    data.fullAttendance.length && {
      k: "Presenza completa",
      who: data.fullAttendance.length <= 3 ? data.fullAttendance.map((r) => r.player?.name).join(", ") : `${data.fullAttendance.length} giocatori`,
      n: data.eventCount,
      unit: "su",
    },
  ].filter(Boolean);
  if (records.length) {
    slides.push(`<section class="recap-slide"><div class="recap-bg is-red"></div>
      <p class="recap-k" ${at(0)}>I record della stagione</p>
      <div class="recap-records">${records
        .map(
          (r, i) =>
            `<div class="recap-record" ${at(i + 1)}><span class="recap-k">${r.k}</span><b>${escapeHtml(r.who)}</b><span class="recap-record-n">${
              r.unit ? `${r.n}/${r.n}` : r.n
            }</span></div>`
        )
        .join("")}</div></section>`);
  }
  if (data.topCount) {
    slides.push(`<section class="recap-slide is-center"><div class="recap-bg" data-art="${escapeHtml(data.topCommander)}"></div>
      <p class="recap-k" ${at(0)}>Il comandante della stagione</p>
      <div class="recap-card-art" ${at(1)} data-art="${escapeHtml(data.topCommander)}"></div>
      <h2 class="recap-big is-small" ${at(2)}>${escapeHtml(data.topCommander)}</h2>
      <div class="recap-pills" ${at(3)}><span>${data.topCount} ${data.topCount === 1 ? "mazzo" : "mazzi"}</span><span>${data.topPilots} ${
        data.topPilots === 1 ? "giocatore" : "giocatori"
      }</span></div></section>`);
  }
  slides.push(archetypesSlide(data.archetypes, "Gli archetipi della stagione"));
  slides.push(endSlide("Ci vediamo alla prossima stagione!", data.next));
  return slides.join("");
}

// --- The player -----------------------------------------------------------------

let open = null; // { dialog, close }

export function openEventRecap(eventId) {
  return openStories({
    label: "Recap dell'evento",
    load: () => loadRecapData(eventId),
    slides: eventSlidesHtml,
    seenKey: EVENT_SEEN(eventId),
    seenId: eventId,
    shareUrl: `event.html?id=${eventId}&recap=1`,
  });
}

export function openSeasonRecap(leagueId) {
  return openStories({
    label: "Recap della stagione",
    load: () => loadSeasonData(leagueId),
    slides: seasonSlidesHtml,
    seenKey: SEASON_SEEN(leagueId),
    seenId: `league:${leagueId}`,
    shareUrl: `league.html?id=${leagueId}&recap=1`,
  });
}

// The stories: `load()` the data, `slides(data)` its screens' markup;
// watched: localStorage `seenKey`, and "recap:seen" (detail `seenId`).
async function openStories({ label, load, slides: slidesOf, seenKey, seenId, shareUrl }) {
  open?.close();
  const dialog = document.createElement("dialog");
  dialog.className = "recap";
  dialog.setAttribute("aria-label", label);
  dialog.innerHTML = `
    <div class="recap-st">
      <div class="recap-progress" aria-hidden="true"></div>
      <div class="recap-head"><img src="dc_pc.svg" alt=""><b class="recap-title">Recap</b><button type="button" class="recap-sound" hidden></button><button type="button" class="recap-close" aria-label="Chiudi">×</button></div>
      <div class="recap-slides"><section class="recap-slide is-on is-center"><div class="recap-bg is-red"></div><p class="recap-mid">Caricamento…</p></section></div>
      <button type="button" class="recap-nav is-prev" aria-label="Indietro"></button>
      <button type="button" class="recap-nav is-next" aria-label="Avanti"></button>
    </div>`;
  document.body.append(dialog);
  dialog.showModal();
  document.documentElement.classList.add("is-recap-open");

  let index = 0;
  let elapsed = 0;
  let startedAt = 0;
  let paused = false;
  let frame = 0;
  let slides = [];
  let fills = [];
  const controller = new AbortController();
  const { signal } = controller;

  // The music (none without tracks): its button shows its state.
  const soundBtn = dialog.querySelector(".recap-sound");
  const music = createMusic((muted) => {
    soundBtn.hidden = false;
    soundBtn.innerHTML = muted ? SOUND_OFF : SOUND_ON;
    soundBtn.setAttribute("aria-label", muted ? "Attiva la musica" : "Disattiva la musica");
    soundBtn.classList.toggle("is-muted", muted);
  });
  music?.onError(() => (soundBtn.hidden = true));
  soundBtn.addEventListener("click", () => music?.toggle());

  function close() {
    if (!dialog.isConnected) return;
    music?.stop();
    controller.abort();
    cancelAnimationFrame(frame);
    dialog.close();
    dialog.remove();
    document.documentElement.classList.remove("is-recap-open");
    if (open?.dialog === dialog) open = null;
    // A shared link's "&recap=1": not opened again on a reload.
    const url = new URL(location.href);
    if (url.searchParams.has("recap")) {
      url.searchParams.delete("recap");
      history.replaceState(history.state, "", url.href);
    }
  }
  open = { dialog, close };

  function show(n) {
    index = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((el, k) => el.classList.toggle("is-on", k === index));
    fills.forEach((fill, k) => (fill.style.width = k < index ? "100%" : "0"));
    elapsed = 0;
    startedAt = performance.now();
  }

  function tick(now) {
    if (!paused && slides.length) {
      const progress = Math.min(1, (elapsed + now - startedAt) / RECAP_STEP);
      fills[index].style.width = `${progress * 100}%`;
      // The next screen; after the last one's time, the recap closes.
      if (progress >= 1) {
        if (index < slides.length - 1) show(index + 1);
        else {
          close();
          return;
        }
      }
    }
    frame = requestAnimationFrame(tick);
  }

  function pause() {
    if (paused) return;
    paused = true;
    elapsed += performance.now() - startedAt;
  }
  function resume() {
    if (!paused) return;
    paused = false;
    startedAt = performance.now();
  }

  dialog.querySelector(".recap-close").addEventListener("click", close);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  // A click on the backdrop (a computer: around the panel).
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  document.addEventListener("app:navigate", close, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        pause();
        music?.pause();
      } else {
        resume();
        music?.resume();
      }
    },
    { signal }
  );
  // Started at once, in the opening tap's own turn (browsers allow sound
  // only right after a user's gesture) — not after the data's wait.
  music?.start();

  try {
    const data = await load();
    if (!dialog.isConnected) return;
    try {
      localStorage.setItem(seenKey, "1");
    } catch {
      // No storage: it just won't be remembered.
    }
    document.dispatchEvent(new CustomEvent("recap:seen", { detail: seenId }));
    dialog.querySelector(".recap-title").textContent = `Recap · ${data.name}`;
    const host = dialog.querySelector(".recap-slides");
    host.innerHTML = slidesOf(data);
    for (const el of host.querySelectorAll("[data-art]")) createArtPainter(el)(el.dataset.art.split(" / ")[0]);
    slides = [...host.children];
    const progress = dialog.querySelector(".recap-progress");
    progress.innerHTML = slides.map(() => "<i><b></b></i>").join("");
    fills = [...progress.querySelectorAll("b")];

    // Holding pauses; a short tap on a side goes back / on.
    const stage = dialog.querySelector(".recap-st");
    let downAt = 0;
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".recap-close, .recap-share, .recap-sound")) return;
      downAt = performance.now();
      pause();
    });
    stage.addEventListener("pointerup", (e) => {
      if (!downAt) return;
      const held = performance.now() - downAt > 300;
      downAt = 0;
      resume();
      if (held) return;
      if (e.target.closest(".recap-nav.is-prev")) show(index - 1);
      else if (e.target.closest(".recap-nav.is-next")) {
        if (index < slides.length - 1) show(index + 1);
        else close();
      }
    });
    stage.addEventListener("pointercancel", () => {
      downAt = 0;
      resume();
    });
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") show(index + 1);
      else if (e.key === "ArrowLeft") show(index - 1);
    });

    const share = dialog.querySelector(".recap-share");
    share?.addEventListener("click", async () => {
      const url = new URL(shareUrl, location.href).href;
      try {
        if (navigator.share) await navigator.share({ title: `Recap · ${data.name}`, url });
        else {
          await navigator.clipboard.writeText(url);
          share.textContent = "Link copiato!";
        }
      } catch {
        // Share sheet dismissed: nothing to do.
      }
    });

    show(0);
    frame = requestAnimationFrame(tick);
  } catch (err) {
    console.error(err);
    if (dialog.isConnected) dialog.querySelector(".recap-slides").innerHTML =
      '<section class="recap-slide is-on is-center"><div class="recap-bg is-red"></div><p class="recap-mid">Recap non disponibile.</p></section>';
  }
}
