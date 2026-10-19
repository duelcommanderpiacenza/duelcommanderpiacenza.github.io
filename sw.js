// The site's service worker. Scryfall's card images (cards.scryfall.io —
// the commander cards, the album, the hero and bubble art): their addresses carry a version (…jpg?1562…), so a given
// address never changes and a cached copy is never stale: cache first, the
// network only the first time. The site's own files: network first, kept
// as a fallback (SHELL_CACHE, below). The data from Supabase: the copy from
// the last visit shown at once, the fresh one fetched behind it (DATA_CACHE,
// below) — the page told when it changed (js/data-updates.js).
//
// Must stay at the site root, not in js/: a service worker only controls
// pages at or below its own folder, so from js/ it would control none of
// them (GitHub Pages can't send the Service-Worker-Allowed header that would
// allow more), and the site would stop being installable.

// Bump a version to drop that cache (activate deletes any other).
const IMAGE_CACHE = "scryfall-images-v1";
// The site's own files (pages, scripts, stylesheets, icons): network first,
// this copy only when the network fails — so the app still opens, and a
// page still loads its scripts, on a missing or flaky connection (the
// installed app reopened before the phone's connection is back). Never
// served first: with no build step to version the files, a stored copy
// served instead of the network could mix old and new scripts after a
// deploy. The browser's own HTTP cache (GitHub Pages: 10 minutes) is what
// makes repeat loads fast.
const SHELL_CACHE = "site-shell-v1";
// At most this many images (~50–150 KB each); the oldest go first.
const MAX_IMAGES = 300;
// Supabase's data (its REST reads, GET /rest/v1/…): stale-while-revalidate —
// the copy stored last time answers at once (no wait, and the page still
// fills in offline), the network's fresh copy replaces it behind; when it
// differs the page is told ("data-updated": it redraws, or offers to —
// js/data-updates.js), when the network fails it's told it's seeing the
// last visit's ("data-offline"). Stored per account (the signed-in user's
// id from the request's token; "anon" signed out — row-level security gives
// each different rows) and per Accept / Prefer header (a single row and a
// list of the same address differ). Never stored (ALWAYS_FRESH): the
// personal tables (always current, and nothing private kept on the device)
// and the announcements (the header's bell — outside the page a redraw
// redoes, so a new one must come in at once); nor functions (rpc), anything
// not a GET (writes, HEAD counts) or the admin's requests (it must always
// see the database as it is). A pull to refresh (js/pull-refresh.js, a
// "fresh-data" message) takes the network first for a few seconds.
const DATA_CACHE = "supabase-data-v1";
const MAX_DATA = 400;
const ALWAYS_FRESH = ["profiles", "user_settings", "follows", "decklist_submissions", "player_claims", "user_activity", "admins", "announcements"];
const FRESH_FOR = 5000;
const freshUntil = new Map(); // client id -> time

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== IMAGE_CACHE && name !== SHELL_CACHE && name !== DATA_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

// A pull to refresh: this page's data from the network for a moment.
self.addEventListener("message", (event) => {
  if (event.data?.type === "fresh-data" && event.source?.id) freshUntil.set(event.source.id, Date.now() + FRESH_FOR);
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "GET" && url.hostname === "cards.scryfall.io") {
    event.respondWith(cachedImage(event));
    return;
  }
  if (event.request.method === "GET" && url.origin === self.location.origin) {
    event.respondWith(networkFirst(event));
    return;
  }
  if (event.request.method === "GET" && url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.slice("/rest/v1/".length).split("/")[0];
    if (table !== "rpc" && !ALWAYS_FRESH.includes(table)) {
      event.respondWith(staleWhileRevalidate(event));
      return;
    }
  }
  event.respondWith(fetch(event.request));
});

// The site's own file from the network (its fresh copy stored for later);
// the stored copy only if that fails. Stored by path alone: a page's HTML
// is the same whatever its ?id= (one copy per page, not one per player).
async function networkFirst(event) {
  const cache = await caches.open(SHELL_CACHE);
  const url = new URL(event.request.url);
  const key = url.origin + url.pathname;
  try {
    const response = await fetch(event.request);
    if (response.ok && response.type === "basic") {
      event.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    }
    return response;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}

// Always fetched and stored as a CORS response, whatever the page asked
// for: the same image is loaded both plainly (an <img>, a CSS background)
// and with CORS (js/player-card.js reads the hero art's pixels for its
// colour). A CORS copy serves both; a plain (opaque) one would fail the CORS
// load — and the browser counts opaque entries as several MB each against
// the site's storage.
async function cachedImage(event) {
  const cache = await caches.open(IMAGE_CACHE);
  const key = event.request.url;
  const hit = await cache.match(key);
  if (hit) return hit;
  let response;
  try {
    response = await fetch(key, { mode: "cors", credentials: "omit" });
  } catch {
    // CORS refused or offline: the page's own request, as it asked.
    return fetch(event.request);
  }
  if (response.ok) {
    event.waitUntil(
      cache
        .put(key, response.clone())
        .then(() => trim(cache))
        .catch(() => {})
    );
  }
  return response;
}

// Keys come back oldest first (insertion order).
async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_IMAGES))) await cache.delete(request);
}

// --- Supabase data (DATA_CACHE, above) ---------------------------------------

async function staleWhileRevalidate(event) {
  const client = event.clientId ? await self.clients.get(event.clientId) : null;
  if (client && new URL(client.url).pathname.startsWith("/admin/")) return fetch(event.request);

  const cache = await caches.open(DATA_CACHE);
  const key = dataKey(event.request);
  // Just pulled to refresh: the network first, the stored copy only if it
  // fails.
  if ((freshUntil.get(event.clientId) ?? 0) > Date.now()) {
    try {
      const response = await fetch(event.request);
      if (response.ok) event.waitUntil(cache.put(key, response.clone()).then(() => trimData(cache)).catch(() => {}));
      return response;
    } catch (err) {
      const stored = await cache.match(key);
      if (stored) return stored;
      throw err;
    }
  }
  const hit = await cache.match(key);
  // Read before the page gets the stored copy (its body can be read once).
  const hitText = hit ? hit.clone().text() : null;
  const network = fetch(event.request).then(async (response) => {
    if (response.ok) {
      const fresh = response.clone();
      const changed = hitText ? (await hitText) !== (await response.clone().text()) : false;
      await cache.put(key, fresh);
      await trimData(cache);
      if (changed) client?.postMessage({ type: "data-updated" });
    }
    return response;
  });
  if (!hit) return network;
  event.waitUntil(network.catch(() => client?.postMessage({ type: "data-offline" })));
  return hit;
}

// The request's address plus who's asking (the account in its token) and
// what shape it wants back.
function dataKey(request) {
  const key = new URL(request.url);
  key.searchParams.set("__user", tokenUser(request.headers.get("Authorization")));
  key.searchParams.set("__accept", request.headers.get("Accept") ?? "");
  key.searchParams.set("__prefer", request.headers.get("Prefer") ?? "");
  return key.href;
}

function tokenUser(authorization) {
  try {
    const payload = authorization.split(" ")[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload));
    return claims.sub ?? claims.role ?? "anon";
  } catch {
    return "anon";
  }
}

async function trimData(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_DATA))) await cache.delete(request);
}
