// Thin, generic Supabase query helpers shared by the public pages and the
// admin CRUD app. Every function throws on error so callers can catch once.

import { sb } from "./supabase-client.js";

function assertOk({ data, error }) {
  if (error) throw error;
  return data;
}

// event_entries has two FKs to commanders (commander_id, partner_commander_id
// — an optional partner/background pairing), so PostgREST needs the
// constraint name on both embeds to know which is which.
const COMMANDER_EMBED =
  "commander:commanders!event_entries_commander_id_fkey(id,name,color_identity), partner_commander:commanders!event_entries_partner_commander_id_fkey(id,name,color_identity)";

export const Commanders = {
  list: () => sb.from("commanders").select("*").order("name").then(assertOk),
  get: (id) => sb.from("commanders").select("*").eq("id", id).single().then(assertOk),
  create: (row) => sb.from("commanders").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("commanders").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("commanders").delete().eq("id", id).then(assertOk),
};

export const Players = {
  list: () => sb.from("players").select("*").order("name").then(assertOk),
  get: (id) => sb.from("players").select("*").eq("id", id).single().then(assertOk),
  create: (row) => sb.from("players").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("players").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("players").delete().eq("id", id).then(assertOk),
};

export const Leagues = {
  // Newest-created first, so a just-added league/topdeck shows up front
  // rather than wherever it happens to fall alphabetically.
  list: () => sb.from("leagues").select("*").order("created_at", { ascending: false }).then(assertOk),
  get: (id) => sb.from("leagues").select("*").eq("id", id).single().then(assertOk),
  // The "current" league featured on the homepage: the most recently
  // created league that's still open. Returns null if none is open.
  // Topdeck series never power this — they have no points leaderboard.
  getOpen: () =>
    sb
      .from("leagues")
      .select("*")
      .eq("is_open", true)
      .eq("is_topdeck", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) throw error;
        return data?.[0] ?? null;
      }),
  create: (row) => sb.from("leagues").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("leagues").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("leagues").delete().eq("id", id).then(assertOk),
  // Only one league/topdeck can be open at a time — call before opening one
  // (flipping an existing row's is_open true) so it's the only one left open.
  closeOtherOpen: (exceptId) =>
    sb.from("leagues").update({ is_open: false }).eq("is_open", true).neq("id", exceptId).then(assertOk),
  // Same, for creating a brand new row — it doesn't exist yet to "except",
  // and a new league/topdeck defaults to open, so every other open row must
  // be closed *before* the insert (a plain insert would otherwise violate
  // leagues_only_one_open_idx the instant another row is still open).
  closeAllOpen: () => sb.from("leagues").update({ is_open: false }).eq("is_open", true).then(assertOk),
};

export const Events = {
  list: () =>
    sb
      .from("events")
      .select("*, league:leagues(id,name,is_open,is_topdeck)")
      .order("event_date", { ascending: false, nullsFirst: false })
      .then(assertOk),
  listByLeague: (leagueId) =>
    sb
      .from("events")
      .select("*, league:leagues(id,name)")
      .eq("league_id", leagueId)
      .order("event_date", { ascending: false, nullsFirst: false })
      .then(assertOk),
  get: (id) =>
    sb.from("events").select("*, league:leagues(id,name)").eq("id", id).single().then(assertOk),
  // Standalone events aren't part of any league (league_id is null).
  listStandalone: () =>
    sb
      .from("events")
      .select("*")
      .is("league_id", null)
      .order("event_date", { ascending: false, nullsFirst: false })
      .then(assertOk),
  create: (row) => sb.from("events").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("events").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("events").delete().eq("id", id).then(assertOk),
};

export const EventEntries = {
  listAll: () =>
    sb
      .from("event_entries")
      .select(`*, player:players(id,name,handle), ${COMMANDER_EMBED}`)
      .then(assertOk),
  listByEvent: (eventId) =>
    sb
      .from("event_entries")
      .select(`*, player:players(id,name,handle), ${COMMANDER_EMBED}`)
      .eq("event_id", eventId)
      .then(assertOk),
  listByPlayer: (playerId) =>
    sb
      .from("event_entries")
      .select(`*, event:events(id,name,event_date), ${COMMANDER_EMBED}`)
      .eq("player_id", playerId)
      .then(assertOk),
  // Entries where this commander appears in EITHER seat (primary or
  // partner) — a commander's own page should reflect every appearance.
  listByCommander: (commanderId) =>
    sb
      .from("event_entries")
      .select(`*, player:players(id,name,handle), ${COMMANDER_EMBED}`)
      .or(`commander_id.eq.${commanderId},partner_commander_id.eq.${commanderId}`)
      .then(assertOk),
  // Batch lookup across several events at once (e.g. every event a given
  // commander was played in), used to find each entrant's commander without
  // one request per event.
  listByEvents: (eventIds) =>
    sb
      .from("event_entries")
      .select(`*, player:players(id,name,handle), ${COMMANDER_EMBED}`)
      .in("event_id", eventIds)
      .then(assertOk),
  create: (row) => sb.from("event_entries").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("event_entries").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("event_entries").delete().eq("id", id).then(assertOk),
};

export const Matches = {
  listAll: () =>
    sb
      .from("matches")
      .select(
        "*, player1:players!matches_player1_id_fkey(id,name,handle), player2:players!matches_player2_id_fkey(id,name,handle)"
      )
      .then(assertOk),
  listByEvent: (eventId) =>
    sb
      .from("matches")
      .select(
        "*, player1:players!matches_player1_id_fkey(id,name,handle), player2:players!matches_player2_id_fkey(id,name,handle)"
      )
      .eq("event_id", eventId)
      .order("round")
      .order("created_at")
      .then(assertOk),
  // Batch lookup across several events at once (e.g. every event a given
  // commander was played in), with the event/league embedded so callers can
  // group or scope-filter without a per-event round trip.
  listByEvents: (eventIds) =>
    sb
      .from("matches")
      .select(
        "*, event:events(id,name,event_date,league_id,league:leagues(id,name)), player1:players!matches_player1_id_fkey(id,name,handle), player2:players!matches_player2_id_fkey(id,name,handle)"
      )
      .in("event_id", eventIds)
      .then(assertOk),
  listByPlayer: async (playerId) => {
    const [asP1, asP2] = await Promise.all([
      sb
        .from("matches")
        .select(
          "*, event:events(id,name,league_id,league:leagues(id,name)), player2:players!matches_player2_id_fkey(id,name,handle)"
        )
        .eq("player1_id", playerId)
        .then(assertOk),
      sb
        .from("matches")
        .select(
          "*, event:events(id,name,league_id,league:leagues(id,name)), player1:players!matches_player1_id_fkey(id,name,handle)"
        )
        .eq("player2_id", playerId)
        .then(assertOk),
    ]);
    return { asP1, asP2 };
  },
  create: (row) => sb.from("matches").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("matches").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("matches").delete().eq("id", id).then(assertOk),
};
