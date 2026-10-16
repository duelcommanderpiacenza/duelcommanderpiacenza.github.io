// The site's service worker. Scryfall's card images (cards.scryfall.io —
// the commander cards, the album, the hero and bubble art): their addresses carry a version (…jpg?1562…), so a given
// address never changes and a cached copy is never stale: cache first, the
// network only the first time. The site's own files: network first, kept
// as a fallback (SHELL_CACHE, below). The data — live from Supabase,
// changing constantly — passes straight through, never cached.
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

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== IMAGE_CACHE && name !== SHELL_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
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
