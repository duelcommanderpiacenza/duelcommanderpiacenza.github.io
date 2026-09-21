// Deliberately does no caching at all — this site's data (leagues, events,
// standings) comes live from Supabase and changes constantly, so serving a
// cached response here would show stale results. This exists purely to
// satisfy Chrome's PWA installability requirement (having a fetch handler),
// nothing more: every request just passes straight through to the network.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
