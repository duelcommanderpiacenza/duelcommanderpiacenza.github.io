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
// Supabase's data (its REST reads, GET /rest/v1/…): the network asked first,
// but waited for only NETWORK_WAIT — answered in time, the page gets the
// fresh copy (stored for next time) and nothing needs redrawing; slower,
// the copy stored last time answers (and the page still fills in offline),
// the network's fresh copy replacing it behind: when that differs the page
// is told ("data-updated": it redraws, or offers to — js/data-updates.js),
// when the network fails it's told it's seeing the last visit's
// ("data-offline"). Stored per account (the signed-in user's
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
const NETWORK_WAIT = 800;
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
  const url = new URL(event.request.url);
  const key = url.origin + url.pathname;
  try {
    const response = await fetch(event.request);
    if (response.ok && response.type === "basic") queueShellCopy(event, key, response.clone());
    return response;
  } catch (err) {
    const hit = await (await caches.open(SHELL_CACHE)).match(key);
    if (hit) return hit;
    throw err;
  }
}

// The site's files' fresh copies stored a few seconds after the page
// settles, not while it loads (a page asks for all its scripts at once —
// the modulepreload lists — so the copies otherwise all queue up in the
// cache alongside the page's own data reads), and an unchanged file (the
// same ETag / Last-Modified as the stored copy) isn't written again at all
// — not every file rewritten on every page load.
const pendingShellCopies = new Map(); // key -> response
let shellCopiesFlush = null;

function queueShellCopy(event, key, response) {
  pendingShellCopies.set(key, response);
  if (!shellCopiesFlush) {
    shellCopiesFlush = new Promise((resolve) =>
      setTimeout(async () => {
        const copies = [...pendingShellCopies];
        pendingShellCopies.clear();
        shellCopiesFlush = null;
        try {
          const cache = await caches.open(SHELL_CACHE);
          for (const [copyKey, copy] of copies) {
            const stored = await cache.match(copyKey);
            if (stored && sameVersion(stored, copy)) continue;
            await cache.put(copyKey, copy);
          }
        } catch {
          // Storage full or unavailable: the next load tries again.
        }
        resolve();
      }, 3000)
    );
  }
  event.waitUntil(shellCopiesFlush);
}

function sameVersion(a, b) {
  const etag = a.headers.get("ETag");
  if (etag) return etag === b.headers.get("ETag");
  const modified = a.headers.get("Last-Modified");
  return Boolean(modified) && modified === b.headers.get("Last-Modified") && a.headers.get("Content-Length") === b.headers.get("Content-Length");
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
        .then(() => scheduleTrim(IMAGE_CACHE, MAX_IMAGES))
        .catch(() => {})
    );
  }
  return response;
}

// A cache cut back to its `max` newest entries — keys come back oldest first
// (insertion order). At most once every couple of seconds per cache, not
// after every response: a page loading dozens of images (the album, the
// bubble charts) or several data requests at once would otherwise list the
// whole cache once per response, all at the same time.
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(request);
}

const trimTimers = new Map(); // cache name -> pending timer
function scheduleTrim(name, max) {
  if (trimTimers.has(name)) return;
  trimTimers.set(
    name,
    setTimeout(() => {
      trimTimers.delete(name);
      caches
        .open(name)
        .then((cache) => trim(cache, max))
        .catch(() => {});
    }, 2000)
  );
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
      if (response.ok) event.waitUntil(cache.put(key, response.clone()).then(() => scheduleTrim(DATA_CACHE, MAX_DATA)).catch(() => {}));
      return response;
    } catch (err) {
      const stored = await cache.match(key);
      if (stored) return stored;
      throw err;
    }
  }
  const hit = await cache.match(key);
  // The page got the network's own answer (in time): nothing to tell it.
  let servedFresh = false;
  // Read before the page gets the stored copy (its body can be read once).
  const hitText = hit ? hit.clone().text() : null;
  // The network's answer goes to the page as soon as it arrives (no stored
  // copy) — storing it, comparing it with the stored one and trimming come
  // after, kept alive by this promise (registered now, while the page's
  // answer is still pending: waitUntil can't be called once it's settled).
  let stored;
  event.waitUntil(new Promise((resolve) => (stored = resolve)));
  const network = fetch(event.request).then(
    (response) => {
      if (response.ok) {
        const fresh = response.clone();
        const compare = hitText ? response.clone().text() : null;
        (async () => {
          const changed = compare ? (await hitText) !== (await compare) : false;
          await cache.put(key, fresh);
          scheduleTrim(DATA_CACHE, MAX_DATA);
          if (changed && !servedFresh) client?.postMessage({ type: "data-updated" });
        })()
          .catch(() => {})
          .finally(stored);
      } else {
        stored();
      }
      return response;
    },
    (err) => {
      if (hit) client?.postMessage({ type: "data-offline" });
      stored();
      throw err;
    }
  );
  if (!hit) return network;
  network.catch(() => {});
  // A stored copy: the network's answer if it comes within NETWORK_WAIT (and
  // is good), else the stored one now.
  const inTime = await Promise.race([
    network.then(
      (response) => (response.ok ? response : null),
      () => null
    ),
    new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_WAIT)),
  ]);
  if (inTime) {
    servedFresh = true;
    return inTime;
  }
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
