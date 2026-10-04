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
//
// Signed in, "Il tuo giocatore" shows one of: the player this account is
// linked to; its pending request to be linked (with "Annulla richiesta"); or
// a list of players no account has yet, to request one. Linking itself is
// the admin's (PLAYER_LOGIN.md, steps 2-3).
import { sb } from "./supabase-client.js";
import { PlayerClaims } from "./db.js";
import { escapeHtml } from "./ui.js";
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

// --- Il tuo giocatore -------------------------------------------------------

const claimBlocks = Array.from(document.querySelectorAll("[data-claim]"));
const claimMessageEl = document.querySelector("[data-claim-message]");
const claimSelect = document.getElementById("account-claim-player");
const linkedPlayerEl = document.getElementById("account-linked-player");
const pendingPlayerEl = document.getElementById("account-pending-player");

// The account whose state is on screen, so the frequent auth events (token
// refreshes, …) don't reload it every time.
let claimUserId = null;

// request_player_claim()'s error codes (supabase/migrations/002_player_claims.sql).
const CLAIM_ERROR_TEXT = {
  not_signed_in: "Sessione scaduta: accedi di nuovo e riprova.",
  already_linked: "Il tuo account è già collegato a un giocatore.",
  request_pending: "Hai già una richiesta in attesa.",
  player_not_found: "Giocatore non trovato: ricarica la pagina.",
  player_taken: "Questo giocatore è già collegato a un altro account.",
  player_requested: "Qualcun altro ha già chiesto questo giocatore. Se sei tu, contatta un amministratore.",
};

function playerLabel(player) {
  return player.handle ? `${player.name} (${player.handle})` : player.name;
}

function showClaim(state) {
  for (const block of claimBlocks) block.hidden = block.dataset.claim !== state;
}

function setClaimMessage(text, kind = "error") {
  claimMessageEl.textContent = text;
  claimMessageEl.className = "form-message" + (text ? ` is-${kind}` : "");
}

async function loadClaim(userId) {
  claimUserId = userId;
  showClaim("loading");
  try {
    const linked = await PlayerClaims.linkedPlayer(userId);
    if (linked) {
      linkedPlayerEl.textContent = playerLabel(linked);
      linkedPlayerEl.href = `player.html?id=${linked.id}`;
      showClaim("linked");
      return;
    }
    const pending = await PlayerClaims.mine(userId);
    if (pending) {
      pendingPlayerEl.textContent = playerLabel(pending.player);
      showClaim("pending");
      return;
    }
    const players = await PlayerClaims.unlinkedPlayers();
    claimSelect.innerHTML =
      '<option value="">Scegli il tuo nome&hellip;</option>' +
      players.map((p) => `<option value="${p.id}">${escapeHtml(playerLabel(p))}</option>`).join("");
    showClaim("none");
  } catch (err) {
    console.error(err);
    showClaim(null);
    setClaimMessage("Impossibile caricare il tuo giocatore, ricarica la pagina.");
  }
}

document.getElementById("account-claim-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setClaimMessage("");
  // Checked here, not with `required`: the native <select> is hidden behind
  // js/custom-select.js's skin, where the browser can't show its warning.
  if (!claimSelect.value) {
    setClaimMessage("Scegli il tuo nome dalla lista.");
    return;
  }
  try {
    await PlayerClaims.request(claimSelect.value);
  } catch (err) {
    console.error(err);
    setClaimMessage(CLAIM_ERROR_TEXT[err?.message] ?? "Richiesta non riuscita, riprova.");
    return;
  }
  await loadClaim(claimUserId);
  setClaimMessage("Richiesta inviata.", "ok");
});

document.getElementById("account-claim-cancel").addEventListener("click", async () => {
  setClaimMessage("");
  try {
    await PlayerClaims.cancel();
  } catch (err) {
    console.error(err);
    setClaimMessage("Annullamento non riuscito, riprova.");
    return;
  }
  await loadClaim(claimUserId);
  setClaimMessage("Richiesta annullata.", "ok");
});

// --- Account ------------------------------------------------------------------

function render(session) {
  if (session) {
    emailEl.textContent = session.user.email;
    show("signed-in");
    // Deferred: supabase-js freezes if another Supabase call is awaited
    // inside its own auth-change callback (render runs in one).
    if (session.user.id !== claimUserId) {
      claimUserId = session.user.id;
      setTimeout(() => loadClaim(session.user.id), 0);
    }
  } else {
    claimUserId = null;
    setClaimMessage("");
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
