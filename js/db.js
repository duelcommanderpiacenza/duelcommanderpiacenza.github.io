// Thin, generic Supabase query helpers shared by the public pages and the
// admin CRUD app. Every function throws on error so callers can catch once.

import { sb } from "./supabase-client.js";

function assertOk({ data, error }) {
  if (error) throw error;
  return data;
}

// PostgREST (Supabase's API) returns at most 1000 rows per response by
// default, silently truncating the rest — fine for a single event's rows,
// not for a batch across many events. Pages through with .range() until a
// short page comes back. `buildQuery` must return a fresh, deterministically
// ordered query (a unique column last) so pages never overlap or skip rows.
const PAGE_SIZE = 1000;
async function selectAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = assertOk(await buildQuery().range(from, from + PAGE_SIZE - 1));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// Local calendar date, not `new Date().toISOString()` (UTC-based) — for a
// visitor east of UTC (e.g. Italy), toISOString() still reports yesterday's
// date for the first couple hours after local midnight, which let a
// same-day-or-earlier event keep passing an `event_date >= today` filter
// well past its own date. Same reasoning js/custom-date.js already avoids
// UTC-based date math for.
function todayLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// event_entries has two FKs to commanders (commander_id, partner_commander_id
// — an optional partner/background pairing), so PostgREST needs the
// constraint name on both embeds to know which is which.
const COMMANDER_EMBED =
  "commander:commanders!event_entries_commander_id_fkey(id,name,color_identity), partner_commander:commanders!event_entries_partner_commander_id_fkey(id,name,color_identity)";

export const Announcements = {
  // Newest first — the public Bacheca section just lists whatever's here,
  // top to bottom, with no separate pinning/ordering concept.
  list: () => sb.from("announcements").select("*").order("created_at", { ascending: false }).then(assertOk),
  // The public Bacheca's subset: no expiry, or an expiry date (expires_on)
  // that's today or later, local calendar date. Filtered here rather than
  // in the query so it keeps working even on a DB without that column yet
  // (a row lacking expires_on just counts as never expiring).
  listActive: async () => {
    const today = todayLocalIso();
    const rows = await Announcements.list();
    return rows.filter((a) => !a.expires_on || a.expires_on >= today);
  },
  create: (row) => sb.from("announcements").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("announcements").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("announcements").delete().eq("id", id).then(assertOk),
};

export const Commanders = {
  list: () => sb.from("commanders").select("*").order("name").then(assertOk),
  get: (id) => sb.from("commanders").select("*").eq("id", id).single().then(assertOk),
  create: (row) => sb.from("commanders").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("commanders").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("commanders").delete().eq("id", id).then(assertOk),
};

// players has two FKs to badges (badge1_id/badge2_id — the manually
// assigned slots), so PostgREST needs the constraint name on each embed to
// know which is which. Up to 2 more badges can show per player, from
// badges.auto_rule via the precomputed PlayerAutoBadges below rather than
// stored on this row.
const BADGE_EMBED =
  "badge1:badges!players_badge1_id_fkey(id,name,description,icon,icon_url,auto_rule), badge2:badges!players_badge2_id_fkey(id,name,description,icon,icon_url,auto_rule)";

export const Badges = {
  list: () => sb.from("badges").select("*").order("name").then(assertOk),
  get: (id) => sb.from("badges").select("*").eq("id", id).single().then(assertOk),
  create: (row) => sb.from("badges").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("badges").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("badges").delete().eq("id", id).then(assertOk),
};

// A badge's icon can be either a fixed emoji (badges.icon) or a custom
// uploaded image (badges.icon_url, a public URL into this bucket) — see
// admin/js/badges-admin.js. Kept as its own small object rather than folded
// into Badges since it talks to Supabase Storage, a different API surface
// than the table CRUD above.
const BADGE_ICON_BUCKET = "badge-icons";

export const BadgeIcons = {
  upload: async (file) => {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(BADGE_ICON_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    return sb.storage.from(BADGE_ICON_BUCKET).getPublicUrl(path).data.publicUrl;
  },
  // Best-effort cleanup when a badge's image is replaced or removed —
  // never blocks the caller if it fails (e.g. the URL isn't one of ours).
  remove: async (publicUrl) => {
    const marker = `/${BADGE_ICON_BUCKET}/`;
    const idx = publicUrl?.indexOf(marker) ?? -1;
    if (idx === -1) return;
    const path = publicUrl.slice(idx + marker.length);
    try {
      await sb.storage.from(BADGE_ICON_BUCKET).remove([path]);
    } catch {
      // ignore — an orphaned file in storage is harmless
    }
  },
};

export const Players = {
  list: () => sb.from("players").select(`*, ${BADGE_EMBED}`).order("name").then(assertOk),
  get: (id) => sb.from("players").select(`*, ${BADGE_EMBED}`).eq("id", id).single().then(assertOk),
  create: (row) => sb.from("players").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("players").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("players").delete().eq("id", id).then(assertOk),
};

// Player login (supabase/migrations/002_player_claims.sql): the account ↔
// player link (players.user_id, written only by the admin) and a signed-in
// user's own pending request to be linked (player_claims — RLS shows a user
// only their own; the admin sees all, hence the user_id filter).
export const PlayerClaims = {
  linkedPlayer: (userId) =>
    sb.from("players").select("id, name, handle").eq("user_id", userId).maybeSingle().then(assertOk),
  mine: (userId) =>
    sb
      .from("player_claims")
      .select("player_id, created_at, player:players(id, name, handle)")
      .eq("user_id", userId)
      .maybeSingle()
      .then(assertOk),
  // Players no account is linked to yet. One someone else has already
  // requested still shows up — request() then fails with player_requested.
  unlinkedPlayers: () => sb.from("players").select("id, name, handle").is("user_id", null).order("name").then(assertOk),
  // Errors come back with a code as their message (see the migration).
  request: (playerId) => sb.rpc("request_player_claim", { p_player_id: playerId }).then(assertOk),
  cancel: () => sb.rpc("cancel_player_claim").then(assertOk),
};

// A signed-in account's own profile (supabase/migrations/004_profiles.sql):
// one row per account, readable/writable only by its owner (and readable by
// the admin). fav_colors is a WUBRG-ordered string, '' for none.
const PROFILE_SELECT = "*, fav_commander:commanders(id, name, color_identity)";

export const Profiles = {
  mine: (userId) => sb.from("profiles").select(PROFILE_SELECT).eq("user_id", userId).maybeSingle().then(assertOk),
  save: (userId, fields) =>
    sb
      .from("profiles")
      .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() })
      .select(PROFILE_SELECT)
      .single()
      .then(assertOk),
};

// A player's card on their public page (player.html): the linked account's
// profile, through supabase/migrations/007's public_player_card() — null
// when there's none to show (not linked, never saved, hidden by its owner,
// blocked account).
export const PlayerCards = {
  get: (playerId) =>
    sb
      .rpc("public_player_card", { p_player_id: playerId })
      .then(assertOk)
      .then((rows) => rows?.[0] ?? null),
};

// Decklists sent by email (account.html): sentEvents() — the events a player
// already sent one for (supabase/migrations/008's decklist_submissions, the
// list itself is never stored); send() — the send-decklist Edge Function
// (supabase/functions/send-decklist), which checks and emails it. send()
// throws an Error whose message is the function's error code
// (already_sent, event_not_allowed, …).
export const Decklists = {
  sentEvents: (playerId) =>
    sb
      .from("decklist_submissions")
      .select("event_id, sent_at")
      .eq("player_id", playerId)
      .then(assertOk),
  send: async (eventId, decklist) => {
    const { error } = await sb.functions.invoke("send-decklist", { body: { event_id: eventId, decklist } });
    if (!error) return;
    // A refusal from the function itself carries its code in the JSON body.
    let code = "send_failed";
    try {
      code = (await error.context.json())?.error ?? code;
    } catch {
      // Not the function's answer (network, not deployed): the generic code.
    }
    throw new Error(code);
  },
};

// The players and commanders an account follows (supabase/migrations/010's
// follows — private, each account reads and writes only its own): the ★
// button on player.html / commander.html (js/follow-button.js) and
// account.html's "Seguiti" card. kind: "player" or "commander".
const followColumn = (kind) => (kind === "player" ? "player_id" : "commander_id");

export const Follows = {
  mine: (userId) =>
    sb
      .from("follows")
      .select("player_id, commander_id, created_at, player:players(id,name,handle), commander:commanders(id,name,color_identity)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(assertOk),
  isFollowing: (userId, kind, id) =>
    sb
      .from("follows")
      .select("created_at")
      .eq("user_id", userId)
      .eq(followColumn(kind), id)
      .maybeSingle()
      .then(assertOk)
      .then(Boolean),
  follow: (userId, kind, id) =>
    sb
      .from("follows")
      .insert({ user_id: userId, [followColumn(kind)]: id })
      .then(assertOk),
  unfollow: (userId, kind, id) =>
    sb.from("follows").delete().eq("user_id", userId).eq(followColumn(kind), id).then(assertOk),
  // For "Seguiti"'s players: every cached final standing of theirs (closed
  // events — the same win/draw/loss counting as the player page's winrate),
  // the latest picked in the page.
  playerResults: (playerIds) =>
    sb
      .from("event_standings")
      .select("player_id, position, wins, draws, losses, event:events!inner(id,name,event_date)")
      .in("player_id", playerIds)
      .then(assertOk),
  // …and its commanders: every closed event's entry with them (as commander
  // or partner) — who played it and where; the matches come separately
  // (fetchEventsResults), for a winrate counted like the commander page's.
  commanderAppearances: (commanderIds) =>
    sb
      .from("event_entries")
      .select("commander_id, partner_commander_id, player:players(id,name), event:events!inner(id,name,event_date,is_open)")
      .or(`commander_id.in.(${commanderIds.join(",")}),partner_commander_id.in.(${commanderIds.join(",")})`)
      .eq("event.is_open", false)
      .then(assertOk),
};

// The signed-in user's own login account (account.html's "Account" card).
// remove(): supabase/migrations/006's delete_my_account() — refused for an
// admin (admin_account); its profile and pending request go with it, its
// player is unlinked and kept.
export const MyAccount = {
  isAdmin: () => sb.rpc("is_admin").then(assertOk).then((data) => data === true),
  remove: () => sb.rpc("delete_my_account").then(assertOk),
};

// The admin's user management (supabase/migrations/003_admin_users.sql):
// login accounts live in Supabase Auth, out of the API's reach, so it's all
// admin-only database functions (each checks is_admin()). Errors come back
// with a code as their message (see the migration).
export const AdminUsers = {
  list: () => sb.rpc("admin_list_users").then(assertOk),
  approveClaim: (userId) => sb.rpc("admin_approve_claim", { p_user_id: userId }).then(assertOk),
  rejectClaim: (userId) => sb.rpc("admin_reject_claim", { p_user_id: userId }).then(assertOk),
  // playerId null = unlink.
  setPlayer: (userId, playerId) =>
    sb.rpc("admin_set_user_player", { p_user_id: userId, p_player_id: playerId }).then(assertOk),
  setBlocked: (userId, blocked) =>
    sb.rpc("admin_set_user_blocked", { p_user_id: userId, p_blocked: blocked }).then(assertOk),
  remove: (userId) => sb.rpc("admin_delete_user", { p_user_id: userId }).then(assertOk),
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
  // The homepage's fallback feature when no real league is open: the most
  // recently created Topdeck series that's still open. Returns null if none.
  getOpenTopdeck: () =>
    sb
      .from("leagues")
      .select("*")
      .eq("is_open", true)
      .eq("is_topdeck", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) throw error;
        return data?.[0] ?? null;
      }),
  create: (row) => sb.from("leagues").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("leagues").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("leagues").delete().eq("id", id).then(assertOk),
  // At most one league, and separately at most one Topdeck, is open at a
  // time (one of each together is fine) — call before opening one
  // (flipping an existing row's is_open true) so it's the only *other row
  // of that same kind* left open.
  closeOtherOpenOfType: (isTopdeck, exceptId) =>
    sb
      .from("leagues")
      .update({ is_open: false })
      .eq("is_open", true)
      .eq("is_topdeck", isTopdeck)
      .neq("id", exceptId)
      .then(assertOk),
  // Same, for creating a brand new row — it doesn't exist yet to "except",
  // and a new league/topdeck defaults to open, so every other open row of
  // that same kind must be closed *before* the insert (a plain insert would
  // otherwise violate leagues_only_one_open_idx the instant another row of
  // that kind is still open).
  closeAllOpenOfType: (isTopdeck) =>
    sb.from("leagues").update({ is_open: false }).eq("is_open", true).eq("is_topdeck", isTopdeck).then(assertOk),
  // Total events in a league, open and closed — including an open one RLS
  // hides from anonymous visitors (see league_event_count in
  // supabase/schema.sql). Falls back to `visibleCount` (the caller's own
  // Events.listByLeague length) if the function isn't available, e.g. not
  // yet created on this DB, rather than failing the whole page.
  eventCount: (id, visibleCount) =>
    sb.rpc("league_event_count", { p_league_id: id }).then(({ data, error }) => {
      if (error) {
        console.error(error);
        return visibleCount;
      }
      return data;
    }),
};

export const Events = {
  list: () =>
    sb
      .from("events")
      .select("*, league:leagues(id,name,is_open,is_topdeck)")
      .order("event_date", { ascending: false, nullsFirst: false })
      .then(assertOk),
  // The public Bacheca's "Prossimi eventi" card: soonest-first, across every
  // league/standalone, from today onward — only still-open events (a closed
  // one has already been played, however recent its date, so it belongs in
  // "Ultimi eventi" instead, not here).
  listUpcoming: () =>
    sb
      .from("events")
      .select("*, league:leagues(id,name,is_topdeck)")
      .eq("is_open", true)
      .gte("event_date", todayLocalIso())
      .order("event_date", { ascending: true })
      .then(assertOk),
  listByLeague: (leagueId) =>
    sb
      .from("events")
      .select("*, league:leagues(id,name,is_topdeck)")
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
  // Every entry of the whole history (matchups page, auto-badge rules) —
  // paged past the 1000-row cap, which a year of weekly events outgrows.
  listAll: () =>
    selectAllRows(() =>
      sb
        .from("event_entries")
        .select(`*, player:players(id,name,handle), ${COMMANDER_EMBED}`)
        .order("id")
    ),
  // Bacheca's "Più giocati" charts: just the primary commander and archetype
  // of every entry whose event falls on/after `sinceIso` (YYYY-MM-DD) —
  // filtered by the database (inner join on the event) rather than
  // downloading every entry ever and filtering in the browser, so the
  // payload stays the same size however long the club's history grows.
  listForChartsSince: (sinceIso) =>
    selectAllRows(() =>
      sb
        .from("event_entries")
        .select("id, archetype, commander:commanders!event_entries_commander_id_fkey(id,name), event:events!inner(event_date)")
        .gte("event.event_date", sinceIso)
        .order("id")
    ),
  listByEvent: (eventId) =>
    sb
      .from("event_entries")
      .select(`*, player:players(id,name,handle), ${COMMANDER_EMBED}`)
      .eq("event_id", eventId)
      .then(assertOk),
  listByPlayer: (playerId) =>
    sb
      .from("event_entries")
      .select(`*, event:events(id,name,event_date,is_open,league:leagues(id,name)), ${COMMANDER_EMBED}`)
      .eq("player_id", playerId)
      .then(assertOk),
  // Entries where this commander appears in EITHER seat (primary or
  // partner) — a commander's own page should reflect every appearance.
  listByCommander: (commanderId) =>
    sb
      .from("event_entries")
      .select(`*, player:players(id,name,handle), event:events(id,name,event_date,is_open), ${COMMANDER_EMBED}`)
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
  // Same as listByEvents, but paged past the row cap and deterministically
  // ordered — for fetchEventsResults below, which may span a whole league.
  listByEventsForStandings: (eventIds) =>
    selectAllRows(() =>
      sb
        .from("event_entries")
        .select(`*, player:players(id,name,handle), ${COMMANDER_EMBED}`)
        .in("event_id", eventIds)
        .order("id")
    ),
  create: (row) => sb.from("event_entries").insert(row).select().single().then(assertOk),
  update: (id, patch) => sb.from("event_entries").update(patch).eq("id", id).select().single().then(assertOk),
  remove: (id) => sb.from("event_entries").delete().eq("id", id).then(assertOk),
};

export const Matches = {
  // Every match of the whole history (matchups page, auto-badge rules) —
  // paged past the 1000-row cap, which ~5 months of weekly events outgrow.
  listAll: () =>
    selectAllRows(() =>
      sb
        .from("matches")
        .select(
          "*, player1:players!matches_player1_id_fkey(id,name,handle), player2:players!matches_player2_id_fkey(id,name,handle)"
        )
        .order("id")
    ),
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
  // Same rows and shape as listByEvent, for several events in one request
  // (paged past the row cap) — for fetchEventsResults below. Unlike
  // listByEvents, no event/league embed: callers already know the event.
  listByEventsForStandings: (eventIds) =>
    selectAllRows(() =>
      sb
        .from("matches")
        .select(
          "*, player1:players!matches_player1_id_fkey(id,name,handle), player2:players!matches_player2_id_fkey(id,name,handle)"
        )
        .in("event_id", eventIds)
        .order("round")
        .order("created_at")
        .order("id")
    ),
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
          "*, event:events(id,name,event_date,league_id,league:leagues(id,name)), player2:players!matches_player2_id_fkey(id,name,handle)"
        )
        .eq("player1_id", playerId)
        .then(assertOk),
      sb
        .from("matches")
        .select(
          "*, event:events(id,name,event_date,league_id,league:leagues(id,name)), player1:players!matches_player1_id_fkey(id,name,handle)"
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

const EVENT_IDS_PER_REQUEST = 100;

/**
 * Entries + matches for several events in two requests (rather than two per
 * event; two per 100 events for a very long list), grouped back per event in
 * `eventIds`' own order — the
 * `[{ entries, matches }, ...]` shape computeLeaguePoints/computeLeagueSummary
 * take. An event with no rows still gets its (empty) slot, so the array's
 * length always equals the number of events.
 * @param {string[]} eventIds
 */
export async function fetchEventsResults(eventIds) {
  if (eventIds.length === 0) return [];
  // The ids travel in the request URL (`event_id=in.(…)`, ~37 chars each):
  // a whole-history scope (Giocatori/Comandanti/Archetipi's "Tutte le
  // leghe") grows every week, so it's split into chunks well under common
  // URL length limits rather than one ever-longer request.
  const chunks = [];
  for (let i = 0; i < eventIds.length; i += EVENT_IDS_PER_REQUEST) chunks.push(eventIds.slice(i, i + EVENT_IDS_PER_REQUEST));
  const [entryChunks, matchChunks] = await Promise.all([
    Promise.all(chunks.map((ids) => EventEntries.listByEventsForStandings(ids))),
    Promise.all(chunks.map((ids) => Matches.listByEventsForStandings(ids))),
  ]);
  const entries = entryChunks.flat();
  const matches = matchChunks.flat();
  const groupByEvent = (rows) => {
    const byEvent = new Map();
    for (const row of rows) {
      if (!byEvent.has(row.event_id)) byEvent.set(row.event_id, []);
      byEvent.get(row.event_id).push(row);
    }
    return byEvent;
  };
  const entriesByEvent = groupByEvent(entries);
  const matchesByEvent = groupByEvent(matches);
  return eventIds.map((id) => ({ entries: entriesByEvent.get(id) ?? [], matches: matchesByEvent.get(id) ?? [] }));
}

// Precomputed auto-badge assignments (badges.auto_rule) — recomputed and
// fully replaced by admin/js/badges-sync.js whenever an event or league is
// closed (the only moments the underlying match/standings data actually
// changes), rather than live-computed on every page view. See that file
// and js/auto-badges.js for the "why" — this is just the storage.
export const PlayerAutoBadges = {
  // badge.priority is included so callers that need only a top-N subset
  // (js/players-page.js) can sort for it themselves — Postgres/PostgREST
  // don't guarantee row order without an explicit order() on the query,
  // and there's no direct column on this join table itself to order by.
  list: () =>
    sb.from("player_badges_auto").select("player_id, badge:badges(id,name,description,icon,icon_url,priority)").then(assertOk),
  listByPlayer: (playerId) =>
    sb
      .from("player_badges_auto")
      .select("badge:badges(id,name,description,icon,icon_url,priority)")
      .eq("player_id", playerId)
      .then(assertOk),
  // Full replace, not a diff — simplest correct way to keep this in sync
  // with computeAutoBadgeAssignments's own from-scratch recomputation, and
  // it only ever runs on the relatively rare "an event/league just closed"
  // event, not on every page load, so the extra round-trip doesn't matter.
  replaceAll: async (rows) => {
    // neq against an all-zero UUID (guaranteed to never be a real row's
    // id) rather than not(...,"is",null) — the more common/battle-tested
    // Supabase idiom for "delete every row", used here since PlayerAutoBadges
    // is a plain join table with no other single column to filter on.
    assertOk(await sb.from("player_badges_auto").delete().neq("player_id", "00000000-0000-0000-0000-000000000000"));
    if (rows.length === 0) return;
    assertOk(await sb.from("player_badges_auto").insert(rows));
  },
};

// Cached final standings of every closed event (supabase/schema.sql's
// event_standings) — recomputed and fully replaced by
// admin/js/badges-sync.js, read by player.html so a player's position in
// each event comes from their own few rows, not every attended event's full
// entries + matches.
export const EventStandings = {
  listByPlayer: (playerId) =>
    selectAllRows(() =>
      sb
        .from("event_standings")
        .select("event_id, position, points, wins, draws, losses")
        .eq("player_id", playerId)
        .order("event_id")
    ),
  // Full replace, like PlayerAutoBadges.replaceAll. Inserted in batches so
  // one request never carries the whole history (~20 rows per event).
  replaceAll: async (rows) => {
    assertOk(await sb.from("event_standings").delete().neq("player_id", "00000000-0000-0000-0000-000000000000"));
    for (let i = 0; i < rows.length; i += 500) {
      assertOk(await sb.from("event_standings").insert(rows.slice(i, i + 500)));
    }
  },
};
