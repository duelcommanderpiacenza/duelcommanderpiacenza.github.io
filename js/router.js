// App-like navigation: one document, no page reloads between the pages that
// support it. The header, the nav (the mobile pill) and the footer stay in
// the document; only <main> is replaced — fetched from the target page's own
// .html (every route is still a real file, so deep links and reloads keep
// working on GitHub Pages). The swap slides like a native app screen: the
// whole screen moves, the header's controls (logo, search, profile picture)
// and the nav stay still on top (styles.css "Page transitions": forward
// from the right, back from the left; between nav tabs, by their order).
//
// A page takes part when its module exports `mount({ signal })` and its
// <main> carries data-page="<name>" (see PAGES below; the page's own
// <script type="module"> is then not in its HTML — this file mounts it, on
// first load and after every in-app navigation alike). `signal` aborts when
// the page is left: listeners on window/document and helpers that outlive
// <main> (back-to-top, tooltips, title fit, follow button) are tied to it.
// Links to pages not listed yet just load normally.

import { watchPageLoading } from "./page-loading.js";
import { enhanceSelects } from "./custom-select.js";
import { enhanceDateInputs } from "./custom-date.js";
import { clearHeroTone } from "./player-card.js";
import { refreshSystemBars } from "./system-bars.js";

// file → page: its module and its depth (0: a nav section's own page, 1: a
// detail page opened from one).
const PAGES = {
  "players.html": { name: "players", load: () => import("./players-page.js"), depth: 0 },
  "player.html": { name: "player", load: () => import("./player-detail.js"), depth: 1 },
  "commanders.html": { name: "commanders", load: () => import("./commanders-page.js"), depth: 0 },
  "commander.html": { name: "commander", load: () => import("./commander-detail.js"), depth: 1 },
  "index.html": { name: "home", load: () => import("./home.js"), depth: 0 },
  "events.html": { name: "events", load: () => import("./events-page.js"), depth: 0 },
  "league.html": { name: "league", load: () => import("./league-detail.js"), depth: 1 },
  "event.html": { name: "event", load: () => import("./event-detail.js"), depth: 1 },
  "archetypes.html": { name: "archetypes", load: () => import("./archetypes-page.js"), depth: 0 },
  "archetype.html": { name: "archetype", load: () => import("./archetype-detail.js"), depth: 1 },
  "badges.html": { name: "badges", load: () => import("./badges-page.js"), depth: 1 },
  "matchups.html": { name: "matchups", load: () => import("./matchups-page.js"), depth: 0 },
  "social.html": { name: "social", load: () => import("./moxfield.js"), depth: 0 },
  "account.html": { name: "account", load: () => import("./account-page.js"), depth: 0 },
  // Static text, no script of its own.
  "privacy.html": { name: "privacy", load: async () => ({ mount() {} }), depth: 0 },
};

const fileOf = (url) => url.pathname.split("/").pop() || "index.html";
const pageOf = (url) => PAGES[fileOf(url)] ?? null;

let current = null; // { url, page, controller }
let historyIdx = 0;
let navToken = 0;

// The target's HTML, fetched once and kept for the visit (prefetched on
// hover / touch down, so it's usually there by the time of the click).
const htmlCache = new Map();
function fetchPage(url) {
  const key = url.pathname + url.search;
  if (!htmlCache.has(key)) {
    htmlCache.set(
      key,
      fetch(url.href, { credentials: "same-origin" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
    );
    htmlCache.get(key).catch(() => htmlCache.delete(key));
  }
  return htmlCache.get(key);
}

// A link the router takes over: same origin, a supported page, a plain
// left click with nothing that asks for a new tab / download.
function routableLink(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target.closest?.("a[href]");
  if (!a || a.target || a.hasAttribute("download")) return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !pageOf(url)) return null;
  // Same page, only a different #hash: the browser's own jump.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null;
  return url;
}

// Mounts the page module on the <main> currently in the document.
async function mountCurrent(page, url) {
  const controller = new AbortController();
  current = { url, page, controller };
  const module = await page.load();
  if (current?.controller !== controller) return;
  module.mount({ signal: controller.signal });
}


// Leaves the current page for `url` (already a supported page). `restoreY`
// comes from a history back/forward.
async function go(url, { push = true, restoreY = null } = {}) {
  const token = ++navToken;
  const page = pageOf(url);
  let doc;
  try {
    doc = new DOMParser().parseFromString(await fetchPage(url), "text/html");
  } catch (err) {
    console.error(err);
    location.href = url.href; // Couldn't fetch: a normal load.
    return;
  }
  if (token !== navToken) return;
  const newMain = doc.querySelector("main");
  if (!newMain) {
    location.href = url.href;
    return;
  }

  // Leaving: the old page's listeners / helpers stop.
  current?.controller.abort();

  if (push) {
    history.replaceState({ ...history.state, idx: historyIdx, scrollY: window.scrollY }, "");
    historyIdx += 1;
    history.pushState({ idx: historyIdx, scrollY: 0 }, "", url.href);
  }

  const toNav = doc.body.dataset.activeNav;

  // What a page has between the nav and <main> (social.html's links strip):
  // the next page's own, or nothing — not left over from the page before.
  const between = (d) => {
    const els = [];
    for (let el = d.querySelector(".site-nav")?.nextElementSibling; el && el.tagName !== "MAIN"; el = el.nextElementSibling) {
      els.push(el);
    }
    return els;
  };

  const swap = () => {
    // The shell's overlays (nav panel, search, tooltip, theme menu) close —
    // here, once the old screen's snapshot is taken: they leave with it, in
    // the transition's fade, with no closing animation of their own over it.
    document.dispatchEvent(new CustomEvent("app:navigate"));
    between(document).forEach((el) => el.remove());
    const oldMain = document.querySelector("main");
    for (const el of between(doc)) oldMain.before(document.adoptNode(el));
    oldMain.replaceWith(document.adoptNode(newMain));
    document.title = doc.title;
    if (toNav) document.body.dataset.activeNav = toNav;
    const label = doc.querySelector(".nav-dropdown-label");
    const ownLabel = document.querySelector(".nav-dropdown-label");
    if (label && ownLabel) ownLabel.innerHTML = label.innerHTML;
    document.body.classList.toggle("is-loading", doc.body.classList.contains("is-loading"));
    // The header / nav keep a hero's colour only while a hero is there to
    // set it again (the next page's own applyHeroTone).
    clearHeroTone({
      header: !newMain.querySelector(".profile-hero-art"),
      nav: !newMain.hasAttribute("data-accent-from-hero"),
    });
    enhanceSelects(newMain);
    enhanceDateInputs(newMain);
    refreshSystemBars();
    window.scrollTo(0, 0);
  };

  // The slide (styles.css "Page transitions"): the header's controls and the
  // nav get their view-transition names (to stay still) only while it runs
  // (html.is-page-transition) — a name changes how an element stacks, not
  // wanted the rest of the time.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !reduceMotion) {
    const root = document.documentElement;
    root.classList.add("is-page-transition");
    const transition = document.startViewTransition(swap);
    transition.ready.catch(() => {});
    // (Swallowed: an interrupted transition rejects — not an error to report;
    // js/page-loading.js would show it as one.)
    transition.finished.catch(() => {}).then(() => root.classList.remove("is-page-transition"));
    await transition.updateCallbackDone.catch(() => {});
  } else {
    swap();
  }
  if (token !== navToken) return;

  watchPageLoading();
  await mountCurrent(page, url);

  // Back / forward: the scroll position the page had, once its content is
  // in (the splash gone).
  if (restoreY) whenLoaded(() => token === navToken && window.scrollTo(0, restoreY));
}

function whenLoaded(fn) {
  if (!document.body.classList.contains("is-loading")) return fn();
  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("is-loading")) return;
    observer.disconnect();
    fn();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

// JS-driven navigation (e.g. an archetype badge): in-app when the page is
// supported, a normal load otherwise.
export function navigate(href) {
  const url = new URL(href, location.href);
  if (url.origin === location.origin && pageOf(url)) go(url);
  else location.href = url.href;
}

function start() {
  history.scrollRestoration = "manual";
  history.replaceState({ ...history.state, idx: 0, scrollY: window.scrollY }, "");

  // This page itself, when supported: mounted here (its HTML has no page
  // script of its own).
  const url = new URL(location.href);
  const page = pageOf(url);
  if (page && document.querySelector(`main[data-page="${page.name}"]`)) mountCurrent(page, url);
  else current = null;

  document.addEventListener(
    "click",
    (e) => {
      const target = routableLink(e);
      if (!target) return;
      e.preventDefault();
      go(target);
    },
    false
  );

  // Prefetch on intent: hover (desktop) or the finger going down (touch).
  const prefetch = (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || a.target) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !pageOf(url)) return;
    fetchPage(url).catch(() => {});
    pageOf(url).load().catch(() => {});
  };
  document.addEventListener("pointerover", prefetch, { passive: true });
  document.addEventListener("touchstart", prefetch, { passive: true });

  window.addEventListener("popstate", (e) => {
    const url = new URL(location.href);
    if (!pageOf(url) || !current) {
      // A page that isn't in-app (or we came from a normal load): the
      // browser's own way.
      location.reload();
      return;
    }
    const idx = e.state?.idx ?? 0;
    historyIdx = idx;
    go(url, { push: false, restoreY: e.state?.scrollY ?? 0 });
  });
}

start();
