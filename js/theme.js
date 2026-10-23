// Dark mode. The actual theme is applied as early as possible by a tiny
// inline script in every page's <head> (before first paint, reading
// localStorage — "light" / "dark", nothing = follow the device — so there's
// no flash of the wrong theme on navigation); this module wires up the
// footer's round theme button. Shared by both js/layout.js (public pages)
// and admin/js/app.js (admin has no nav, so doesn't load layout.js at all).
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

const ICONS = {
  light: svg(
    '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>'
  ),
  dark: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>'),
  system: svg(
    '<rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>'
  ),
};
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

function applyMode(mode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Private browsing / storage disabled — the theme just won't persist.
  }
  document.documentElement.dataset.theme = mode === "system" ? (darkQuery.matches ? "dark" : "light") : mode;
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
      const mode = option.dataset.mode;
      applyMode(mode);
      reflect();
      closeMenu();
      toggle.focus();
      if (userId) UserSettings.saveTheme(userId, mode).catch((err) => console.error(err));
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
    applyMode(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    reflect();
  });

  // Following the device: its own switch between light and dark applies
  // right away, not only on the next page load.
  darkQuery.addEventListener("change", () => {
    if (storedMode() !== "system") return;
    applyMode("system");
    reflect();
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
          reflect();
        })
        .catch((err) => {
          console.error(err);
          forgetSynced("theme", nextId);
        });
    }, 0);
  });

  reflect();
}
