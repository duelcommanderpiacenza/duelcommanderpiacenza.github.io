// The achievements ("Obiettivi"): their definitions, a player's state, and
// how they're drawn — the list (player.html's "Obiettivi" tab,
// js/player-detail.js; the profile's, js/account-page.js) and the medal of
// the unlock bar (js/achievement-toast.js).
//
// Three kinds (`source`): "results" — earned by playing, computed by the
// admin's sync (js/achievement-progress.js → player_achievements); "site" —
// earned on the site by an account (migration 047: my_achievements(), the
// card's own save); "final" — Seriamente 1.0, every other one at its last
// level, derived here.
//
// A tiered one is ONE achievement with levels I–IV (its name + the roman
// numeral); its colour is the level reached — I bronze, II silver, III
// gold, IV mythic —, a single one the page's accent, Seriamente 1.0 gold.
// A locked one shows only its name and a hint — never the exact condition
// (that's its description, shown once unlocked).
//
// The list is drawn with the player page's own shapes (user, 2026-11-24,
// option D of a mockup): the summary like the league recap's card, each
// group a card like the rivals', the medals as tinted discs like the
// rivals' icons (styles.css "Obiettivi").

import { escapeHtml, formatDate } from "./ui.js";

// Line icons (24×24, currentColor) in the look of js/archetype-icons.js —
// from Lucide (ISC licence) or drawn the same way.
const ICONS = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4M7 17l-3 3M3 19l2 2"/>',
  podium: '<path d="M9 21V9h6v12"/><path d="M3 21v-7h6M15 16h6v5"/><path d="M2 21h20"/><path d="m12 3 .9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 5.1l2-.3z"/>',
  cards: '<rect x="9" y="3" width="11" height="15" rx="2"/><path d="M6.2 6.6 4.7 7.1a2 2 0 0 0-1.3 2.5l3.2 9.7a2 2 0 0 0 2.5 1.3l5.1-1.7"/>',
  crown: '<path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.27-3.67a.5.5 0 0 1 .8.52l-2.83 10.24a1 1 0 0 1-.96.74H5.81a1 1 0 0 1-.96-.74L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.67a1 1 0 0 0 1.52-.3z"/><path d="M5 21h14"/>',
  popper: '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01M22 8h.01M15 2h.01M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>',
  shieldCheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  award: '<path d="m15.48 12.89 1.51 8.53a.5.5 0 0 1-.81.47l-3.58-2.69a1 1 0 0 0-1.2 0l-3.59 2.69a.5.5 0 0 1-.81-.47l1.51-8.53"/><circle cx="12" cy="8" r="6"/>',
  trendingUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2M13 12l5.88-9.8M8 7h8"/><circle cx="12" cy="17" r="5"/>',
  shapes: '<path d="M8.3 10a.7.7 0 0 1-.63-1.08L11.4 3a.7.7 0 0 1 1.2-.04L16.3 8.9a.7.7 0 0 1-.57 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
  mirror: '<path d="m3 7 5 5-5 5V7M21 7l-5 5 5 5V7"/><path d="M12 20v2M12 14v2M12 8v2M12 2v2"/>',
  diamond: '<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"/>',
  rainbow: '<path d="M22 17a10 10 0 0 0-20 0"/><path d="M6 17a6 6 0 0 1 12 0"/><path d="M10 17a2 2 0 0 1 4 0"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4"/>',
  circleCheck: '<path d="M21.8 10A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  chevrons: '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  userCheck: '<circle cx="10" cy="8" r="5"/><path d="M2 21a8 8 0 0 1 13.29-6"/><path d="m16 19 2 2 4-4"/>',
  idCard: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><path d="M16 10h2M16 14h2"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
  sealCheck: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
};

export const GROUPS = [
  { id: "risultati", name: "Risultati" },
  { id: "leghe", name: "Leghe" },
  { id: "stile", name: "Stile di gioco" },
  { id: "presenza", name: "Presenza" },
  { id: "sito", name: "Sul sito" },
];

// key (stored in the database — never rename one), name, group, icon,
// tiers (the thresholds of levels I…; none = a single one), desc (shown once
// unlocked: a string, or for a tiered one a function of the level's
// threshold), hint (shown while locked: a nudge, not the condition). The
// rules themselves are in js/achievement-progress.js (results) and
// migration 047 (site).
export const ACHIEVEMENTS = [
  // Risultati
  { key: "prima_vittoria", name: "Prima vittoria", group: "risultati", icon: "popper", desc: "La tua prima partita vinta.", hint: "Tutto comincia con una vittoria." },
  { key: "vittorie", name: "Vittorie", group: "risultati", icon: "swords", tiers: [25, 50, 100, 150], desc: (n) => `${n} partite vinte.`, hint: "Vinci le tue partite." },
  { key: "imbattuto", name: "Imbattuto", group: "risultati", icon: "shieldCheck", desc: "Un evento chiuso senza sconfitte.", hint: "Un evento senza mai abbassare la guardia." },
  { key: "perfetto", name: "Perfetto", group: "risultati", icon: "gem", desc: "Un evento vinto vincendo tutte le partite.", hint: "Un evento da ricordare, dall'inizio alla fine." },
  { key: "primo_posto", name: "Primo posto", group: "risultati", icon: "trophy", tiers: [1, 5, 10], desc: (n) => (n === 1 ? "1 evento vinto." : `${n} eventi vinti.`), hint: "Punta al gradino più alto." },
  { key: "top8", name: "Top 8", group: "risultati", icon: "award", desc: "In top 8 in un evento da almeno 20 giocatori.", hint: "Fatti valere in un evento affollato." },
  { key: "podio", name: "Podio", group: "risultati", icon: "podium", tiers: [3, 10, 20], desc: (n) => `In top 8 in ${n} eventi da almeno 20 giocatori.`, hint: "Fatti strada negli eventi più affollati." },
  { key: "rimonta", name: "Rimonta", group: "risultati", icon: "trendingUp", desc: "In top 8 dopo aver perso il primo turno.", hint: "Non arrenderti dopo un brutto inizio." },
  // Leghe
  // (A single one since 2026-11-24, user: three leagues won was too hard a level II.)
  { key: "campione", name: "Campione", group: "leghe", icon: "crown", desc: "Una lega vinta.", hint: "Porta a casa una lega intera." },
  { key: "in_cima_lega", name: "In cima alla lega", group: "leghe", icon: "medal", desc: "Una lega chiusa tra i primi 8 della classifica.", hint: "Una lega da protagonista." },
  { key: "ammazzagiganti", name: "Ammazzagiganti", group: "leghe", icon: "target", desc: "Hai battuto chi guidava la classifica della lega.", hint: "Anche chi guida la lega può cadere." },
  { key: "presenza_completa", name: "Presenza completa", group: "leghe", icon: "circleCheck", desc: "Tutti gli eventi di una lega giocati.", hint: "Non perdere neanche una tappa." },
  { key: "veterano", name: "Veterano", group: "leghe", icon: "chevrons", tiers: [3, 6, 10], desc: (n) => `${n} leghe diverse giocate.`, hint: "Una lega dopo l'altra." },
  // Stile di gioco
  { key: "collezione", name: "Collezione", group: "stile", icon: "cards", tiers: [5, 10, 20], desc: (n) => `${n} comandanti diversi giocati.`, hint: "Prova comandanti diversi." },
  { key: "tuttofare", name: "Tuttofare", group: "stile", icon: "shapes", desc: "Tutti e 5 gli archetipi giocati.", hint: "Cambia stile di gioco." },
  { key: "specchio", name: "Specchio", group: "stile", icon: "mirror", desc: "Hai battuto il tuo stesso comandante.", hint: "Affronta te stesso." },
  { key: "incolore", name: "Incolore", group: "stile", icon: "diamond", desc: "Un evento giocato con un mazzo incolore.", hint: "Non serve un colore per vincere." },
  { key: "arcobaleno", name: "Arcobaleno", group: "stile", icon: "rainbow", desc: "Tutti e cinque i colori giocati.", hint: "Esplora tutti i colori." },
  { key: "fedele", name: "Fedele", group: "stile", icon: "heart", tiers: [5, 10, 20], desc: (n) => `Lo stesso comandante in ${n} eventi.`, hint: "Trova il tuo comandante e restagli fedele." },
  { key: "coppia", name: "Coppia affiatata", group: "stile", icon: "link", desc: "Un evento giocato con una coppia di comandanti.", hint: "In due è meglio." },
  { key: "pioniere", name: "Pioniere", group: "stile", icon: "flag", desc: "Il primo a portare un comandante agli eventi.", hint: "Porta qualcosa di nuovo al tavolo." },
  // Presenza
  { key: "debutto", name: "Debutto", group: "presenza", icon: "sparkles", desc: "Il tuo primo evento.", hint: "Ogni storia comincia da un evento." },
  { key: "presenze", name: "Presenze", group: "presenza", icon: "calendar", tiers: [10, 25, 50, 100], desc: (n) => `${n} eventi giocati.`, hint: "Partecipa agli eventi." },
  { key: "fedelissimo", name: "Fedelissimo", group: "presenza", icon: "flame", tiers: [3, 6, 12], desc: (n) => `Eventi giocati in ${n} mesi di fila.`, hint: "Fatti vedere con costanza." },
  { key: "maratoneta", name: "Maratoneta", group: "presenza", icon: "activity", desc: "100 partite giocate.", hint: "Tante, tante partite." },
  // Sul sito
  { key: "collegato", name: "Collegato", group: "sito", source: "site", icon: "userCheck", desc: "Account collegato al giocatore.", hint: "Il tuo account e il tuo giocatore, insieme." },
  { key: "carta_creata", name: "Carta creata", group: "sito", source: "site", icon: "idCard", desc: "Carta giocatore salvata.", hint: "La tua carta ti aspetta." },
  { key: "prima_decklist", name: "Prima decklist", group: "sito", source: "site", icon: "fileText", desc: "Una decklist inviata dal sito.", hint: "Condividi la tua lista." },
].map((a) => ({ source: "results", ...a }));

// The last one, on its own after the groups: every other one at its last level.
export const FINAL = { key: "seriamente", name: "Seriamente 1.0", source: "final", icon: "sealCheck", desc: "Tutti gli altri obiettivi al livello massimo.", hint: "Tutto, ma proprio tutto." };

export const ALL = [...ACHIEVEMENTS, FINAL];
export const BY_KEY = new Map(ALL.map((a) => [a.key, a]));

const ROMAN = ["I", "II", "III", "IV"];
export const roman = (level) => ROMAN[level - 1] ?? String(level);

const maxLevel = (a) => (a.tiers ? a.tiers.length : 1);

/**
 * One player's / account's state: key → { level, value, unlockedAt } for
 * every unlocked achievement (absent = locked), Seriamente 1.0 derived.
 * @param {Array<{key, level, value, unlocked_at}>} playerRows - player_achievements
 * @param {Array<{key, unlocked_at}>} siteRows - the account's site ones
 */
export function achievementState(playerRows = [], siteRows = []) {
  const state = new Map();
  for (const r of playerRows) {
    if (BY_KEY.get(r.key)?.source === "results") state.set(r.key, { level: r.level, value: r.value, unlockedAt: r.unlocked_at });
  }
  for (const r of siteRows) {
    if (BY_KEY.get(r.key)?.source === "site") state.set(r.key, { level: 1, value: null, unlockedAt: r.unlocked_at });
  }
  const done = ACHIEVEMENTS.every((a) => (state.get(a.key)?.level ?? 0) >= maxLevel(a));
  if (done) {
    const latest = [...state.values()].map((s) => String(s.unlockedAt)).sort().pop();
    state.set(FINAL.key, { level: 1, value: null, unlockedAt: latest });
  }
  return state;
}

// The name, with a tiered one's level as a roman numeral (`level` 0 for a
// locked one: its first level).
export function nameHtml(a, level, numeralClass = "ach-num") {
  return `${escapeHtml(a.name)}${a.tiers ? ` <span class="${numeralClass}">${roman(Math.max(1, level))}</span>` : ""}`;
}

const iconSvg = (a, strokeWidth = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[a.icon]}</svg>`;

// The colour: a tiered one's level, a single one the page's accent,
// Seriamente gold; locked grey.
function tone(a, level) {
  if (!level) return "is-locked";
  if (a.source === "final") return "is-final";
  return a.tiers ? `is-lv${level}` : "is-single";
}

// The unlock bar's medal (js/achievement-toast.js): the list's tinted disc,
// the icon in its level's colour (styles.css "Obiettivo sbloccato").
export function medalHtml(a, level, extraClass = "") {
  return `<span class="ach-medal ${tone(a, level)}${extraClass ? ` ${extraClass}` : ""}" aria-hidden="true">${iconSvg(a)}</span>`;
}

const descText = (a, level) => (typeof a.desc === "function" ? a.desc(a.tiers[level - 1]) : a.desc);

// A tiered one's progress toward its next level (null at its last level or
// locked — a locked one never shows its condition).
function nextLevel(a, st) {
  if (!a.tiers || !st || st.level >= a.tiers.length || st.value == null) return null;
  const to = a.tiers[st.level];
  return { level: st.level + 1, to, pct: Math.min(100, (st.value / to) * 100) };
}

const LOCK =
  '<svg class="ach-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

// The list's tinted disc: the icon in its level's colour (locked: faint,
// a small padlock).
const discHtml = (a, st) => `<span class="ach-disc" aria-hidden="true">${iconSvg(a)}${st ? "" : LOCK}</span>`;

// One medal of a group's grid: a button (its detail on tap) — the disc, the
// name, a tiered one's levels as dots.
function badgeHtml(a, st) {
  const pips = a.tiers
    ? `<span class="ach-pips" aria-hidden="true">${a.tiers.map((_, i) => `<i${st && i < st.level ? ' class="on"' : ""}></i>`).join("")}</span>`
    : "";
  return `<button type="button" class="ach-badge ${tone(a, st?.level ?? 0)}" data-key="${a.key}" aria-expanded="false">
      ${discHtml(a, st)}
      <span class="ach-name">${nameHtml(a, st?.level ?? 0)}</span>
      ${pips}
    </button>`;
}

// A medal's detail, inside its card under its row: unlocked — the
// description, the date, the progress toward the next level; locked — the
// hint only.
function detailHtml(a, st) {
  const next = nextLevel(a, st);
  const atMax = st && a.tiers && st.level >= maxLevel(a);
  const when = st ? `Sbloccato il ${formatDate(st.unlockedAt)}` : "Ancora da sbloccare";
  const progress = next
    ? `<span class="ach-detail-next"><i aria-hidden="true"><b style="width:${next.pct}%"></b></i><small>Verso ${roman(next.level)} · ${st.value}/${next.to}</small></span>`
    : "";
  return `<div class="ach-detail ${tone(a, st?.level ?? 0)}" role="region" aria-label="${escapeHtml(a.name)}"><div class="ach-detail-clip"><div class="ach-detail-inner">
      <b class="ach-detail-name">${nameHtml(a, st?.level ?? 0)}</b>
      <span class="ach-detail-text">${escapeHtml(st ? descText(a, st.level) : a.hint)}</span>
      <span class="ach-detail-when">${when}${atMax ? " · livello massimo" : ""}</span>
      ${progress}
    </div></div></div>`;
}

export const countUnlocked = (state) => ALL.filter((a) => state.has(a.key)).length;

// The whole list: the summary (the count, the percentage, a bar), each
// group as a card (its count; unlocked first), Seriamente 1.0 last on a
// card of its own. Every group for everyone (user, 2026-11-24): a player
// with no account tops out at 25 — "Sul sito" stays locked. The groups in
// two stacks (the 1st, 3rd, 5th… and the 2nd, 4th…): side by side when
// wide, each column on its own — a detail opening in one never moves the
// other's cards (styles.css .ach-groups); one column when narrow, the
// stacks dissolved and the groups back in their order.
export function achievementsListHtml(state) {
  const got = countUnlocked(state);
  const pct = Math.round((got / ALL.length) * 100);
  const summary = `
    <div class="ach-card ach-sum">
      <span class="ach-title">Obiettivi sbloccati</span>
      <div class="ach-sum-main">
        <div class="ach-sum-big"><b>${got}</b><span>/${ALL.length}</span></div>
        <div class="ach-sum-side"><b>${pct}%</b><span>completato</span></div>
      </div>
      <i class="ach-bar" aria-hidden="true"><b style="width:${pct}%"></b></i>
    </div>`;
  const groupHtml = (g, index) => {
    const list = ACHIEVEMENTS.filter((a) => a.group === g.id);
    const n = list.filter((a) => state.has(a.key)).length;
    const ordered = [...list.filter((a) => state.has(a.key)), ...list.filter((a) => !state.has(a.key))];
    return `<section class="ach-card ach-group" style="order: ${index}">
        <div class="ach-group-head"><h3 class="ach-title">${escapeHtml(g.name)}</h3><span class="ach-count">${n}/${list.length}</span></div>
        <div class="ach-grid">${ordered.map((a) => badgeHtml(a, state.get(a.key))).join("")}</div>
      </section>`;
  };
  const stack = (parity) =>
    `<div class="ach-stack">${GROUPS.map((g, i) => (i % 2 === parity ? groupHtml(g, i) : "")).join("")}</div>`;
  const groups = `<div class="ach-groups">${stack(0)}${stack(1)}</div>`;
  const fin = state.get(FINAL.key);
  const final = `
    <div class="ach-card ach-final ${tone(FINAL, fin ? 1 : 0)}">
      ${discHtml(FINAL, fin)}
      <div class="ach-final-text">
        <span class="ach-label">L'ultimo obiettivo</span>
        <b>${escapeHtml(FINAL.name)}</b>
        <span>${escapeHtml(fin ? FINAL.desc : FINAL.hint)}</span>
        ${fin ? `<small>Sbloccato il ${formatDate(fin.unlockedAt)}</small>` : ""}
      </div>
    </div>`;
  return `<div class="ach-list">${summary}${groups}${final}</div>`;
}

// The medals' details, on a list drawn by achievementsListHtml inside
// `container`: a tap on a medal opens its detail right under the row it's
// in (closing any other), a second tap closes it — both animated (it grows
// open and shrinks away; at once under reduced motion). One listener per
// container, whatever list it holds later (`state` kept on it).
export function enableAchievementDetails(container, state) {
  container.achievementState = state;
  if (container.dataset.achDetails) return;
  container.dataset.achDetails = "1";
  container.addEventListener("click", (e) => {
    const badge = e.target.closest(".ach-badge");
    if (!badge || !container.contains(badge)) return;
    const grid = badge.parentElement;
    const wasOpen = badge.getAttribute("aria-expanded") === "true";
    container.querySelectorAll(".ach-detail:not([data-closing])").forEach(closeDetail);
    container.querySelectorAll('.ach-badge[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (wasOpen) return;
    badge.setAttribute("aria-expanded", "true");
    const rowEnd = [...grid.querySelectorAll(".ach-badge")].filter((b) => b.offsetTop === badge.offsetTop).pop();
    const a = BY_KEY.get(badge.dataset.key);
    rowEnd.insertAdjacentHTML("afterend", detailHtml(a, container.achievementState.get(a.key)));
    const detail = rowEnd.nextElementSibling;
    void detail.offsetHeight;
    requestAnimationFrame(() => detail.classList.add("is-open"));
  });
}

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function closeDetail(detail) {
  detail.dataset.closing = "1";
  detail.classList.remove("is-open");
  if (reduceMotion()) return detail.remove();
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    detail.remove();
  };
  detail.addEventListener("transitionend", (e) => {
    if (e.target === detail && e.propertyName === "grid-template-rows") done();
  });
  setTimeout(done, 450);
}
