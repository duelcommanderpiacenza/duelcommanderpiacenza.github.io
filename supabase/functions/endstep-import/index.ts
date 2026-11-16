// endstep-import — reads an endstep.cc tournament for the admin's "Importa
// da endstep" (admin/js/endstep-import.js, an online event's link,
// events.endstep_url — migration 036).
//
// Supabase Edge Function (Deno). Deployed from the Supabase dashboard (Edge
// Functions → this code, name "endstep-import"), on both projects (dcp-dev
// and live). No secrets of its own: SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Why a function: endstep's API sends no CORS header for other sites, so
// the admin's browser can't read it directly. It only reads endstep's
// public, login-free endpoints (the ones its own pages use):
//   /api/public/v1/tournaments/event?id=<id>    entrants, rounds + pairings
//                                               (game scores), standings
//   /api/tournaments/public/<id>                which decks are published
//   /api/tournaments/public/<id>/entrants/<entrant>/deck   a deck's commanders
// and answers them reshaped (below) — it writes nothing: the admin saves
// what it accepts (replace_event_results, migration 038). Admin accounts
// only (the admins table), so it's no open proxy.
//
// Answer: { tournament: { id, name, status, rounds, startedAt, endedAt },
//   entrants: [{ entrantId, username, status, place, wins, losses, draws,
//     matchPoints, commanders: string[] | null }],   // null: no published deck
//   rounds: [{ round, pairings: [{ status, seats: [{ entrantId, gamesWon,
//     gamesDrawn, gamesLost }] }] }] }
// Errors (codes admin/js/endstep-import.js translates): not_signed_in,
// not_admin, bad_request, not_found, endstep_failed.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ENDSTEP = "https://endstep.cc";
// Deck requests at a time (one per published deck).
const DECK_CONCURRENCY = 6;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

class EndstepError extends Error {
  constructor(public status: number) {
    super(`endstep ${status}`);
  }
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${ENDSTEP}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "DuelCommanderPiacenza-import (duelcommanderpiacenza.github.io)" },
  });
  if (!res.ok) throw new EndstepError(res.status);
  return await res.json();
}

// `fn` over `items`, at most `limit` at a time, results in order.
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "bad_request" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Who's asking: an admin account only.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return reply(401, { error: "not_signed_in" });
  const { data: adminRow } = await admin.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return reply(403, { error: "not_admin" });

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "bad_request" });
  }
  // The tournament's id, from its link (…/tournaments/<id>) or alone.
  const id = typeof body.url === "string" ? body.url.match(UUID)?.[0] : undefined;
  if (!id) return reply(400, { error: "bad_request" });

  try {
    const [event, results] = await Promise.all([
      getJson(`/api/public/v1/tournaments/event?id=${id}`),
      // Public results (which decks are published): optional — without
      // them, no commanders.
      getJson(`/api/tournaments/public/${id}`).catch(() => null),
    ]);
    const t = event.tournament ?? {};
    const published = new Set(
      (results?.standings ?? []).filter((s: any) => s.deckPublished).map((s: any) => s.entrantId as string),
    );
    const standingOf = new Map((event.standings ?? []).map((s: any) => [s.entrantId, s]));
    const entrants = event.entrants ?? [];
    const decks = await mapLimited(entrants, DECK_CONCURRENCY, async (e: any) => {
      if (!published.has(e.id)) return null;
      try {
        const deck = await getJson(`/api/tournaments/public/${id}/entrants/${e.id}/deck`);
        return Array.isArray(deck.commanders) ? (deck.commanders as string[]) : null;
      } catch {
        return null;
      }
    });

    return reply(200, {
      tournament: {
        id: t.id ?? id,
        name: t.name ?? null,
        status: t.status ?? null,
        rounds: (event.rounds ?? []).length,
        startedAt: t.startedAt ?? null,
        endedAt: t.endedAt ?? null,
      },
      entrants: entrants.map((e: any, i: number) => {
        const s: any = standingOf.get(e.id) ?? {};
        return {
          entrantId: e.id,
          username: e.username,
          status: e.status,
          place: s.place ?? null,
          wins: s.wins ?? 0,
          losses: s.losses ?? 0,
          draws: s.draws ?? 0,
          matchPoints: s.matchPoints ?? 0,
          commanders: decks[i],
        };
      }),
      rounds: (event.rounds ?? []).map((r: any) => ({
        round: r.roundNumber,
        pairings: (r.pairings ?? []).map((p: any) => ({
          status: p.status,
          seats: (p.seats ?? []).map((s: any) => ({
            entrantId: s.entrantId,
            gamesWon: s.gamesWon ?? 0,
            gamesDrawn: s.gamesDrawn ?? 0,
            gamesLost: s.gamesLost ?? 0,
          })),
        })),
      })),
    });
  } catch (err) {
    if (err instanceof EndstepError && err.status === 404) return reply(404, { error: "not_found" });
    console.error(err);
    return reply(502, { error: "endstep_failed" });
  }
});
