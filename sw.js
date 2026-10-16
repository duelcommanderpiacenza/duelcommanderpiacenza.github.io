// The site's service worker. It caches one thing only: Scryfall's card
// images (cards.scryfall.io — the commander cards, the album, the hero and
// bubble art). Their addresses carry a version (…jpg?1562…), so a given
// address never changes and a cached copy is never stale: cache first, the
// network only the first time. Everything else — the pages, the scripts and
// above all the data, which comes live from Supabase and changes constantly
// — passes straight through to the network, never cached.
//
// Must stay at the site root, not in js/: a service worker only controls
// pages at or below its own folder, so from js/ it would control none of
// them (GitHub Pages can't send the Service-Worker-Allowed header that would
// allow more), and the site would stop being installable.

// Bump the version to drop every cached image (activate deletes any other).
const IMAGE_CACHE = "scryfall-images-v1";
// At most this many images (~50–150 KB each); the oldest go first.
const MAX_IMAGES = 300;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== IMAGE_CACHE) await caches.delete(name);
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
  event.respondWith(fetch(event.request));
});

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
