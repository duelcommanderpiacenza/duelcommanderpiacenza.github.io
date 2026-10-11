// The round account button in every public page's header (#site-account,
// linking to account.html): a person icon when signed out, the Google
// profile picture once signed in (falling back to the icon if there's no
// picture, or it fails to load). Static markup like the rest of the header
// (see js/layout.js); this only follows the login state.
import { sb } from "./supabase-client.js";

const link = document.getElementById("site-account");

function render(session) {
  if (!link) return;
  link.querySelector(".site-account-avatar")?.remove();
  link.classList.toggle("is-signed-in", Boolean(session));
  const label = session ? `Il tuo profilo (${session.user.email})` : "Accedi";
  link.setAttribute("aria-label", label);
  link.title = label;

  const avatarUrl = session?.user?.user_metadata?.avatar_url;
  if (!avatarUrl) return;
  const img = document.createElement("img");
  img.className = "site-account-avatar";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.src = avatarUrl;
  img.addEventListener("error", () => img.remove());
  link.appendChild(img);
}

sb.auth.onAuthStateChange((_event, session) => {
  render(session);
  if (session) setTimeout(() => touchLastSeen(session.user.id), 0);
});

// Signed in: the account's last visit, for the admin's "Ultimo accesso"
// (supabase/migrations/020 touch_last_seen) — at most every
// LAST_SEEN_EVERY_MS per browser, not on every page. Deferred out of the
// auth callback (a Supabase call inside it can stall the client); never
// fatal (e.g. migration 020 not run yet).
const LAST_SEEN_EVERY_MS = 10 * 60 * 1000;

function touchLastSeen(userId) {
  const key = `lastSeen:${userId}`;
  try {
    if (Date.now() - Number(localStorage.getItem(key) || 0) < LAST_SEEN_EVERY_MS) return;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // No storage: still sent, just not throttled.
  }
  sb.rpc("touch_last_seen").then(({ error }) => {
    if (error) console.error(error);
  });
}
