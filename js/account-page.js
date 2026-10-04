// account.html — "Profilo": a signed-in account's own profile page, laid out
// like a profile on other sites. Signed out: an "Accedi con Google" card
// (the first sign-in creates the account). Signed in, top to bottom:
//  - "Il tuo giocatore", only while the account isn't linked to a player:
//    the list of players not linked yet to request one, or the pending
//    request (with "Annulla richiesta") — linking itself is the admin's
//    (PLAYER_LOGIN.md). At the top, to invite a new account to do it first;
//  - a profile header: cover, the Google picture as avatar, name and email,
//    the description as a bio, and the favourite colors / commander /
//    archetype and the linked player as facts;
//  - "Modifica profilo" opens the edit card (supabase/migrations/004_profiles.sql:
//    one row per account, only its owner writes it);
//  - "Le tue statistiche", once linked: the player page's own winrate tiles
//    over the whole history, most played commander, best placement, and a
//    link to the player page;
//  - "Account": the Google email it's signed in with, and "Esci".
//
// Google only for players, no email/password: Supabase never has to send a
// confirmation or reset email (its built-in sender only reaches the project
// team). Google comes back to this page (ACCOUNT_URL, allowed in Supabase's
// Authentication > URL Configuration) and supabase-js reports SIGNED_IN.
//
// The page stays behind its loading splash until everything a signed-in
// view shows has loaded, so it all fades in together, already filled.
import { sb } from "./supabase-client.js";
import { Commanders, PlayerClaims, Profiles, EventEntries, Matches, EventStandings } from "./db.js";
import { matchRoundOutcome, isDrop } from "./leaderboard.js";
import { tallyOutcome, renderWinrateTiles } from "./winrate.js";
import { escapeHtml, colorIdentityPips, commanderLabel, commanderPairLabel, archetypeBadge } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

const ACCOUNT_URL = new URL("account.html", window.location.href).href;
const COLOR_ORDER = ["W", "U", "B", "R", "G"];
const DESCRIPTION_MAX = 500;

const views = Array.from(document.querySelectorAll("[data-view]"));
const viewOf = (name) => views.find((v) => v.dataset.view === name);

// Header
const avatarImg = document.getElementById("profile-avatar");
const initialEl = document.getElementById("profile-initial");
const nameEl = document.getElementById("profile-name");
const emailEl = document.getElementById("account-email");
const bioEl = document.getElementById("profile-bio");
const factPlayerEl = document.getElementById("profile-fact-player");
const factColorsEl = document.getElementById("profile-fact-colors");
const factCommanderEl = document.getElementById("profile-fact-commander");
const factArchetypeEl = document.getElementById("profile-fact-archetype");
const editToggleBtn = document.getElementById("profile-edit-toggle");

// Edit card
const editCard = document.getElementById("profile-edit");
const profileForm = document.getElementById("profile-form");
const colorInputs = Array.from(profileForm.querySelectorAll('input[name="profile-color"]'));
const commanderSelect = document.getElementById("profile-commander");
const archetypeInputs = Array.from(profileForm.querySelectorAll('input[name="profile-archetype"]'));
const descriptionEl = document.getElementById("profile-description");
const counterEl = document.getElementById("profile-counter");
const profileMessageEl = document.getElementById("profile-message");

// "Il tuo giocatore" (top, until linked)
const claimCard = document.getElementById("profile-claim");
const claimBlocks = Array.from(document.querySelectorAll("[data-claim]"));
const claimMessageEl = document.querySelector("[data-claim-message]");
const claimSelect = document.getElementById("account-claim-player");
const pendingPlayerEl = document.getElementById("account-pending-player");

// "Le tue statistiche" (once linked)
const statsCard = document.getElementById("profile-stats");
const statsLink = document.getElementById("profile-stats-link");
const statsTilesEl = document.getElementById("profile-stats-tiles");
const statsCommanderEl = document.getElementById("profile-stats-commander");
const statsBestEl = document.getElementById("profile-stats-best");

// What's on screen: the account, its saved profile, its player link/request.
let user = null;
let profile = null;
let claim = { linked: null, pending: null };

// --- Helpers ------------------------------------------------------------------

function setMessage(el, text, kind = "error") {
  el.textContent = text;
  el.className = "form-message" + (text ? ` is-${kind}` : "");
}

function show(view) {
  for (const v of views) v.hidden = v.dataset.view !== view;
}

function playerLabel(player) {
  return player.handle ? `${player.name} (${player.handle})` : player.name;
}

// Displayed as a placeholder wherever a fact isn't set.
const EMPTY = '<span class="profile-empty">—</span>';

// --- Profile header -------------------------------------------------------------

function renderHeader() {
  const meta = user.user_metadata ?? {};
  const displayName = meta.full_name || meta.name || user.email;
  nameEl.textContent = displayName;
  emailEl.textContent = user.email;

  initialEl.textContent = (displayName.trim()[0] ?? "?").toUpperCase();
  if (meta.avatar_url) {
    avatarImg.src = meta.avatar_url;
    avatarImg.hidden = false;
  } else {
    avatarImg.hidden = true;
  }

  const description = profile?.description?.trim();
  bioEl.textContent = description || "Nessuna descrizione: raccontaci qualcosa di te con «Modifica profilo».";
  bioEl.classList.toggle("is-empty", !description);

  if (claim.linked) {
    factPlayerEl.innerHTML = `<a href="player.html?id=${claim.linked.id}">${escapeHtml(playerLabel(claim.linked))}</a>`;
  } else if (claim.pending) {
    factPlayerEl.innerHTML = `${escapeHtml(playerLabel(claim.pending.player))} <span class="profile-pending">in attesa</span>`;
  } else {
    factPlayerEl.innerHTML = EMPTY;
  }

  factColorsEl.innerHTML = profile?.fav_colors ? colorIdentityPips(profile.fav_colors) : EMPTY;
  factCommanderEl.innerHTML = profile?.fav_commander ? commanderLabel(profile.fav_commander) : EMPTY;
  factArchetypeEl.innerHTML = profile?.fav_archetype ? archetypeBadge(profile.fav_archetype) : EMPTY;
}

// --- Edit card ---------------------------------------------------------------------

function updateCounter() {
  counterEl.textContent = `${descriptionEl.value.length}/${DESCRIPTION_MAX}`;
}

// Puts the saved profile into the form (also how "Annulla" discards edits).
function fillForm() {
  const colors = profile?.fav_colors ?? "";
  for (const input of colorInputs) input.checked = colors.includes(input.value);
  commanderSelect.value = profile?.fav_commander_id ?? "";
  const archetype = profile?.fav_archetype ?? "";
  for (const input of archetypeInputs) input.checked = input.value === archetype;
  descriptionEl.value = profile?.description ?? "";
  updateCounter();
}

function setEditing(open) {
  editCard.hidden = !open;
  editToggleBtn.setAttribute("aria-expanded", String(open));
  setMessage(profileMessageEl, "");
  if (open) {
    fillForm();
    editCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

editToggleBtn.addEventListener("click", () => setEditing(editCard.hidden));
document.getElementById("profile-edit-cancel").addEventListener("click", () => setEditing(false));
descriptionEl.addEventListener("input", updateCounter);

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(profileMessageEl, "");
  const fields = {
    description: descriptionEl.value.trim() || null,
    fav_colors: COLOR_ORDER.filter((c) => colorInputs.some((i) => i.value === c && i.checked)).join(""),
    fav_commander_id: commanderSelect.value || null,
    fav_archetype: archetypeInputs.find((i) => i.checked)?.value || null,
  };
  try {
    profile = await Profiles.save(user.id, fields);
  } catch (err) {
    console.error(err);
    setMessage(profileMessageEl, "Salvataggio non riuscito, riprova.");
    return;
  }
  renderHeader();
  setEditing(false);
  setMessage(viewOf("signed-in").querySelector("[data-message]"), "Profilo salvato.", "ok");
});

// --- Il tuo giocatore -------------------------------------------------------------

// request_player_claim()'s error codes (supabase/migrations/002_player_claims.sql).
const CLAIM_ERROR_TEXT = {
  not_signed_in: "Sessione scaduta: accedi di nuovo e riprova.",
  already_linked: "Il tuo account è già collegato a un giocatore.",
  request_pending: "Hai già una richiesta in attesa.",
  player_not_found: "Giocatore non trovato: ricarica la pagina.",
  player_taken: "Questo giocatore è già collegato a un altro account.",
  player_requested: "Qualcun altro ha già chiesto questo giocatore. Se sei tu, contatta un amministratore.",
};

function showClaim(state) {
  for (const block of claimBlocks) block.hidden = block.dataset.claim !== state;
}

// Linked: no claim card, the stats card instead (loaded by loadStats). Not
// linked (no request, or one waiting): the claim card at the top.
async function loadClaim() {
  const linked = await PlayerClaims.linkedPlayer(user.id);
  const pending = linked ? null : await PlayerClaims.mine(user.id);
  claim = { linked, pending };
  claimCard.hidden = Boolean(linked);
  statsCard.hidden = !linked;
  if (linked) return;
  if (pending) {
    pendingPlayerEl.textContent = playerLabel(pending.player);
    showClaim("pending");
  } else {
    const players = await PlayerClaims.unlinkedPlayers();
    claimSelect.innerHTML =
      '<option value="">Scegli il tuo nome&hellip;</option>' +
      players.map((p) => `<option value="${p.id}">${escapeHtml(playerLabel(p))}</option>`).join("");
    showClaim("none");
  }
}

async function reloadClaim(okText) {
  try {
    await loadClaim();
    // Approved by the admin in the meantime: the stats take its place.
    if (claim.linked) await loadStats(claim.linked);
  } catch (err) {
    console.error(err);
    setMessage(claimMessageEl, "Impossibile caricare il tuo giocatore, ricarica la pagina.");
    return;
  }
  renderHeader();
  setMessage(claimMessageEl, okText, "ok");
}

// --- Le tue statistiche --------------------------------------------------------------

// Same figures as the player page's own tiles (js/player-detail.js), over the
// player's whole history: match-basis winrate, a bye counts as a win, a drop
// isn't a match at all; "Eventi" counts entries (an event counts even if the
// player dropped before playing).
function matchOutcome(m, isPlayer1) {
  const outcome = matchRoundOutcome(m);
  if (outcome === "draw") return "draw";
  return (outcome === "player1") === isPlayer1 ? "win" : "loss";
}

async function loadStats(player) {
  statsLink.href = `player.html?id=${player.id}`;
  const [entries, { asP1, asP2 }, standings] = await Promise.all([
    EventEntries.listByPlayer(player.id),
    Matches.listByPlayer(player.id),
    // Cached final standings of closed events; the best placement only.
    EventStandings.listByPlayer(player.id).catch((err) => {
      console.error(err);
      return [];
    }),
  ]);

  const bucket = { wins: 0, draws: 0, losses: 0 };
  for (const m of asP1) if (!isDrop(m)) tallyOutcome(bucket, matchOutcome(m, true));
  for (const m of asP2) if (!isDrop(m)) tallyOutcome(bucket, matchOutcome(m, false));
  renderWinrateTiles(statsTilesEl, bucket, { events: entries.length });

  // Most played deck (commander + partner pair), then the most recent of a tie.
  const decks = new Map();
  for (const e of entries) {
    if (!e.commander) continue;
    const key = `${e.commander.id}_${e.partner_commander?.id ?? ""}`;
    const deck = decks.get(key) ?? { commander: e.commander, partner: e.partner_commander ?? null, count: 0, last: "" };
    deck.count += 1;
    if ((e.event?.event_date ?? "") > deck.last) deck.last = e.event.event_date;
    decks.set(key, deck);
  }
  const top = [...decks.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))[0];
  statsCommanderEl.innerHTML = top
    ? `${commanderPairLabel(top.commander, top.partner)} <span class="profile-empty">(${top.count} ${top.count === 1 ? "evento" : "eventi"})</span>`
    : EMPTY;

  const best = standings.reduce((min, s) => (min === null || s.position < min ? s.position : min), null);
  statsBestEl.innerHTML = best === null ? EMPTY : `#${best}`;
}

document.getElementById("account-claim-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setMessage(claimMessageEl, "");
  // Checked here, not with `required`: the native <select> is hidden behind
  // js/custom-select.js's skin, where the browser can't show its warning.
  if (!claimSelect.value) {
    setMessage(claimMessageEl, "Scegli il tuo nome dalla lista.");
    return;
  }
  try {
    await PlayerClaims.request(claimSelect.value);
  } catch (err) {
    console.error(err);
    setMessage(claimMessageEl, CLAIM_ERROR_TEXT[err?.message] ?? "Richiesta non riuscita, riprova.");
    return;
  }
  await reloadClaim("Richiesta inviata.");
});

document.getElementById("account-claim-cancel").addEventListener("click", async () => {
  setMessage(claimMessageEl, "");
  try {
    await PlayerClaims.cancel();
  } catch (err) {
    console.error(err);
    setMessage(claimMessageEl, "Annullamento non riuscito, riprova.");
    return;
  }
  await reloadClaim("Richiesta annullata.");
});

// --- Loading the signed-in view -----------------------------------------------------

async function loadCommanders() {
  const commanders = await Commanders.list();
  commanderSelect.innerHTML =
    '<option value="">&mdash; nessuno &mdash;</option>' +
    commanders.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

async function loadSignedIn(sessionUser) {
  user = sessionUser;
  setEditing(false);
  try {
    [profile] = await Promise.all([Profiles.mine(user.id), loadClaim(), loadCommanders()]);
    if (claim.linked) await loadStats(claim.linked);
  } catch (err) {
    console.error(err);
    setMessage(viewOf("signed-in").querySelector("[data-message]"), "Impossibile caricare il profilo, ricarica la pagina.");
  }
  renderHeader();
  show("signed-in");
}

// --- Auth ---------------------------------------------------------------------------

// A sign-in that failed or was cancelled on Google's side comes back with
// the error in the address (query or fragment) instead of a session.
function returnedError() {
  const params = [window.location.search, window.location.hash.replace(/^#/, "?")].map((s) => new URLSearchParams(s));
  return params.some((p) => p.has("error") || p.has("error_code"));
}

let firstEvent = true;
sb.auth.onAuthStateChange((_event, session) => {
  const isFirst = firstEvent;
  firstEvent = false;
  // Deferred: supabase-js freezes if another Supabase call is awaited inside
  // its own auth-change callback (loadSignedIn makes several).
  setTimeout(async () => {
    if (session) {
      // Token refreshes etc. for the account already on screen: nothing to do.
      if (user?.id !== session.user.id) await loadSignedIn(session.user);
    } else {
      user = null;
      profile = null;
      show("login");
      if (isFirst && returnedError()) {
        setMessage(viewOf("login").querySelector("[data-message]"), "Accesso con Google non riuscito o annullato: riprova.");
      }
    }
    if (isFirst) hidePageLoading();
  }, 0);
});

document.getElementById("account-google").addEventListener("click", async () => {
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: ACCOUNT_URL },
  });
  // On success the page is already on its way to Google.
  if (error) {
    console.error(error);
    setMessage(viewOf("login").querySelector("[data-message]"), "Impossibile avviare l'accesso con Google, riprova.");
  }
});

document.getElementById("account-logout").addEventListener("click", async () => {
  const { error } = await sb.auth.signOut();
  if (error) {
    console.error(error);
    setMessage(document.getElementById("account-message"), "Uscita non riuscita, riprova.");
  }
  // The SIGNED_OUT event switches back to the login view.
});
