// An event's recap, in stories (since 2026-10-26 — the "Wrapped" mockup):
// full-screen on a phone (a phone-sized panel over a dark backdrop on a
// computer), one screen at a time — bars across the top fill as each plays
// (RECAP_STEP), a tap on the right goes on, on the left back, holding pauses;
// the arrow keys too. The screens: the cover (the event, players / rounds /
// matches, on the winner's commander art), the winner (their commander's art
// as a foil card, confetti), the top 8, the unbeaten (no losses AND a real
// match won — a bye isn't one, only draws isn't a result to celebrate), the
// commander of the day (the most played; a tie: the best placed), the
// archetypes, and the end ("Ci vediamo al prossimo evento!", the next event — the
// same league's, else the soonest of any kind — and "Condividi il recap").
// Opened by the Bacheca's recap card (js/home.js) and by a shared link
// (event.html?id=…&recap=1, js/event-detail.js). Styles: css/6 "Event recap".

import { Events, fetchEventsResults } from "./db.js";
import { computeEventLeaderboard } from "./leaderboard.js";
import { ARCHETYPES, ARCHETYPE_COLORS } from "./metagame-chart.js";
import { archetypeIcon } from "./archetype-icons.js";
import { createArtPainter } from "./player-card.js";
import { escapeHtml } from "./ui.js";

const RECAP_STEP = 6500;
const SEEN_KEY = (id) => `recapSeen:${id}`;

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
      const byCommander = new Map();
      for (const e of entries) {
        const key = commanderOf(e);
        byCommander.set(key, [...(byCommander.get(key) ?? []), e]);
      }
      const bestOf = (list) => Math.min(...list.map((e) => posOf.get(e.player_id) ?? 999));
      const [topCommander, topEntries] = [...byCommander.entries()].sort(
        (a, b) => b[1].length - a[1].length || bestOf(a[1]) - bestOf(b[1])
      )[0] ?? ["—", []];
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
        archetypes: ARCHETYPES.map((a) => ({ a, n: entries.filter((e) => e.archetype === a).length })).sort((x, y) => y.n - x.n),
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

export const recapSeen = (eventId) => {
  try {
    return localStorage.getItem(SEEN_KEY(eventId)) === "1";
  } catch {
    return false;
  }
};

// --- The screens ----------------------------------------------------------------

// [data-in] items rise in, staggered by --d (styles.css).
const at = (d) => `data-in style="--d:${d}"`;

function slidesHtml(data) {
  const { ev, name, rows, entryOf, winner } = data;
  const league = ev.league?.name && ev.league.name !== name ? `${escapeHtml(ev.league.name)} · ` : "";
  const maxArch = Math.max(1, ...data.archetypes.map((x) => x.n));
  const confetti = Array.from({ length: 34 }, (_, i) => {
    const colors = ["#ffd25a", "#ff5257", "#78dcff", "#ff78c8", "#fff"];
    return `<i style="left:${(i * 37) % 100}%;background:${colors[i % 5]};animation-delay:${(i % 9) * 0.18}s"></i>`;
  }).join("");
  const slides = [
    `<section class="recap-slide"><div class="recap-bg" data-art="${escapeHtml(data.winnerCommander)}"></div>
      <p class="recap-k" ${at(0)}>Il recap</p>
      <h2 class="recap-big" ${at(1)}>${escapeHtml(name)}</h2>
      <p class="recap-mid" ${at(2)}>${league}${escapeHtml(longDate(ev.event_date))}</p>
      <div class="recap-tiles" ${at(3)}><div><b>${rows.length}</b><span>giocatori</span></div><div><b>${data.rounds}</b><span>turni</span></div><div><b>${data.matchCount}</b><span>partite</span></div></div>
      <p class="recap-tap" ${at(5)}>Tocca per continuare ›</p></section>`,
  ];
  if (winner) {
    slides.push(`<section class="recap-slide is-center"><div class="recap-bg is-red"></div><div class="recap-confetti">${confetti}</div>
      <p class="recap-k" ${at(0)}>Il vincitore</p>
      <div class="recap-trophy" ${at(1)}>🏆</div>
      <h2 class="recap-big" ${at(1)}>${escapeHtml(winner.player?.name)}</h2>
      <p class="recap-mid" ${at(2)}>con ${escapeHtml(data.winnerCommander)}</p>
      <div class="recap-card-art" ${at(3)} data-art="${escapeHtml(data.winnerCommander)}"></div>
      <div class="recap-pills" ${at(4)}><span>${winner.wins}-${winner.losses}-${winner.draws} V-S-P</span><span>${winner.points} punti</span></div></section>`);
    slides.push(`<section class="recap-slide"><div class="recap-bg is-dark"></div>
      <p class="recap-k" ${at(0)}>La top 8</p>
      <ol class="recap-list">${rows
        .slice(0, 8)
        .map(
          (r, i) =>
            `<li ${at(i + 1)}><span class="recap-pos">${i + 1}</span><span class="recap-who"><b>${escapeHtml(r.player?.name)}</b><small>${escapeHtml(
              commanderOf(entryOf.get(r.player?.id))
            )}</small></span><span class="recap-pts">${r.points} pt</span></li>`
        )
        .join("")}</ol></section>`);
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
  slides.push(`<section class="recap-slide"><div class="recap-bg is-dark"></div>
      <p class="recap-k" ${at(0)}>Gli archetipi</p>
      <h2 class="recap-big is-small" ${at(1)}>Ha dominato <span class="recap-cap">${data.archetypes[0].a}</span></h2>
      <div class="recap-bars">${data.archetypes
        .map(
          (x, i) =>
            `<div class="recap-bar${RECAP_LIGHT[x.a] ? " is-light" : ""}" style="--c:${RECAP_LIGHT[x.a] ?? ARCHETYPE_COLORS[x.a]};--d:${i}"><span class="recap-bar-ic">${archetypeIcon(x.a, "")}</span><div><small>${x.a}</small><div class="recap-bar-tr"><i style="--w:${(x.n / maxArch) * 100}%"></i></div></div><b>${x.n}</b></div>`
        )
        .join("")}</div></section>`);
  const next = data.next;
  slides.push(`<section class="recap-slide is-center"><div class="recap-bg is-red"></div>
      <h2 class="recap-big" ${at(0)}>Ci vediamo al prossimo evento!</h2>
      ${
        next
          ? `<div class="recap-next" ${at(1)}><b>${escapeHtml(next.name || next.league?.name || "Evento")}</b><span>${escapeHtml(
              longDate(next.event_date)
            )}${next.start_time ? ` · ${next.start_time.slice(0, 5)}` : ""}</span></div>`
          : ""
      }
      <button type="button" class="recap-share" ${at(2)}>Condividi il recap</button></section>`);
  return slides.join("");
}

// --- The player -----------------------------------------------------------------

let open = null; // { dialog, close }

export async function openEventRecap(eventId) {
  open?.close();
  const dialog = document.createElement("dialog");
  dialog.className = "recap";
  dialog.setAttribute("aria-label", "Recap dell'evento");
  dialog.innerHTML = `
    <div class="recap-st">
      <div class="recap-progress" aria-hidden="true"></div>
      <div class="recap-head"><img src="dc_pc.svg" alt=""><b class="recap-title">Recap</b><button type="button" class="recap-close" aria-label="Chiudi">×</button></div>
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

  function close() {
    if (!dialog.isConnected) return;
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
      if (progress >= 1 && index < slides.length - 1) show(index + 1);
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
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()), { signal });

  try {
    const data = await loadRecapData(eventId);
    if (!dialog.isConnected) return;
    try {
      localStorage.setItem(SEEN_KEY(eventId), "1");
    } catch {
      // No storage: it just won't be remembered.
    }
    document.dispatchEvent(new CustomEvent("recap:seen", { detail: eventId }));
    dialog.querySelector(".recap-title").textContent = `Recap · ${data.name}`;
    const host = dialog.querySelector(".recap-slides");
    host.innerHTML = slidesHtml(data);
    for (const el of host.querySelectorAll("[data-art]")) createArtPainter(el)(el.dataset.art.split(" / ")[0]);
    slides = [...host.children];
    const progress = dialog.querySelector(".recap-progress");
    progress.innerHTML = slides.map(() => "<i><b></b></i>").join("");
    fills = [...progress.querySelectorAll("b")];

    // Holding pauses; a short tap on a side goes back / on.
    const stage = dialog.querySelector(".recap-st");
    let downAt = 0;
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".recap-close, .recap-share")) return;
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
      else if (e.target.closest(".recap-nav.is-next")) show(index + 1);
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
      const url = new URL(`event.html?id=${eventId}&recap=1`, location.href).href;
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
