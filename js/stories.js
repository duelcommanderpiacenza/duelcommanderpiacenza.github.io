// The Bacheca's other stories, beside the recaps (js/event-recap.js, whose
// player and look they share — openStories; styles: css/6 "Event recap"
// and "Other stories"):
//  - **Nuovo video**: each YouTube video out in the last VIDEO_HOURS (from
//    videos.json, refreshed daily by the GitHub Action) — the matchup from
//    its title ("… // Tifa VS Light-Paws // series"), the two commanders'
//    art face to face (matched against the commanders' names), then its
//    thumbnail with "Guarda su YouTube".
//  - **Nuovo primer**: each Moxfield deck whose name starts with "[PRIMER]"
//    (not the events' decklists) created in the last PRIMER_HOURS (from
//    decks.json, refreshed daily) — its commander's art, the deck's name,
//    then "Apri su Moxfield".
//  - **Il meta del mese**: from the 1st to the META_DAYS-th of a month, the
//    month just ended — its events / decks / commanders, the commander of the
//    month, the top 5 (share, winrate), the revelation (best winrate, at
//    least REVELATION_MIN_PLAYED matches), the archetypes.
// `dueStories()` gives each as a bubble item for js/home.js's bar (`sub`:
// the line under its name there, on a computer).

import { Events, Commanders, fetchEventsResults } from "./db.js";
import { computeGroupedStats } from "./stats.js";
import { ARCHETYPES } from "./metagame-chart.js";
import { capitalize, escapeHtml, localIso } from "./ui.js";
import { openStories, at, archetypesSlide } from "./event-recap.js";

const VIDEO_HOURS = 48;
const PRIMER_HOURS = 48;
const META_DAYS = 5;
const REVELATION_MIN_PLAYED = 6;
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const PLAY =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"></path></svg>';

const seen = (key) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

// --- Nuovo video ---------------------------------------------------------------------

// "Duel Commander // Tifa VS Light-Paws // Duel Commander Piacenza League":
// the two sides and the series.
function parseVideoTitle(title) {
  const parts = (title ?? "").split("//").map((p) => p.trim());
  const [left, right] = (parts[1] ?? "").split(/\s+VS\s+/i);
  return { matchup: parts[1] || title, left: left ?? null, right: right ?? null, series: parts[2] ?? "" };
}

// A side's commander, from its short name in the title ("Tifa" → "Tifa
// Lockhart"): the one starting with it, else containing it.
function commanderNamed(commanders, part) {
  const p = (part ?? "").trim().toLowerCase();
  if (!p) return null;
  return commanders.find((c) => c.name.toLowerCase().startsWith(p)) ?? commanders.find((c) => c.name.toLowerCase().includes(p)) ?? null;
}

function videoSlides(video, commanders) {
  const { matchup, left, right } = parseVideoTitle(video.title);
  // The two commanders: their arts in one row (with the VS between), their
  // names in a row under it — so the circles line up whatever the names'
  // length.
  const [lc, rc] = [left, right].map((part) => commanderNamed(commanders, part));
  const art = (c) => `<span class="story-vs-art" data-art="${escapeHtml(c?.name ?? "")}"></span>`;
  const label = (c, part) => `<b>${escapeHtml(c?.name ?? part ?? "")}</b>`;
  const slides = [
    `<section class="recap-slide is-center"><div class="recap-bg story-bg-thumb" style="background-image:url('${escapeHtml(video.thumbnailUrl)}')"></div>
      <p class="recap-k" ${at(0)}>Nuovo video</p>
      <h2 class="recap-big is-small" ${at(1)}>${
        left && right ? `${escapeHtml(left)} <span class="story-vs-word">VS</span> ${escapeHtml(right)}` : escapeHtml(matchup)
      }</h2>
      ${
        left && right
          ? `<div class="story-vs" ${at(2)}>${art(lc)}<span class="story-vs-word">VS</span>${art(rc)}${label(lc, left)}<span></span>${label(rc, right)}</div>`
          : ""
      }</section>`,
    `<section class="recap-slide is-center"><div class="recap-bg is-dark"></div>
      <p class="recap-k" ${at(0)}>Guardalo ora</p>
      <a class="story-thumb" ${at(1)} href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer" aria-label="Guarda su YouTube"><span class="story-thumb-img" style="background-image:url('${escapeHtml(
        video.thumbnailUrl
      )}')"></span><span class="story-thumb-play"><span>${PLAY}</span></span></a>
      <p class="recap-mid story-thumb-title" ${at(2)}>${escapeHtml(matchup)}</p>
      <a class="story-yt" ${at(3)} href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer"><img src="youtube.svg" alt="">Guarda su YouTube</a></section>`,
  ];
  return slides.join("");
}

async function dueVideos() {
  const videos = await fetch("videos.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : []));
  const since = Date.now() - VIDEO_HOURS * 3600 * 1000;
  return videos
    .filter((v) => v.publishedAtUtc && new Date(v.publishedAtUtc).getTime() >= since)
    .sort((a, b) => b.publishedAtUtc.localeCompare(a.publishedAtUtc))
    .map((video) => {
      const seenKey = `storySeen:video:${video.id}`;
      return {
        date: video.publishedAtUtc.slice(0, 10),
        until: localIso(new Date(new Date(video.publishedAtUtc).getTime() + VIDEO_HOURS * 3600 * 1000)),
        seenId: `video:${video.id}`,
        seen: seen(seenKey),
        kicker: "Nuovo video",
        short: "Nuovo video",
        title: parseVideoTitle(video.title).matchup,
        sub: "YouTube",
        thumb: video.thumbnailUrl,
        open: () =>
          openStories({
            label: "Nuovo video",
            heading: () => "Nuovo video",
            load: async () => ({ name: video.title, commanders: await Commanders.list().catch(() => []) }),
            slides: (data) => videoSlides(video, data.commanders),
            seenKey,
            seenId: `video:${video.id}`,
            shareUrl: video.url,
          }),
      };
    });
}

// --- Nuovo primer ----------------------------------------------------------------------

const isPrimer = (deck) => /^\[PRIMER\]/i.test(deck.name ?? "");
const primerTitle = (deck) => (deck.name ?? "").replace(/^\[PRIMER\]\s*[-–—:]?\s*/i, "").trim() || deck.commanderName || "Primer";

function primerSlides(deck) {
  const art = deck.previewImageUrl ?? "";
  return [
    `<section class="recap-slide is-center"><div class="recap-bg" style="background-image:url('${escapeHtml(art)}')"></div>
      <p class="recap-k" ${at(0)}>Nuovo primer</p>
      <div class="recap-card-art" data-in style="--d:1;background-image:url('${escapeHtml(art)}')"></div>
      <h2 class="recap-big is-small" ${at(2)}>${escapeHtml(primerTitle(deck))}</h2>
      ${deck.commanderName ? `<p class="recap-mid" ${at(3)}>${escapeHtml(deck.commanderName)}</p>` : ""}
      <p class="recap-mid story-meta-note" ${at(4)}>La guida al mazzo: come si gioca, le scelte, i matchup.</p></section>`,
    `<section class="recap-slide is-center"><div class="recap-bg is-dark"></div>
      <p class="recap-k" ${at(0)}>Leggilo ora</p>
      <a class="story-thumb" ${at(1)} href="${escapeHtml(deck.url)}" target="_blank" rel="noopener noreferrer" aria-label="Apri su Moxfield"><span class="story-thumb-img" style="background-image:url('${escapeHtml(art)}')"></span></a>
      <p class="recap-mid story-thumb-title" ${at(2)}>${escapeHtml(primerTitle(deck))}</p>
      <a class="story-yt story-moxfield" ${at(3)} href="${escapeHtml(deck.url)}" target="_blank" rel="noopener noreferrer"><img src="moxfield.png" alt="">Apri su Moxfield</a></section>`,
  ].join("");
}

async function duePrimers() {
  const decks = await fetch("decks.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : []));
  const since = Date.now() - PRIMER_HOURS * 3600 * 1000;
  return decks
    .filter((d) => isPrimer(d) && d.createdAtUtc && new Date(d.createdAtUtc).getTime() >= since)
    .map((deck) => {
      const seenKey = `storySeen:primer:${deck.id}`;
      return {
        date: deck.createdAtUtc.slice(0, 10),
        until: localIso(new Date(new Date(deck.createdAtUtc).getTime() + PRIMER_HOURS * 3600 * 1000)),
        seenId: `primer:${deck.id}`,
        seen: seen(seenKey),
        kicker: "Nuovo primer",
        short: "Primer",
        title: primerTitle(deck),
        sub: "Moxfield",
        thumb: deck.previewImageUrl ?? null,
        art: deck.previewImageUrl ? null : deck.commanderName,
        open: () =>
          openStories({
            label: "Nuovo primer",
            heading: () => "Nuovo primer",
            load: async () => ({ name: deck.name }),
            slides: () => primerSlides(deck),
            seenKey,
            seenId: `primer:${deck.id}`,
            shareUrl: deck.url,
          }),
      };
    });
}

// --- Il meta del mese ------------------------------------------------------------------

async function loadMeta(from, to, month) {
  const events = (await Events.list()).filter((e) => !e.is_open && e.event_date >= from && e.event_date <= to);
  const data = await fetchEventsResults(events.map((e) => e.id));
  const entries = data.flatMap((d) => d.entries);
  const stats = computeGroupedStats(
    data,
    (e) => `${e.commander_id}|${e.partner_commander_id ?? ""}`,
    (e) => ({
      name: `${e.commander?.name ?? "—"}${e.partner_commander ? ` / ${e.partner_commander.name}` : ""}`,
      first: e.commander?.name ?? "",
    })
  ).sort((a, b) => b.entries - a.entries || (b.winRate ?? 0) - (a.winRate ?? 0));
  return {
    name: `il meta di ${month}`,
    month,
    events: events.length,
    decks: entries.length,
    stats,
    top: stats.slice(0, 5),
    revelation: stats.filter((s) => s.played >= REVELATION_MIN_PLAYED).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0] ?? null,
    archetypes: ARCHETYPES.map((a) => ({ a, n: entries.filter((e) => e.archetype === a).length })).sort((x, y) => y.n - x.n),
  };
}

function metaSlides(m) {
  const share = (n) => `${((n / m.decks) * 100).toFixed(1)}%`;
  const wr = (s) => (s.winRate == null ? "—" : `${s.winRate.toFixed(0)}%`);
  const first = m.top[0];
  const slides = [
    `<section class="recap-slide"><div class="recap-bg" data-art="${escapeHtml(first?.first ?? "")}"></div>
      <p class="recap-k" ${at(0)}>Il meta del mese</p>
      <h2 class="recap-big" ${at(1)}>${capitalize(m.month)}</h2>
      <div class="recap-tiles" ${at(3)}><div><b>${m.events}</b><span>eventi</span></div><div><b>${m.decks}</b><span>mazzi</span></div><div><b>${m.stats.length}</b><span>comandanti</span></div></div>
      <p class="recap-tap" ${at(5)}>Tocca per continuare ›</p></section>`,
  ];
  if (first) {
    slides.push(`<section class="recap-slide is-center"><div class="recap-bg is-red"></div>
      <p class="recap-k" ${at(0)}>Il comandante del mese</p>
      <div class="recap-card-art" ${at(1)} data-art="${escapeHtml(first.first)}"></div>
      <h2 class="recap-big is-small" ${at(2)}>${escapeHtml(first.name)}</h2>
      <div class="recap-pills" ${at(3)}><span>${first.entries} ${first.entries === 1 ? "mazzo" : "mazzi"} · ${share(first.entries)}</span><span>winrate ${wr(first)}</span></div></section>`);
    slides.push(`<section class="recap-slide"><div class="recap-bg is-dark"></div>
      <p class="recap-k" ${at(0)}>I più giocati di ${m.month}</p>
      <ol class="story-meta-list">${m.top
        .map(
          (s, i) =>
            `<li ${at(i + 1)}><span class="story-meta-pos">${i + 1}</span><span class="story-meta-art" data-art="${escapeHtml(s.first)}"></span><span class="story-meta-who"><b>${escapeHtml(
              s.name
            )}</b><small>winrate ${wr(s)}</small></span><span class="story-meta-share">${share(s.entries)}<small>${s.entries} ${s.entries === 1 ? "mazzo" : "mazzi"}</small></span></li>`
        )
        .join("")}</ol></section>`);
  }
  const r = m.revelation;
  if (r) {
    slides.push(`<section class="recap-slide is-center"><div class="recap-bg" data-art="${escapeHtml(r.first)}"></div>
      <p class="recap-k" ${at(0)}>La rivelazione</p>
      <div class="recap-card-art" ${at(1)} data-art="${escapeHtml(r.first)}"></div>
      <h2 class="recap-big is-small" ${at(2)}>${escapeHtml(r.name)}</h2>
      <div class="recap-pills" ${at(3)}><span>winrate ${wr(r)}</span><span>${r.wins}-${r.losses}-${r.draws} V-S-P</span></div>
      <p class="recap-mid story-meta-note" ${at(4)}>il miglior winrate del mese (almeno ${REVELATION_MIN_PLAYED} partite)</p></section>`);
  }
  slides.push(archetypesSlide(m.archetypes, `Gli archetipi di ${m.month}`));
  return slides.join("");
}

// The month just ended, from its 1st to its META_DAYS-th day — one item,
// or none (outside those days, or no event played that month).
async function dueMeta() {
  const today = new Date();
  if (today.getDate() > META_DAYS) return [];
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  const from = localIso(start);
  const to = localIso(end);
  const month = MONTHS[start.getMonth()];
  const meta = await loadMeta(from, to, month);
  if (!meta.events) return [];
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  const seenKey = `storySeen:meta:${key}`;
  return [
    {
      // In the row's chronology: the day it comes out, the month's 1st.
      date: localIso(new Date(today.getFullYear(), today.getMonth(), 1)),
      until: localIso(new Date(today.getFullYear(), today.getMonth(), META_DAYS)),
      seenId: `meta:${key}`,
      seen: seen(seenKey),
      kicker: "Il meta del mese",
      short: "Meta",
      title: capitalize(month),
      sub: "Il meta del mese",
      art: meta.top[0]?.first ?? "",
      open: () =>
        openStories({
          label: `Il meta di ${month}`,
          heading: () => `Il meta di ${month}`,
          load: async () => meta,
          slides: metaSlides,
          seenKey,
          seenId: `meta:${key}`,
          shareUrl: "index.html",
        }),
    },
  ];
}

/** The other stories due now, as bubble items (js/home.js); a failed one is left out. */
export async function dueStories() {
  const settled = await Promise.allSettled([dueVideos(), duePrimers(), dueMeta()]);
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : (console.error(r.reason), [])));
}
