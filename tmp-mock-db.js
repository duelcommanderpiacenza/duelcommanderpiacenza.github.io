// TEMPORARY — preview only (tmp-dfc-partner.html). Never commit; delete when done.
// The real js/db.js (loaded as "db.js?real", which the page's import map
// doesn't redirect), with the commander page's four lookups replaced by
// made-up data: a double-faced commander (Esika) played alone and with
// three partners, one of them double-faced too (Valki).

export * from "./js/db.js?real";
import * as real from "./js/db.js?real";

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const C = {
  main: { id: uid(1), name: "Esika, God of the Tree", color_identity: "G", is_banned: false },
  thrasios: { id: uid(2), name: "Thrasios, Triton Hero", color_identity: "GU" },
  tymna: { id: uid(3), name: "Tymna the Weaver", color_identity: "WB" },
  valki: { id: uid(4), name: "Valki, God of Lies", color_identity: "B" },
  opp1: { id: uid(5), name: "Atraxa, Grand Unifier", color_identity: "WUBG" },
  opp2: { id: uid(6), name: "Ertai Resurrected", color_identity: "UB" },
};
export const PREVIEW_COMMANDER_ID = C.main.id;

const P = ["Marco Rossi", "Luca Bianchi", "Giulia Verdi", "Paolo Neri"].map((name, i) => ({
  id: uid(100 + i),
  name,
  handle: null,
}));

const dates = ["2026-06-07", "2026-06-28", "2026-07-19", "2026-08-30", "2026-09-20", "2026-10-11"];
const EVENTS = dates.map((d, i) => ({
  id: uid(200 + i),
  name: `Evento di prova ${i + 1}`,
  event_date: d,
  is_open: false,
  league_id: null,
  league: null,
  rounds: 2,
}));

// Per event: the two Esika pilots' partners (null = alone).
const PAIRINGS = [
  [null, C.thrasios],
  [C.thrasios, C.tymna],
  [null, C.valki],
  [C.thrasios, null],
  [C.tymna, C.valki],
  [C.thrasios, null],
];

const ENTRIES = [];
const MATCHES = [];
EVENTS.forEach((ev, i) => {
  const evRef = { id: ev.id, name: ev.name, event_date: ev.event_date, is_open: false };
  const add = (player, commander, partner) =>
    ENTRIES.push({
      id: uid(300 + ENTRIES.length),
      event_id: ev.id,
      player_id: player.id,
      commander_id: commander.id,
      partner_commander_id: partner?.id ?? null,
      archetype: "midrange",
      player,
      commander,
      partner_commander: partner,
      event: evRef,
    });
  add(P[0], C.main, PAIRINGS[i][0]);
  add(P[1], C.main, PAIRINGS[i][1]);
  add(P[2], C.opp1, null);
  add(P[3], C.opp2, null);
  const match = (round, a, b, aw, bw) =>
    MATCHES.push({
      id: uid(500 + MATCHES.length),
      event_id: ev.id,
      round,
      player1_id: a.id,
      player2_id: b.id,
      player1_wins: aw,
      draws: 0,
      player2_wins: bw,
      is_drop: false,
      created_at: `${ev.event_date}T15:0${round}:00Z`,
      player1: a,
      player2: b,
      event: { id: ev.id, name: ev.name, event_date: ev.event_date, league_id: null, league: null },
    });
  match(1, P[0], P[2], i % 2 ? 2 : 1, i % 2 ? 0 : 2);
  match(1, P[1], P[3], 2, 1);
  match(2, P[0], P[1], 1, 2);
  match(2, P[2], P[3], 2, 0);
});

const ALL_COMMANDERS = Object.values(C);

export const Commanders = {
  ...real.Commanders,
  get: async (id) => {
    const c = ALL_COMMANDERS.find((x) => x.id === id);
    if (!c) throw new Error("preview: unknown commander");
    return { is_banned: false, ...c };
  },
};

export const EventEntries = {
  ...real.EventEntries,
  listByCommander: async (id) => ENTRIES.filter((e) => e.commander_id === id || e.partner_commander_id === id),
  listByEvents: async (ids) => ENTRIES.filter((e) => ids.includes(e.event_id)),
};

export const Matches = {
  ...real.Matches,
  listByEvents: async (ids) => MATCHES.filter((m) => ids.includes(m.event_id)).map((m) => ({ ...m })),
};

export const Events = {
  ...real.Events,
  list: async () => EVENTS,
};
