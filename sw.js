// Deliberately does no caching at all — this site's data (leagues, events,
// standings) comes live from Supabase and changes constantly, so serving a
// cached response here would show stale results. This exists purely to
// satisfy Chrome's PWA installability requirement (having a fetch handler),
// nothing more: every request just passes straight through to the network.
//
// Must stay at the site root, not in js/: a service worker only controls
// pages at or below its own folder, so from js/ it would control none of
// them (GitHub Pages can't send the Service-Worker-Allowed header that would
// allow more), and the site would stop being installable.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
