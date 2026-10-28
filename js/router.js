// App-like navigation: one document, no page reloads between the pages that
// support it. The header, the nav (the touch tab bar) and the footer stay in
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
// Kept per file, not per address: a page's HTML is the same whatever its
// ?id= (its module reads the id), so however long the session and however
// many players / events are opened, it's one copy per page at most.
// Always checked with the server (cache: "no-cache" — a quick 304 when
// unchanged), never the browser's own stored copy as it is: an old page's
// HTML with the new scripts (just after a deploy; locally, files edited)
// lacked elements the new module looks for — the page's "errore nel
// caricamento".
const htmlCache = new Map();
function fetchPage(url) {
  const key = url.pathname;
  if (!htmlCache.has(key)) {
    htmlCache.set(
      key,
      fetch(key, { credentials: "same-origin", cache: "no-cache" }).then((res) => {
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


// A short name for the page on screen, for the next page's back pill: a
// detail page's hero name (its own text — not the badges / banned icon in
// it; not while still "Caricamento..."), else the document title without
// the site's name ("Bacheca", "Leghe & Eventi", "Giocatori", …).
const TITLE_SUFFIX = " - Duel Commander Piacenza";
function currentPageLabel() {
  const nameEl = document.querySelector("main .profile-hero-name");
  const name = nameEl
    ? [...nameEl.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim()
    : "";
  if (name && !name.startsWith("Caricamento")) return name;
  return document.title.replace(TITLE_SUFFIX, "").trim();
}

// The heroes' back pill ("‹ Giocatori", …) leads to the page the visitor
// actually came from when they got here in the app (history.state.back,
// set by go() on the pushed entry — kept across reloads): its name on the
// pill, history.back() on click (the click listener below), so that page
// comes back with its scroll position. Landed here directly (a shared link,
// a new tab): the pill's own list page, as written in the HTML.
function syncBackButton() {
  const back = history.state?.back;
  const btn = document.querySelector("main .detail-hero-back");
  if (!btn) return;
  const hasBack = Boolean(back?.href && back.label);
  if (hasBack) {
    btn.href = back.href;
    btn.dataset.historyBack = "";
    btn.setAttribute("aria-label", `Torna a ${back.label}`);
  }
  // Its text in one label either way (landed here directly too: the page's
  // own "Leghe & Eventi") — loose in the pill, its words and the "&" were
  // separate flex items, each parted by the pill's icon gap.
  const text = hasBack ? back.label : btn.textContent.trim();
  const svg = btn.querySelector("svg");
  const label = document.createElement("span");
  label.className = "detail-hero-back-label";
  // Any "&" ("Leghe & Eventi") in the nav's own ampersand (styles.css .amp),
  // drawn as in the nav's tab: no spaces around it, only its own margin (the
  // tab is a flex box — its words and the "&" separate items, the spaces
  // between them dropped).
  text.split("&").forEach((part, i, parts) => {
    if (i) {
      const amp = document.createElement("span");
      amp.className = "amp";
      amp.textContent = "&";
      label.append(amp);
    }
    label.append(parts.length > 1 ? part.trim() : part);
  });
  btn.replaceChildren(...(svg ? [svg] : []), label);
}

// A computer (not html.app-header): the back pill in the top bar instead,
// in the logo's place before the tabs (styles.css "One top bar") — a copy
// at the start of the nav's row, replaced on every page (the click listener
// below handles it like the original); the hero's own one hidden there.
function syncBarBackButton() {
  document.querySelectorAll(".site-nav .detail-hero-back").forEach((el) => el.remove());
  if (document.documentElement.classList.contains("app-header")) return;
  const btn = document.querySelector("main .detail-hero-back");
  const row = document.querySelector(".site-nav-inner");
  if (btn && row) row.prepend(btn.cloneNode(true));
}

// Leaves the current page for `url` (already a supported page). `restoreY`
// comes from a history back/forward. `quiet`: the page redrawn with fresh
// data (js/data-updates.js) — see the quiet branch below.
async function go(url, { push = true, restoreY = null, quiet = false } = {}) {
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
    const back = { href: location.href, label: currentPageLabel() };
    history.replaceState({ ...history.state, idx: historyIdx, scrollY: window.scrollY }, "");
    historyIdx += 1;
    history.pushState({ idx: historyIdx, scrollY: 0, back }, "", url.href);
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
    // The new <main> in place, before the transition takes its picture
    // (its page module isn't mounted yet): for what must be right in that
    // very first frame — js/card-hints.js's loading placeholder.
    document.dispatchEvent(new CustomEvent("app:main-swapped"));
    document.title = doc.title;
    if (toNav) document.body.dataset.activeNav = toNav;
    document.body.classList.toggle("is-loading", doc.body.classList.contains("is-loading"));
    // The header / nav keep a hero's colour only while a hero is there to
    // set it again (the next page's own applyHeroTone).
    clearHeroTone({
      header: !newMain.querySelector(".profile-hero-art"),
      nav: !newMain.hasAttribute("data-accent-from-hero"),
    });
    enhanceSelects(newMain);
    enhanceDateInputs(newMain);
    syncBackButton();
    syncBarBackButton();
    refreshSystemBars();
    window.scrollTo(0, 0);
  };

  // Mounts the new page module (once): its loading splash watched, its data
  // fetched.
  let mounted = null;
  const mountNew = () => {
    if (!mounted) {
      watchPageLoading();
      mounted = mountCurrent(page, url);
    }
    return mounted;
  };

  // Back / forward: the scroll position the page had, once its content is
  // in (the splash gone) — then "app:scroll-restored", so the touch tab bar
  // (js/nav-dropdown.js) stays shown instead of reading the jump as
  // scrolling down.
  let scrollRestored = false;
  const restoreScroll = () => {
    if (!restoreY || scrollRestored || token !== navToken) return;
    scrollRestored = true;
    window.scrollTo(0, restoreY);
    document.dispatchEvent(new CustomEvent("app:scroll-restored"));
  };

  // A quiet redraw (fresh data for the page on screen): the old screen kept
  // frozen while the new one is mounted and its data drawn (from the cache
  // the service worker just refreshed — quick), then a short cross-fade —
  // no loading splash, no entrance animations or counting numbers again
  // (html.is-quiet-refresh, styles.css "Quiet redraw"; js/count-up.js), the
  // scroll where it was. QUIET_MAX_WAIT at most: the browser gives up on a
  // transition whose update takes too long.
  if (quiet && document.startViewTransition) {
    const root = document.documentElement;
    root.classList.add("is-quiet-refresh");
    const transition = document.startViewTransition(async () => {
      const deadline = performance.now() + QUIET_MAX_WAIT;
      const oldMain = document.querySelector("main");
      swap();
      carryPaintedArt(oldMain, newMain);
      await mountNew();
      await whenDrawn(newMain, deadline);
      if (restoreY) restoreScroll();
    });
    transition.ready.catch(() => {});
    transition.finished.catch(() => {}).then(() => root.classList.remove("is-quiet-refresh"));
    await transition.updateCallbackDone.catch(() => {});
    return;
  }

  // The slide (styles.css "Page transitions"): the header's controls and the
  // nav get their view-transition names (to stay still) only while it runs
  // (html.is-page-transition) — a name changes how an element stacks, not
  // wanted the rest of the time.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !reduceMotion) {
    const root = document.documentElement;
    root.classList.add("is-page-transition");
    // Neither page with a back pill (tab to tab): the logo stays as it is
    // (styles.css doesn't give it the bar-lead name, so no morph of the logo
    // into itself).
    const pill = (main) => Boolean(main?.querySelector(".detail-hero-back"));
    root.classList.toggle("is-bar-logo-stay", !pill(document.querySelector("main")) && !pill(newMain));
    const transition = document.startViewTransition(swap);
    transition.ready.catch(() => {});
    // (Swallowed: an interrupted transition rejects — not an error to report;
    // js/page-loading.js would show it as one.)
    transition.finished
      .catch(() => {})
      .then(() => root.classList.remove("is-page-transition", "is-bar-logo-stay"));
    await transition.updateCallbackDone.catch(() => {});
  } else {
    swap();
  }
  if (token !== navToken) return;

  await mountNew();

  if (restoreY) whenLoaded(restoreScroll);
}

// A quiet redraw's new screen is pictured once it's whole, not half-built
// (seen as a flash: the page, a bare version of it, the page again). The
// art already painted on the old screen (the hero's, the player card's —
// js/player-card.js createArtPainter) and the hero's colour are carried
// over to the same places in the new one: the painter skips an art already
// shown, so they don't start again from nothing and fade back in (a
// different art, or none, still replaces them).
const PAINTED = [".detail-hero-wrap", ".profile-hero", ".profile-hero-art", ".pc-art"];

function carryPaintedArt(oldMain, newMain) {
  const carry = (from, to) => {
    if (!from || !to) return;
    const style = from.getAttribute("style");
    if (style) to.setAttribute("style", style);
    if (from.dataset.url) to.dataset.url = from.dataset.url;
    for (const cls of ["is-loaded", "has-hero-accent"]) if (from.classList.contains(cls)) to.classList.add(cls);
  };
  carry(oldMain, newMain);
  for (const selector of PAINTED) {
    const to = newMain.querySelectorAll(selector);
    oldMain.querySelectorAll(selector).forEach((from, i) => carry(from, to[i]));
  }
}

// Resolves once `main` is drawn: its splash gone, no part still on its
// shimmering placeholder (.sk — the splash's own aside), the images in view
// decoded — or at `deadline` whatever its state.
function whenDrawn(main, deadline) {
  const drawn = () =>
    !document.body.classList.contains("is-loading") && !main.querySelector(".sk:not(.page-loading-overlay .sk)");
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => drawn() && finish());
    const timer = setTimeout(finish, Math.max(0, deadline - performance.now()));
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      const inView = [...main.querySelectorAll("img")].filter((img) => {
        const r = img.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
      });
      const left = Math.max(0, deadline - performance.now());
      Promise.race([
        Promise.allSettled(inView.map((img) => img.decode())),
        new Promise((r) => setTimeout(r, left)),
      ]).then(() => resolve());
    }
    if (drawn()) return finish();
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    observer.observe(main, { childList: true, subtree: true });
  });
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

// The page on screen loaded again in place (js/pull-refresh.js): its HTML
// swapped back in and its module mounted afresh — so its data fetched again
// — like an in-app navigation to itself, without a full reload; a normal
// reload for a page the router doesn't handle. Resolves once the new page
// is mounted (its data may still be loading: body.is-loading). keepScroll:
// back where it was once the content is in (js/data-updates.js's redraw);
// quiet: without the loading splash or the transition (go's quiet branch).
const QUIET_MAX_WAIT = 3000;

export async function refresh({ keepScroll = false, quiet = false } = {}) {
  const url = new URL(location.href);
  if (pageOf(url) && current) await go(url, { push: false, restoreY: keepScroll ? window.scrollY || null : null, quiet });
  else location.reload();
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
  syncBackButton();
  syncBarBackButton();

  document.addEventListener(
    "click",
    (e) => {
      // The back pill, when it leads to the page before: the browser's own
      // back (popstate below), not a new entry on top.
      const backBtn = e.target.closest?.(".detail-hero-back[data-history-back]");
      if (backBtn && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        history.back();
        return;
      }
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
