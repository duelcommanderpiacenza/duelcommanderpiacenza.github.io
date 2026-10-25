// Dark mode. The actual theme is applied as early as possible by a tiny
// inline script in every page's <head> (before first paint, reading
// localStorage — "light" / "dark", nothing = follow the device — so there's
// no flash of the wrong theme on navigation); this module wires up the
// footer's round theme button. Shared by both js/layout.js (public pages)
// and admin/js/app.js (admin has no nav, so doesn't load layout.js at all).
// On touch screens the footer is hidden and the choice is made in the
// Profilo page's "Impostazioni" instead (js/settings-panel.js: themeMode /
// chooseTheme).
//
// Signed out, the button just switches light ↔ dark (kept in this browser).
// Signed in, it opens a small menu — Chiaro / Scuro / Segui il sistema — and
// the choice is remembered for the account too (js/db.js UserSettings,
// migration 019), applied on any device it signs in on. The
// button shows the current choice as a line icon: sun, moon, or a screen.

import { sb } from "./supabase-client.js";
import { UserSettings } from "./db.js";

const THEME_KEY = "theme";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const THEME_ICONS = {
  light: svg(
    '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>'
  ),
  dark: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>'),
  system: svg(
    '<rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>'
  ),
};
const ICONS = THEME_ICONS;
const CHECK = svg('<path d="M20 6 9 17l-5-5"></path>');

const MODES = [
  ["light", "Chiaro"],
  ["dark", "Scuro"],
  ["system", "Segui il sistema"],
];
const MODE_LABEL = { light: "chiaro", dark: "scuro", system: "segue il sistema" };

// The choice kept in this browser: "light", "dark", or "system" (nothing
// stored).
function storedMode() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

// The account signed in (null: none), for saving the choice to it.
let accountId = null;

// The current choice ("light", "dark" or "system").
export const themeMode = storedMode;

// A choice made (the footer's menu, the settings): applied, kept in
// this browser and, signed in, for the account; "theme:change" tells the
// other controls showing it. `byTap`: chosen by a tap (the colours fade
// across — switchTheme).
export function chooseTheme(mode, byTap = false) {
  switchTheme(mode, byTap);
  if (accountId) UserSettings.saveTheme(accountId, mode).catch((err) => console.error(err));
}

// A choice made by a tap (`byTap`): when it changes what's on screen, the
// old colours fade into the new ones — a view transition of the whole
// screen (styles.css "Theme switch"). Where the browser has no view
// transitions, with reduced motion, or with nothing to change: at once.
function switchTheme(mode, byTap) {
  const root = document.documentElement;
  const next = mode === "system" ? (darkQuery.matches ? "dark" : "light") : mode;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!byTap || !document.startViewTransition || reduceMotion || next === root.dataset.theme) return applyMode(mode);
  root.classList.add("is-theme-transition");
  document
    .startViewTransition(() => applyMode(mode))
    .finished.finally(() => root.classList.remove("is-theme-transition"));
}

function applyMode(mode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Private browsing / storage disabled — the theme just won't persist.
  }
  document.documentElement.dataset.theme = mode === "system" ? (darkQuery.matches ? "dark" : "light") : mode;
  document.dispatchEvent(new Event("theme:change"));
}

// An account's saved settings (user_settings: the theme, the vibration) are
// read once per sign-in, not on every page load: true the first time for
// `name` and that account (marked in localStorage "settingsRead:<name>:<user
// id>"), false after — this browser's copy is the setting from then on, the
// buttons saving both. Signing out (or a failed read) forgets it, so the
// next sign-in reads the account's again (a choice made on another device
// arrives then).
const settingsReadKey = (name, userId) => `settingsRead:${name}:${userId}`;

export function firstReadSinceSignIn(name, userId) {
  try {
    if (localStorage.getItem(settingsReadKey(name, userId))) return false;
    localStorage.setItem(settingsReadKey(name, userId), "1");
  } catch {
    // Storage off: read every time, as before.
  }
  return true;
}

export function forgetSynced(name, userId) {
  try {
    localStorage.removeItem(settingsReadKey(name, userId));
  } catch {
    // Storage off: nothing kept.
  }
}

export function setupThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  let userId = null;
  let menu = null;

  function reflect() {
    const mode = storedMode();
    toggle.innerHTML = ICONS[mode];
    if (userId) {
      toggle.setAttribute("aria-haspopup", "menu");
      toggle.removeAttribute("aria-pressed");
      toggle.title = `Tema: ${MODE_LABEL[mode]}`;
    } else {
      toggle.removeAttribute("aria-haspopup");
      const dark = document.documentElement.dataset.theme === "dark";
      toggle.setAttribute("aria-pressed", String(dark));
      toggle.title = dark ? "Passa al tema chiaro" : "Passa al tema scuro";
    }
    toggle.setAttribute("aria-label", toggle.title);
  }

  // --- The signed-in menu (above the button, right-aligned with it) ---
  function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", closeMenu, true);
    window.removeEventListener("resize", closeMenu);
  }

  function onOutside(e) {
    if (!menu?.contains(e.target) && !toggle.contains(e.target)) closeMenu();
  }

  // In-app navigation (js/router.js): the menu closes.
  document.addEventListener("app:navigate", () => closeMenu());

  function onKey(e) {
    if (e.key !== "Escape") return;
    closeMenu();
    toggle.focus();
  }

  function openMenu() {
    const current = storedMode();
    menu = document.createElement("div");
    menu.className = "theme-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Tema");
    menu.innerHTML = MODES.map(
      ([mode, label]) => `
      <button type="button" class="theme-menu-option${mode === current ? " is-current" : ""}" role="menuitemradio" aria-checked="${mode === current}" data-mode="${mode}">
        ${ICONS[mode]}<span>${label}</span><span class="theme-menu-check">${CHECK}</span>
      </button>`
    ).join("");
    document.body.appendChild(menu);
    const rect = toggle.getBoundingClientRect();
    menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    toggle.setAttribute("aria-expanded", "true");

    menu.addEventListener("click", (e) => {
      const option = e.target.closest(".theme-menu-option");
      if (!option) return;
      chooseTheme(option.dataset.mode, true);
      closeMenu();
      toggle.focus();
    });
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    menu.querySelector(".is-current")?.focus();
  }

  toggle.addEventListener("click", () => {
    if (userId) {
      if (menu) closeMenu();
      else openMenu();
      return;
    }
    switchTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  });

  // Every change, wherever it's made (this button, the settings, the
  // account's saved choice), shown on the button.
  document.addEventListener("theme:change", reflect);

  // Following the device: its own switch between light and dark applies
  // right away, not only on the next page load.
  darkQuery.addEventListener("change", () => {
    if (storedMode() !== "system") return;
    applyMode("system");
  });

  // Signed in: the button becomes the menu, and the account's saved choice
  // (if any) wins over this browser's — applied as soon as it's read. Read
  // once per sign-in (firstReadSinceSignIn): after that this browser's copy is the
  // choice — the menu saves both — so a page load asks nothing. Not fatal if
  // it can't be read (e.g. migration 019 not run yet): the menu still
  // works, just for this browser.
  sb.auth.onAuthStateChange((_event, session) => {
    const nextId = session?.user?.id ?? null;
    if (nextId === userId) return;
    const previousId = userId;
    userId = nextId;
    accountId = nextId;
    closeMenu();
    reflect();
    if (!userId) {
      if (previousId) forgetSynced("theme", previousId);
      return;
    }
    if (!firstReadSinceSignIn("theme", nextId)) return;
    // Deferred: a Supabase call made inside its own auth callback can stall
    // the client.
    setTimeout(() => {
      UserSettings.theme(nextId)
        .then((saved) => {
          if (!saved || saved === storedMode() || userId !== nextId) return;
          applyMode(saved);
        })
        .catch((err) => {
          console.error(err);
          forgetSynced("theme", nextId);
        });
    }, 0);
  });

  reflect();
}
