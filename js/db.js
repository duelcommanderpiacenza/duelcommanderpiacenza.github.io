// Thin, generic Supabase query helpers shared by the public pages and the
// admin CRUD app. Every function throws on error so callers can catch once.

import { sb } from "./supabase-client.js";

function assertOk({ data, error }) {
  if (error) throw error;
  return data;
}

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
  list: () => sb.from("leagues").select("*").order("name").then(assertOk),
  get: (id) => sb.from("leagues").select("*").eq("id", id).single().then(assertOk),
  // The "current" league featured on the homepage: the most recently
  // created league that's still open. Returns null if none is open.
  getOpen: () =>
    sb
      .from("leagues")
      .select("*")
      .eq("is_open", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) throw error;
        return data?.[0] ?? null;
      }),
  create: (row) => sb.from("leagues").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("leagues").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("leagues").delete().eq("id", id).then(assertOk),
};

export const Events = {
  list: () =>
    sb
      .from("events")
      .select("*, league:leagues(id,name,is_open)")
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
  create: (row) => sb.from("events").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("events").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("events").delete().eq("id", id).then(assertOk),
};

export const EventEntries = {
  listAll: () =>
    sb
      .from("event_entries")
      .select("*, player:players(id,name,handle), commander:commanders(id,name,color_identity)")
      .then(assertOk),
  listByEvent: (eventId) =>
    sb
      .from("event_entries")
      .select("*, player:players(id,name,handle), commander:commanders(id,name,color_identity)")
      .eq("event_id", eventId)
      .then(assertOk),
  listByPlayer: (playerId) =>
    sb
      .from("event_entries")
      .select("*, event:events(id,name,event_date), commander:commanders(id,name,color_identity)")
      .eq("player_id", playerId)
      .then(assertOk),
  listByCommander: (commanderId) =>
    sb
      .from("event_entries")
      .select("*, player:players(id,name,handle)")
      .eq("commander_id", commanderId)
      .then(assertOk),
  // Batch lookup across several events at once (e.g. every event a given
  // commander was played in), used to find each entrant's commander without
  // one request per event.
  listByEvents: (eventIds) =>
    sb
      .from("event_entries")
      .select("*, player:players(id,name,handle), commander:commanders(id,name,color_identity)")
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
