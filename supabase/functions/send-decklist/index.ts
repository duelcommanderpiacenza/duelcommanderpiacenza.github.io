// send-decklist — emails a player's decklist for an event to the organisers
// (account.html's "Invia la tua decklist", js/account-page.js).
//
// Supabase Edge Function (Deno). Deployed from the Supabase dashboard (Edge
// Functions → this code, name "send-decklist"); its secrets, set there too:
//   RESEND_API_KEY  the Resend API key (resend.com, "Sending access")
//   DECKLIST_TO     where the decklists go — Resend's free plan without an
//                   own domain only delivers to the Resend account's address
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Checks everything itself, never the browser's word: a signed-in account,
// not blocked, linked to a player; an event that is upcoming (open, today
// or later) or closed with that player in it; no list sent yet by this
// player for it (supabase/migrations/008's decklist_submissions — the only
// thing kept: *that* it was sent, never the list). The subject is built here
// from the database: "<Event name> - <dd/mm/yyyy> - <Player name>"; the
// email's Reply-To is the account's email.
//
// Errors are codes js/account-page.js translates: not_signed_in, blocked,
// bad_request, empty, too_long, not_linked, event_not_found,
// event_not_allowed, already_sent, send_failed, not_configured.
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_LENGTH = 10000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Today in Piacenza, as YYYY-MM-DD (event dates are local calendar dates).
function todayInItaly(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

function italianDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "bad_request" });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("DECKLIST_TO");
  if (!resendKey || !to) return reply(500, { error: "not_configured" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Who's asking: the account behind the request's access token.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return reply(401, { error: "not_signed_in" });
  if (user.banned_until && new Date(user.banned_until) > new Date()) return reply(403, { error: "blocked" });

  let body: { event_id?: unknown; decklist?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "bad_request" });
  }
  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  const decklist = typeof body.decklist === "string" ? body.decklist.trim() : "";
  if (!eventId || !decklist) return reply(400, { error: "empty" });
  if (decklist.length > MAX_LENGTH) return reply(400, { error: "too_long" });

  const { data: player } = await admin
    .from("players")
    .select("id, name, handle")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!player) return reply(403, { error: "not_linked" });

  const { data: event } = await admin
    .from("events")
    .select("id, name, event_date, is_open, league:leagues(name)")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return reply(404, { error: "event_not_found" });

  // Upcoming (open, today or later), or closed with this player in it.
  let allowed = event.is_open && event.event_date >= todayInItaly();
  if (!event.is_open) {
    const { count } = await admin
      .from("event_entries")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("player_id", player.id);
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) return reply(403, { error: "event_not_allowed" });

  // The one send for this player and event is claimed first — the primary
  // key settles two sends at the same instant — then the email goes out; if
  // that fails, the claim is given back so the player can retry.
  const { error: claimError } = await admin
    .from("decklist_submissions")
    .insert({ player_id: player.id, event_id: eventId, user_id: user.id });
  if (claimError) {
    if (claimError.code === "23505") return reply(409, { error: "already_sent" });
    console.error("claim", claimError);
    return reply(500, { error: "send_failed" });
  }

  const league = Array.isArray(event.league) ? event.league[0] : event.league;
  const eventName = event.name || league?.name || "Evento";
  const playerName = player.handle ? `${player.name} (${player.handle})` : player.name;
  const subject = `${eventName} - ${italianDate(event.event_date)} - ${playerName}`;
  const text = `${decklist}\n\n—\nInviata da ${playerName} (${user.email}) dal sito Duel Commander Piacenza.`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Duel Commander Piacenza <onboarding@resend.dev>",
      to: [to],
      reply_to: user.email,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    console.error("resend", res.status, await res.text());
    await admin.from("decklist_submissions").delete().eq("player_id", player.id).eq("event_id", eventId);
    return reply(502, { error: "send_failed" });
  }

  return reply(200, { ok: true, event_id: eventId });
});
