// The site's language: Italian, or English (since 2026-10-30). The choice is
// kept in this browser (localStorage "lang": "en", nothing = Italian) and,
// signed in, for the account (js/db.js UserSettings.language, migration
// 033) — read once per sign-in like the theme (js/theme.js
// firstReadSinceSignIn), so a choice made on another device arrives at the
// next sign-in. Every page's inline head script (partials/theme.html) reads
// the browser's copy before the first paint: English sets <html lang="en">
// and loads js/i18n-en.js, which translates the page's text as it's put on
// screen (the site is written in Italian). Not on the admin, which stays
// Italian.
//
// Switching reloads the page: the translation is one way (Italian →
// English), and a fresh load is the simplest way back.
//
// Where it's chosen: the Profilo page's "Impostazioni" (js/settings-panel.js)
// and, on a computer, the footer's IT / EN switch (setupLanguageToggle,
// beside the theme button).

import { sb } from "./supabase-client.js";
import { UserSettings } from "./db.js";
import { firstReadSinceSignIn, forgetSynced } from "./theme.js";
import { currentLanguage } from "./locale.js";

const LANG_KEY = "lang";

export const LANGUAGES = [
  ["it", "Italiano"],
  ["en", "English"],
];

// The language on screen ("it" / "en") and its locale: js/locale.js.
export { currentLanguage, locale } from "./locale.js";

// The account signed in (null: none), for saving the choice to it.
let accountId = null;

function store(lang) {
  try {
    if (lang === "en") localStorage.setItem(LANG_KEY, "en");
    else localStorage.removeItem(LANG_KEY);
  } catch {
    // Private browsing / storage off: it lasts this page only.
  }
}

// A choice made (the settings, the footer's switch): kept in this browser
// and, signed in, for the account, then the page loads again in it.
export function chooseLanguage(lang) {
  if (lang === currentLanguage()) return;
  store(lang);
  const reload = () => location.reload();
  if (accountId) UserSettings.saveLanguage(accountId, lang).catch((err) => console.error(err)).finally(reload);
  else reload();
}

// The footer's IT / EN switch (a computer — touch screens hide the footer)
// and the account's saved language, read at sign-in: applied (a reload)
// when it differs from this browser's.
export function setupLanguage() {
  const toggle = document.getElementById("lang-toggle");
  if (toggle) {
    for (const btn of toggle.querySelectorAll("button[data-lang]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === currentLanguage()));
    }
    toggle.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-lang]");
      if (btn) chooseLanguage(btn.dataset.lang);
    });
  }

  sb.auth.onAuthStateChange((_event, session) => {
    const nextId = session?.user?.id ?? null;
    if (nextId === accountId) return;
    const previousId = accountId;
    accountId = nextId;
    if (!nextId) {
      if (previousId) forgetSynced("language", previousId);
      return;
    }
    if (!firstReadSinceSignIn("language", nextId)) return;
    // Deferred: a Supabase call made inside its own auth callback can stall
    // the client.
    setTimeout(() => {
      UserSettings.language(nextId)
        .then((saved) => {
          if (!saved || saved === currentLanguage() || accountId !== nextId) return;
          store(saved);
          location.reload();
        })
        .catch((err) => {
          console.error(err);
          forgetSynced("language", nextId);
        });
    }, 0);
  });
}
