// account.html: a player's own account — sign in with Google (the first
// sign-in creates the account), sign out. One card, one section shown at a
// time ([data-view] in account.html), driven by Supabase's auth events.
//
// Google only, no email/password for players: Google has already verified
// the address, so Supabase never has to send a confirmation or password-reset
// email (its built-in sender only reaches the project team, a few per hour).
// The admin keeps its own email/password login in /admin/.
//
// The button sends the whole page to Google, which comes back to this same
// page (ACCOUNT_URL — must be allowed in Supabase's Authentication > URL
// Configuration, see PLAYER_LOGIN.md step 1); supabase-js reads the session
// from that address by itself and reports it as SIGNED_IN.
import { sb } from "./supabase-client.js";
import { hidePageLoading } from "./page-loading.js";

const ACCOUNT_URL = new URL("account.html", window.location.href).href;

const sections = Array.from(document.querySelectorAll("[data-view]"));
const emailEl = document.getElementById("account-email");

function show(view) {
  for (const section of sections) {
    section.hidden = section.dataset.view !== view;
    // A message from a previous visit to a section shouldn't linger.
    if (section.hidden) setMessage(section, "");
  }
}

function setMessage(section, text, kind = "error") {
  const el = section.querySelector("[data-message]");
  el.textContent = text;
  el.className = "form-message" + (text ? ` is-${kind}` : "");
}

function sectionOf(view) {
  return sections.find((s) => s.dataset.view === view);
}

// A sign-in that failed or was cancelled on Google's side comes back with
// the error in the address (query or fragment) instead of a session.
function returnedError() {
  const params = [window.location.search, window.location.hash.replace(/^#/, "?")].map((s) => new URLSearchParams(s));
  return params.some((p) => p.has("error") || p.has("error_code"));
}

function render(session) {
  if (session) {
    emailEl.textContent = session.user.email;
    show("signed-in");
  } else {
    show("login");
  }
}

let firstRender = true;
sb.auth.onAuthStateChange((_event, session) => {
  render(session);
  if (!firstRender) return;
  firstRender = false;
  if (!session && returnedError()) {
    setMessage(sectionOf("login"), "Accesso con Google non riuscito o annullato: riprova.");
  }
  hidePageLoading();
});

document.getElementById("account-google").addEventListener("click", async () => {
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: ACCOUNT_URL },
  });
  // On success the page is already on its way to Google.
  if (error) {
    console.error(error);
    setMessage(sectionOf("login"), "Impossibile avviare l'accesso con Google, riprova.");
  }
});

document.getElementById("account-logout").addEventListener("click", async () => {
  const { error } = await sb.auth.signOut();
  if (error) {
    console.error(error);
    setMessage(sectionOf("signed-in"), "Uscita non riuscita, riprova.");
  }
  // The SIGNED_OUT event switches back to the login view.
});
