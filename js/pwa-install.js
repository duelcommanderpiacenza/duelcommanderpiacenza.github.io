// Registers the service worker (sw.js — also what makes the site
// installable), and invites visitors to install the app with a banner of
// our own instead of Chrome's (which can't be brought back once dismissed).
//
// When it shows — once per visit (a browser session), ~1.5s after the
// page's content is in (not while it loads), sliding up:
// * the first 3 visits, every time;
// * then at most once every 7 days;
// * never again after it's been closed ("Non ora") 3 times, nor once the
//   app is installed or the site is already open as the app.
//
// What it shows:
// * Chrome / Edge / Samsung (beforeinstallprompt): a card, "Installa"
//   opening the browser's own install window (cancelling it counts as a
//   "Non ora");
// * iPhone / iPad Safari (no install button there): a sheet with the two
//   steps, Condividi → Aggiungi alla schermata Home;
// * Android in an app's own browser (Instagram, Facebook, WhatsApp…, which
//   can't install): a sheet on opening it in Chrome and installing from the
//   menu.
// Anything else (a computer's Firefox / Safari): nothing.

const STATE_KEY = location.pathname.startsWith("/admin/") ? "pwaInstallAdmin" : "pwaInstall";
const SESSION_KEY = `${STATE_KEY}:shownThisVisit`;
const FREE_SHOWS = 3;
const MAX_DISMISSALS = 3;
const WAIT_DAYS = 7;
const DELAY_MS = 1500;

function readState() {
  try {
    return { shows: 0, dismissals: 0, lastShown: 0, installed: false, ...JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") };
  } catch {
    return null; // storage unavailable (private mode…) — don't ask at all
  }
}

function writeState(patch) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...patch }));
  } catch {
    // ignore
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function shouldShow() {
  const state = readState();
  if (!state || state.installed || isStandalone() || state.dismissals >= MAX_DISMISSALS) return false;
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
  } catch {
    return false;
  }
  if (state.shows < FREE_SHOWS) return true;
  return Date.now() - state.lastShown >= WAIT_DAYS * 86400000;
}

const ua = navigator.userAgent;
const isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isInAppBrowser = /Android/.test(ua) && /FBAN|FBAV|Instagram|WhatsApp|Line\/|Telegram|; wv\)/.test(ua);

const ICON = '<div class="pwa-install-icon" aria-hidden="true"><span></span></div>';
const SHARE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

let deferredPrompt = null;
let shown = false;
// The wait after loading is over: an install offer arriving later (Chrome
// sends it when it's ready) shows the card then.
let ready = false;

function close(el, { dismissed }) {
  if (dismissed) writeState({ dismissals: (readState()?.dismissals ?? 0) + 1 });
  el.classList.add("is-leaving");
  el.addEventListener("animationend", () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 400); // reduced motion: no animation to end
}

function markShown() {
  shown = true;
  writeState({ shows: (readState()?.shows ?? 0) + 1, lastShown: Date.now() });
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

// Chrome & co.: the card, "Installa" opening the browser's own window.
function showCard() {
  const desktop = !document.documentElement.classList.contains("nav-mobile");
  const el = document.createElement("div");
  el.className = "pwa-install-banner";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Installa l'app");
  el.innerHTML = `${ICON}
    <b class="pwa-install-title">Installa l'app</b>
    <span class="pwa-install-text">${desktop ? "Più veloce, in una finestra tutta sua." : "Più veloce, a schermo intero, anche senza connessione."}</span>
    <div class="pwa-install-actions">
      <button type="button" class="pwa-install-later">Non ora</button>
      <button type="button" class="pwa-install-go">Installa</button>
    </div>`;
  document.body.append(el);
  el.querySelector(".pwa-install-later").addEventListener("click", () => close(el, { dismissed: true }));
  el.querySelector(".pwa-install-go").addEventListener("click", async () => {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    close(el, { dismissed: false });
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice.catch(() => ({ outcome: "dismissed" }));
    if (outcome === "accepted") writeState({ installed: true });
    else writeState({ dismissals: (readState()?.dismissals ?? 0) + 1 });
  });
}

// iPhone / in-app browsers: the steps, in a sheet from the bottom.
function showSheet(kind) {
  const steps =
    kind === "ios"
      ? [`Tocca ${SHARE_ICON} <b>Condividi</b>`, "Scegli <b>Aggiungi alla schermata Home</b>"]
      : ["Apri il sito in <b>Chrome</b> (menu ⋮ → <b>Apri in Chrome</b>)", "Menu ⋮ → <b>Installa app</b> o <b>Aggiungi a schermata Home</b>"];
  const el = document.createElement("div");
  el.className = "pwa-install-sheet";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Installa l'app");
  el.innerHTML = `
    <div class="pwa-install-grab" aria-hidden="true"></div>
    <b class="pwa-install-title">Installa l'app</b>
    <p class="pwa-install-text">${kind === "ios" ? "Aggiungila alla schermata Home in due passaggi." : "Da Chrome si installa in due tocchi."}</p>
    <ol class="pwa-install-steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    <button type="button" class="pwa-install-later">Non ora</button>`;
  document.body.append(el);
  el.querySelector(".pwa-install-later").addEventListener("click", () => close(el, { dismissed: true }));
}

function show() {
  if (shown || !shouldShow()) return;
  if (deferredPrompt) {
    markShown();
    showCard();
  } else if (isIos) {
    markShown();
    showSheet("ios");
  } else if (isInAppBrowser) {
    markShown();
    showSheet("in-app");
  }
}

// Once the page's content is in (body.is-loading gone — js/page-loading.js),
// then a moment more.
function whenContentLoaded(fn) {
  const run = () => setTimeout(fn, DELAY_MS);
  if (!document.body.classList.contains("is-loading")) return run();
  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("is-loading")) return;
    observer.disconnect();
    run();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

// Root-relative rather than "sw.js" — this file is also loaded from
// admin/index.html, where a plain relative path would resolve to the
// (non-existent) admin/sw.js instead of the real one at the site root.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (ready) show();
});

window.addEventListener("appinstalled", () => writeState({ installed: true }));

// The old banner's "asked once, never again" flag: gone — those who closed
// it then get the new rules from the start.
try {
  localStorage.removeItem(location.pathname.startsWith("/admin/") ? "pwaInstallAskedAdmin" : "pwaInstallAsked");
} catch {
  // ignore
}

whenContentLoaded(() => {
  ready = true;
  show();
});
