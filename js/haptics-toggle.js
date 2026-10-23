// The vibration switch: a round button in the footer's left corner (in
// place of its empty .footer-spacer, mirroring the theme button on the
// right), only where vibration works (js/haptics.js hapticsSupported —
// Android phones). A tap turns it on / off, with a short buzz when turned
// on; its icon is a vibrating phone, struck through when off.
//
// Kept in this browser; signed in, also for the account (js/db.js
// UserSettings, migration 024) — the account's saved choice wins
// on sign-in, on any device, like the theme (js/theme.js). Not fatal if it
// can't be read or saved (024 not run yet): the switch still works here.

import { sb } from "./supabase-client.js";
import { UserSettings } from "./db.js";
import { firstReadSinceSignIn, forgetSynced } from "./theme.js";
import { haptic, hapticsSupported, hapticsEnabled, setHapticsEnabled } from "./haptics.js";

const PHONE =
  '<rect x="8" y="4" width="8" height="16" rx="1.5"></rect><path d="m3 8 1.5 2L3 12l1.5 2L3 16"></path><path d="m21 8-1.5 2 1.5 2-1.5 2 1.5 2"></path>';
const icon = (on) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PHONE}${
    on ? "" : '<path d="M3 3l18 18"></path>'
  }</svg>`;

export function setupHapticsToggle() {
  if (!hapticsSupported()) return;
  const spacer = document.querySelector("footer .footer-spacer");
  if (!spacer) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle haptics-toggle";
  spacer.replaceWith(button);

  let userId = null;

  function reflect() {
    const on = hapticsEnabled();
    button.innerHTML = icon(on);
    button.classList.toggle("is-off", !on);
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "Vibrazione attiva" : "Vibrazione spenta";
    button.setAttribute("aria-label", "Vibrazione");
  }

  button.addEventListener("click", () => {
    const on = !hapticsEnabled();
    setHapticsEnabled(on);
    reflect();
    if (on) haptic("confirm");
    if (userId) UserSettings.saveHaptics(userId, on).catch((err) => console.error(err));
  });

  // Signed in: the account's saved choice (if any) wins over this
  // browser's — read once per sign-in (firstReadSinceSignIn, js/theme.js): after that
  // this browser's copy is the choice (the button saves both), so a page
  // load asks nothing. Deferred: a Supabase call inside its own auth
  // callback can stall the client.
  sb.auth.onAuthStateChange((_event, session) => {
    const nextId = session?.user?.id ?? null;
    if (nextId === userId) return;
    const previousId = userId;
    userId = nextId;
    if (!userId) {
      if (previousId) forgetSynced("haptics", previousId);
      return;
    }
    if (!firstReadSinceSignIn("haptics", nextId)) return;
    setTimeout(() => {
      UserSettings.haptics(nextId)
        .then((saved) => {
          if (saved === null || saved === hapticsEnabled() || userId !== nextId) return;
          setHapticsEnabled(saved);
          reflect();
        })
        .catch((err) => {
          console.error(err);
          forgetSynced("haptics", nextId);
        });
    }, 0);
  });

  reflect();
}
