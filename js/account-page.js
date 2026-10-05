// account.html — "Profilo": a signed-in account's own profile page. Signed
// out: an "Accedi con Google" card (the first sign-in creates the account).
// Signed in:
//  - "Il tuo giocatore" on top, only while the account isn't linked to a
//    player: the list of players not linked yet to request one, or the
//    pending request (with "Annulla richiesta") — linking itself is the
//    admin's (PLAYER_LOGIN.md);
//  - the player card (left on desktop): Magic-card proportions, the
//    favourite commander's art (Scryfall) as its background, a glowing border
//    in the favourite colours; the upper part left to the art; a nameplate
//    straight on the art — avatar (the Google picture — hidden by the
//    owner, no circle at all outside edit mode) and name — then, on a glass
//    panel at the bottom, archetype and colours, then the description (140
//    characters at most); "Dal <year>" of the linked player's first event at
//    the bottom. The favourite commander is shown only as the art; ✎ edits
//    the card without changing its layout (each value turns into its own
//    list / toggles / text, plus the commander list and "Mostra foto", live
//    preview) and becomes ✓ to save, with ✕ (or Esc) to cancel — saved to
//    the account's own row in `profiles` (supabase/migrations/004-006);
//    under it, once linked, the switch showing it on the player page too
//    (js/player-detail.js, migration 007);
//  - on the right: "Le tue statistiche" once linked (the player page's own
//    winrate tiles over the whole history plus the leagues played as one
//    more tile, link to the player page) and "Account" (the Google email,
//    "Esci", and — not for admins — "Elimina account").
//
// Google only for players, no email/password: Supabase never has to send a
// confirmation or reset email (its built-in sender only reaches the project
// team). Normally through Google's own button on this page (Google Identity
// Services → signInWithIdToken, so Google names the site); if its script is
// blocked, the redirect flow instead: Google comes back to this page
// (ACCOUNT_URL, allowed in Supabase's Authentication > URL Configuration).
// Either way supabase-js reports SIGNED_IN.
//
// The page stays behind its loading splash until everything a signed-in
// view shows has loaded (the commander art excepted — it fades in when
// Scryfall answers), so it all appears together, already filled.
//
// The art isn't credited on the card (Michele's choice), although
// Scryfall's guidelines ask for the artist to be credited where its art
// crops are shown — see PLAYER_LOGIN.md, step 4.
import { sb } from "./supabase-client.js";
import {
  Commanders,
  PlayerClaims,
  Profiles,
  MyAccount,
  Players,
  PlayerAutoBadges,
  Events,
  Decklists,
  Follows,
  Leagues,
  fetchEventsResults,
  EventEntries,
  Matches,
} from "./db.js";
import { matchRoundOutcome, isDrop, isBye, computeLeaguePoints } from "./leaderboard.js";
import { tallyOutcome, renderWinrateTiles } from "./winrate.js";
import { escapeHtml, colorIdentityPips, uniqueBadges, eventTitle, formatDate } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { fetchPlayerBadgesRenderer } from "./player-badges.js";
import {
  applyCardAccents,
  archetypeLabel,
  EMPTY_VALUE,
  createArtPainter,
  cardBadgesHtml,
  cardLinksHtml,
  parseCardLink,
  CARD_LINK_SITES,
} from "./player-card.js";

const ACCOUNT_URL = new URL("account.html", window.location.href).href;
const COLOR_ORDER = ["W", "U", "B", "R", "G"];
// Also enforced by the database (supabase/migrations/006).
const DESCRIPTION_MAX = 140;

const views = Array.from(document.querySelectorAll("[data-view]"));
const viewOf = (name) => views.find((v) => v.dataset.view === name);
const pageMessageEl = () => viewOf("signed-in").querySelector("[data-message]");

// Player card
const cardEl = document.getElementById("player-card");
const artEl = document.getElementById("pc-art");
const avatarImg = document.getElementById("profile-avatar");
const initialEl = document.getElementById("profile-initial");
const nameEl = document.getElementById("profile-name");
const archetypeEl = document.getElementById("pc-archetype");
const colorsEl = document.getElementById("pc-colors");
const bioEl = document.getElementById("profile-bio");
const sinceEl = document.getElementById("pc-since");
const badgesEl = document.getElementById("pc-badges");
const linksEl = document.getElementById("pc-links");
const editToggleBtn = document.getElementById("profile-edit-toggle");
const editCancelBtn = document.getElementById("profile-edit-cancel");
const emailEl = document.getElementById("account-email");

// The card's edit mode: each value's editable twin, in its place.
const profileForm = document.getElementById("profile-form");
const showAvatarInput = document.getElementById("profile-show-avatar");
const commanderSelect = document.getElementById("profile-commander");
const archetypeSelect = document.getElementById("profile-archetype");
const colorInputs = Array.from(profileForm.querySelectorAll('input[name="profile-color"]'));
const descriptionEl = document.getElementById("profile-description");
const counterEl = document.getElementById("profile-counter");
// One field per site (CARD_LINK_SITES: instagram, moxfield, archidekt).
const linkInputs = Object.fromEntries(Object.keys(CARD_LINK_SITES).map((key) => [key, document.getElementById(`profile-${key}`)]));

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
const publicWrapEl = document.getElementById("profile-public-wrap");
const publicInput = document.getElementById("profile-public");
const publicLabelEl = document.getElementById("profile-public-label");
const publicHintEl = document.getElementById("profile-public-hint");

// "Account"
const accountMessageEl = document.getElementById("account-message");
const accountDangerEl = document.getElementById("account-danger");
const accountDeleteBtn = document.getElementById("account-delete");

// Shown on the sign-in card right after the account is deleted (the
// SIGNED_OUT that follows switches to it).
let loginNotice = null;

// What's on screen: the account, its saved profile, its player link/request,
// and the linked player's first event year (the card's "Dal …") and badges.
let user = null;
let profile = null;
let claim = { linked: null, pending: null };
let commandersById = new Map();
let firstYear = null;
let playerBadges = [];

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

// The commander art behind the card (js/player-card.js: Scryfall's art crop).
const paintArt = createArtPainter(artEl);

// --- Player card ------------------------------------------------------------------

// What the card shows: the saved profile, or — in edit mode — the form's
// current values (the live preview).
function savedValues() {
  return {
    colors: profile?.fav_colors ?? "",
    commander: profile?.fav_commander ?? null,
    archetype: profile?.fav_archetype ?? null,
    description: profile?.description ?? "",
    showAvatar: profile?.show_avatar ?? true,
    instagram: profile?.instagram ?? null,
    moxfield: profile?.moxfield ?? null,
    archidekt: profile?.archidekt ?? null,
  };
}

function formValues() {
  return {
    colors: COLOR_ORDER.filter((c) => colorInputs.some((i) => i.value === c && i.checked)).join(""),
    commander: commandersById.get(commanderSelect.value) ?? null,
    archetype: archetypeSelect.value || null,
    description: descriptionEl.value,
    showAvatar: showAvatarInput.checked,
  };
}

function renderCard(values) {
  const meta = user.user_metadata ?? {};
  // The linked player's own name once there is one, the Google name before.
  const displayName = claim.linked ? playerLabel(claim.linked) : meta.full_name || meta.name || user.email;
  nameEl.textContent = displayName;
  emailEl.textContent = user.email;

  // The Google picture. Hidden by the owner: outside edit mode no avatar
  // circle at all, leaving the commander art in view (.hides-avatar); in
  // edit mode the circle stays, with the initial, next to its "Mostra foto"
  // switch. No Google picture at all: the initial on red, no switch.
  initialEl.textContent = (displayName.trim()[0] ?? "?").toUpperCase();
  const hasPicture = Boolean(meta.avatar_url);
  const showPicture = hasPicture && values.showAvatar;
  if (showPicture) avatarImg.src = meta.avatar_url;
  avatarImg.hidden = !showPicture;
  cardEl.classList.toggle("hides-avatar", hasPicture && !values.showAvatar);
  document.getElementById("profile-show-avatar-wrap").classList.toggle("is-unavailable", !hasPicture);

  applyCardAccents(cardEl, values.colors);

  archetypeEl.innerHTML = values.archetype ? escapeHtml(archetypeLabel(values.archetype)) : EMPTY_VALUE;
  colorsEl.innerHTML = values.colors ? colorIdentityPips(values.colors) : EMPTY_VALUE;

  const description = values.description.trim();
  bioEl.textContent = description || "Nessuna descrizione: premi ✎ per raccontare qualcosa di te.";
  bioEl.classList.toggle("is-empty", !description);

  // The links: what's saved (the edit fields are only read on save).
  linksEl.innerHTML = cardLinksHtml(savedValues());

  // The player's (not the account's) first event and badges, once linked.
  sinceEl.textContent = claim.linked && firstYear ? `Dal ${firstYear}` : "";
  badgesEl.innerHTML = claim.linked ? cardBadgesHtml(playerBadges) : "";

  paintArt(values.commander?.name ?? null);
}

// --- Edit mode (on the card itself, same layout) -----------------------------------

function updateCounter() {
  counterEl.textContent = `${descriptionEl.value.length}/${DESCRIPTION_MAX}`;
}

// Puts the saved profile into the form (also how "Annulla" discards edits).
function fillForm() {
  const saved = savedValues();
  showAvatarInput.checked = saved.showAvatar;
  commanderSelect.value = profile?.fav_commander_id ?? "";
  archetypeSelect.value = saved.archetype ?? "";
  for (const input of colorInputs) input.checked = saved.colors.includes(input.value);
  descriptionEl.value = saved.description;
  for (const [key, input] of Object.entries(linkInputs)) input.value = saved[key] ?? "";
  updateCounter();
}

const isEditing = () => cardEl.classList.contains("is-editing");

// The animated switch between the two modes (animateSwitch) — one motion,
// not each piece moving on its own: the glass panel's contents fade out;
// the panel then grows/shrinks to its new height, the nameplate riding on
// top of it (the name sliding over when the avatar comes or goes, the
// avatar and "Mostra foto" growing/fading in or out with it); and the
// contents fade back in, already in their new places, as it settles.
const NAMEPLATE_PIECES = ".pc-avatar, .pc-name, .pc-avatar-toggle";
const SWITCH_MS = 320;
const FADE_OUT_MS = 120;
const FADE_IN_DELAY_MS = 140;
const FADE_IN_MS = 220;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// True while a switch animates: ✎/✓, ✕ and Esc wait for it to end.
let switching = false;

const finished = (animation) => animation.finished.catch(() => {});

// ✕ slides out from under ✓ when editing starts, and back under it after.
function showCancelButton(open, animate) {
  const tucked = { opacity: 0, transform: "translateX(40px) scale(0.6)" };
  const out = { opacity: 1, transform: "none" };
  if (!animate) {
    editCancelBtn.hidden = !open;
  } else if (open) {
    editCancelBtn.hidden = false;
    editCancelBtn.animate([tucked, out], { duration: SWITCH_MS, easing: EASE });
  } else {
    finished(editCancelBtn.animate([out, tucked], { duration: 200, easing: "ease-in" })).then(() => {
      if (!isEditing()) editCancelBtn.hidden = true;
    });
  }
}

async function animateSwitch(open) {
  const panel = cardEl.querySelector(".pc-panel");
  const pieces = Array.from(cardEl.querySelectorAll(NAMEPLATE_PIECES));
  const visible = (els) => els.filter((el) => el.getClientRects().length);

  // Which nameplate pieces each mode shows: the other mode tried for a
  // moment, within this same frame, so it never paints.
  const before = new Set(visible(pieces));
  cardEl.classList.toggle("is-editing", open);
  const after = new Set(visible(pieces));
  cardEl.classList.toggle("is-editing", !open);
  const leaving = pieces.filter((el) => before.has(el) && !after.has(el));
  const entering = pieces.filter((el) => after.has(el) && !before.has(el));
  const staying = pieces.filter((el) => before.has(el) && after.has(el));

  const fadeOuts = [...visible(Array.from(panel.children)), ...leaving].map((el) =>
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT_MS, easing: "ease-in", fill: "forwards" })
  );
  await Promise.all(fadeOuts.map(finished));

  // Where the name is now, and the panel's top edge: the nameplate sits
  // right on the panel, so the name's move is measured against it — the
  // panel's own animated height carries the nameplate the rest of the way.
  const panelBefore = panel.getBoundingClientRect();
  const rectsBefore = new Map(staying.map((el) => [el, el.getBoundingClientRect()]));
  cardEl.classList.toggle("is-editing", open);
  const panelAfter = panel.getBoundingClientRect();

  const animations = [];
  // The new contents start hidden (fill: backwards) in this same frame the
  // old ones' faded-out state is dropped, so nothing flashes in between.
  for (const el of visible(Array.from(panel.children))) {
    animations.push(
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_IN_MS,
        delay: FADE_IN_DELAY_MS,
        easing: "ease-out",
        fill: "backwards",
      })
    );
  }
  for (const animation of fadeOuts) animation.cancel();

  panel.style.boxSizing = "border-box";
  panel.style.overflow = "hidden";
  animations.push(
    panel.animate([{ height: `${panelBefore.height}px` }, { height: `${panelAfter.height}px` }], {
      duration: SWITCH_MS,
      easing: EASE,
    })
  );
  for (const el of staying) {
    const was = rectsBefore.get(el);
    const is = el.getBoundingClientRect();
    const dx = was.left - is.left;
    const dy = was.top - panelBefore.top - (is.top - panelAfter.top);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    animations.push(
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: SWITCH_MS,
        easing: EASE,
      })
    );
  }
  for (const el of entering) {
    const from = el.classList.contains("pc-avatar") ? "scale(0.5)" : "translateY(4px)";
    animations.push(
      el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], {
        duration: SWITCH_MS,
        easing: EASE,
      })
    );
  }
  await Promise.all(animations.map(finished));
  panel.style.boxSizing = "";
  panel.style.overflow = "";
}

async function setEditing(open, { animate = true } = {}) {
  if (open === isEditing()) return;
  const label = open ? "Salva le modifiche" : "Modifica la tua carta";
  editToggleBtn.setAttribute("aria-label", label);
  editToggleBtn.title = label;
  editToggleBtn.classList.toggle("is-save", open);
  // The values first (hidden ones included), so both modes are measured
  // with what they'll show.
  if (open) {
    fillForm();
    renderCard(formValues());
  } else {
    renderCard(savedValues());
  }
  const animated = animate && !reducedMotion.matches && cardEl.getClientRects().length > 0;
  showCancelButton(open, animated);
  if (!animated) {
    cardEl.classList.toggle("is-editing", open);
    return;
  }
  switching = true;
  try {
    await animateSwitch(open);
  } finally {
    switching = false;
  }
}

// ✎ enters edit mode; there, the same button is ✓ and saves.
editToggleBtn.addEventListener("click", () => {
  if (switching) return;
  setMessage(pageMessageEl(), "");
  if (isEditing()) profileForm.requestSubmit();
  else setEditing(true);
});
editCancelBtn.addEventListener("click", () => {
  if (!switching) setEditing(false);
});
document.addEventListener("keydown", (e) => {
  // Not while a dropdown is open: Escape closes that first.
  if (e.key === "Escape" && isEditing() && !switching && !cardEl.querySelector(".cs-wrap.is-open")) setEditing(false);
});

// --- Card height = the cards beside it (desktop) ------------------------------------

// From 821px the card column (the card, then the switch under it once
// linked) stands beside "Le tue statistiche" + "Account": the card's width
// is set so that, at Magic-card proportions, the column is exactly as tall
// as those cards together (within MIN/MAX_CARD_WIDTH). When they're shorter
// than the smallest card, the last of them is padded down to the column's
// bottom edge instead (styles.css --pc-side-stretch). Phones: one column,
// nothing to line up. Edit mode can make the card taller for a while; it's
// measured against its own proportions, not its current height.
const layoutEl = document.querySelector(".profile-layout");
const cardColEl = document.querySelector(".profile-card-col");
const sideEl = document.querySelector(".profile-side");
const sideBySide = window.matchMedia("(min-width: 821px)");
const CARD_RATIO = 680 / 488;
const CARD_FRAME = 6; // .pc-frame's 3px all around
const MIN_CARD_WIDTH = 240;
const MAX_CARD_WIDTH = 340;

// The widths just tried: the card's width changes the side cards' width,
// and so possibly their height (tiles wrapping differently) — a width that
// comes back means two widths would keep swapping, so the current one stays.
let recentWidths = [];
let recentReset = null;

function alignCardToSide() {
  if (!sideBySide.matches || !sideEl.getClientRects().length) {
    layoutEl.style.removeProperty("--pc-width");
    sideEl.style.removeProperty("--pc-side-stretch");
    return;
  }
  const stretch = parseFloat(sideEl.style.getPropertyValue("--pc-side-stretch")) || 0;
  const sideHeight = sideEl.offsetHeight - stretch;
  // The card is sized without "Invia la tua decklist"'s open part: opening
  // it (animated) mustn't resize the card — the column just grows below.
  const decklistOpenPart = document.getElementById("decklist-body")?.offsetHeight ?? 0;
  // What's under the card in its column (the switch, a message).
  const below = cardColEl.offsetHeight - cardEl.offsetHeight;
  const fitting = (sideHeight - decklistOpenPart - below - CARD_FRAME) / CARD_RATIO + CARD_FRAME;
  let width = Math.round(Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, fitting)));
  const current = parseFloat(layoutEl.style.getPropertyValue("--pc-width"));
  if (width !== current) {
    if (recentWidths.includes(width)) {
      width = current;
    } else {
      recentWidths.push(width);
      clearTimeout(recentReset);
      recentReset = setTimeout(() => (recentWidths = []), 500);
      layoutEl.style.setProperty("--pc-width", `${width}px`);
    }
  }
  const cardHeight = (width - CARD_FRAME) * CARD_RATIO + CARD_FRAME;
  sideEl.style.setProperty("--pc-side-stretch", `${Math.max(0, Math.round(cardHeight + below - sideHeight))}px`);
}

// A frame later: resizing the observed side cards from inside their own
// ResizeObserver callback is the "ResizeObserver loop" error.
// Both columns: the switch under the card can change height too (its hint).
const alignObserver = new ResizeObserver(() => requestAnimationFrame(alignCardToSide));
alignObserver.observe(sideEl);
alignObserver.observe(cardColEl);
sideBySide.addEventListener("change", alignCardToSide);

// Live preview: every change in edit mode redraws the card from the form.
profileForm.addEventListener("change", () => renderCard(formValues()));
descriptionEl.addEventListener("input", updateCounter);

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const values = formValues();
  // The links: a username, or that site's own profile link — anything else
  // is refused here (the database only takes a plain username anyway).
  const links = {};
  for (const [key, input] of Object.entries(linkInputs)) {
    const parsed = parseCardLink(key, input.value);
    if (parsed.error) {
      setMessage(pageMessageEl(), parsed.error);
      input.focus();
      return;
    }
    links[key] = parsed.username;
  }
  const fields = {
    ...links,
    description: values.description.trim() || null,
    fav_colors: values.colors,
    fav_commander_id: values.commander?.id ?? null,
    fav_archetype: values.archetype,
    show_avatar: values.showAvatar,
  };
  editToggleBtn.disabled = true;
  try {
    profile = await Profiles.save(user.id, fields);
  } catch (err) {
    console.error(err);
    setMessage(pageMessageEl(), "Salvataggio non riuscito, riprova.");
    return;
  } finally {
    editToggleBtn.disabled = false;
  }
  // Back to the card itself is the confirmation — no message.
  setEditing(false);
  // The first save makes the card showable on the player page.
  renderPublicSwitch();
});

// --- The card on the player page ----------------------------------------------------

// The switch under the card: whether player.html shows this card too
// (profiles.show_on_player_page, read there through
// supabase/migrations/007's public_player_card()). Only while linked to a
// player (no player page otherwise), and usable only once the card has
// been saved at least once — before that there's no profile at all, and
// nothing to show; on by default from the first save. Saved right away.
function renderPublicSwitch(errorText = "") {
  publicWrapEl.hidden = !claim.linked;
  const saved = Boolean(profile);
  publicInput.disabled = !saved;
  publicInput.checked = saved && (profile.show_on_player_page ?? true);
  // Not saved yet: what to do first takes the label's place.
  publicLabelEl.textContent = saved ? "Mostra la carta nella pagina giocatore" : "Salva prima la tua carta almeno una volta.";
  publicHintEl.textContent = errorText;
  publicHintEl.classList.toggle("is-error", Boolean(errorText));
}

publicInput.addEventListener("change", async () => {
  const show = publicInput.checked;
  publicInput.disabled = true;
  try {
    profile = await Profiles.save(user.id, { show_on_player_page: show });
  } catch (err) {
    console.error(err);
    // Back to what's saved.
    renderPublicSwitch("Salvataggio non riuscito, riprova.");
    return;
  }
  renderPublicSwitch();
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
  // Shown by loadDecklistCard once linked.
  if (!linked) decklistCard.hidden = true;
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
  // The card's name follows the link (the player's name once approved), and
  // the switch under it comes with it.
  renderCard(cardEl.classList.contains("is-editing") ? formValues() : savedValues());
  renderPublicSwitch();
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
  const [entries, { asP1, asP2 }, badgeSlots, autoBadgeRows] = await Promise.all([
    EventEntries.listByPlayer(player.id),
    Matches.listByPlayer(player.id),
    // The card's badges, same as next to the name on the player page: the
    // two manual slots (Players' badge embed), then the automatic ones by
    // priority. Not fatal: the card just shows none.
    Players.get(player.id).catch((err) => {
      console.error(err);
      return {};
    }),
    PlayerAutoBadges.listByPlayer(player.id).catch((err) => {
      console.error(err);
      return [];
    }),
  ]);
  playerBadges = uniqueBadges([
    badgeSlots.badge1,
    badgeSlots.badge2,
    ...autoBadgeRows
      .map((r) => r.badge)
      .filter(Boolean)
      .sort((a, b) => b.priority - a.priority),
  ]);

  const bucket = { wins: 0, draws: 0, losses: 0 };
  for (const m of asP1) if (!isDrop(m)) tallyOutcome(bucket, matchOutcome(m, true));
  for (const m of asP2) if (!isDrop(m)) tallyOutcome(bucket, matchOutcome(m, false));
  renderWinrateTiles(statsTilesEl, bucket, { events: entries.length });

  // "Leghe" as one more tile, same look as the others, right before
  // "Eventi": the leagues (open or closed) the player has played at least
  // one closed event of. Only when the tiles are there (no matches yet: just
  // the "not enough data" line).
  const eventsTile = [...statsTilesEl.querySelectorAll(".stat-tile")].find(
    (tile) => tile.querySelector(".stat-tile-label")?.textContent === "Eventi"
  );
  if (eventsTile) {
    const leagueIds = new Set(
      entries.filter((e) => e.event && !e.event.is_open && e.event.league).map((e) => e.event.league.id)
    );
    eventsTile.insertAdjacentHTML(
      "beforebegin",
      `<div class="stat-tile"><div class="stat-tile-label">Leghe</div><div class="stat-tile-value">${leagueIds.size}</div></div>`
    );
  }

  // The player card's "Dal …": the year of the player's first event.
  const firstDate = entries.reduce((min, e) => {
    const d = e.event?.event_date;
    return d && (!min || d < min) ? d : min;
  }, null);
  firstYear = firstDate ? firstDate.slice(0, 4) : null;

  // "Invia la tua decklist" needs the same entries (the closed events played).
  await loadDecklistCard(player, entries);
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

// --- Invia la tua decklist ------------------------------------------------------------

// For an upcoming event (open, today or later) or a closed one the player
// is in, emailed to the organisers by the send-decklist Edge Function
// (js/db.js's Decklists) — never stored, only *that* it was sent: two per
// player and event (supabase/migrations/008-009). The function checks it
// all again; this only offers the events that qualify, shows the ones
// already sent, and asks for confirmation before each send.
const decklistCard = document.getElementById("profile-decklist");
const decklistNoneEl = document.getElementById("decklist-none");
const decklistForm = document.getElementById("decklist-form");
const decklistEventSelect = document.getElementById("decklist-event");
const decklistText = document.getElementById("decklist-text");
const decklistMeter = document.getElementById("decklist-meter");
const decklistConfirm = document.getElementById("decklist-confirm");
const decklistConfirmText = document.getElementById("decklist-confirm-text");
const decklistConfirmSend = document.getElementById("decklist-confirm-send");
const decklistConfirmCancel = document.getElementById("decklist-confirm-cancel");
const decklistActions = document.getElementById("decklist-actions");
const decklistMessageEl = document.getElementById("decklist-message");
const decklistSentBox = document.getElementById("decklist-sent");
const decklistSentList = document.getElementById("decklist-sent-list");
const decklistToggle = document.getElementById("decklist-toggle");
const decklistBody = document.getElementById("decklist-body");
const decklistBodyClip = document.getElementById("decklist-body-clip");

// The header opens / closes the rest — closed at first. Same grid-rows
// collapse as Leghe & Eventi's cards; once fully open the clip lifts, so the
// event list's dropdown isn't cut off at the card's edge (CLAUDE.md gotcha
// #13), and drops again before closing, so the content still clips away.
function setDecklistOpen(open) {
  decklistCard.classList.toggle("is-collapsed", !open);
  decklistToggle.setAttribute("aria-expanded", String(open));
  decklistBody.inert = !open;
  if (!open) {
    decklistBodyClip.classList.remove("is-open");
  } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // No transition plays, so its transitionend below never fires.
    decklistBodyClip.classList.add("is-open");
  }
}

decklistToggle.addEventListener("click", () => setDecklistOpen(decklistCard.classList.contains("is-collapsed")));
decklistBody.addEventListener("transitionend", (e) => {
  if (e.target === decklistBody && e.propertyName === "grid-template-rows" && !decklistCard.classList.contains("is-collapsed")) {
    decklistBodyClip.classList.add("is-open");
  }
});

// The send-decklist function's error codes.
const DECKLIST_ERROR_TEXT = {
  not_signed_in: "Sessione scaduta: accedi di nuovo e riprova.",
  blocked: "Il tuo account è bloccato.",
  empty: "Scegli l'evento e incolla la decklist.",
  too_long: "La decklist è troppo lunga.",
  not_linked: "Il tuo account non è collegato a un giocatore.",
  event_not_found: "Evento non trovato: ricarica la pagina.",
  event_not_allowed: "Per questo evento non puoi inviare la decklist.",
  already_sent: "Hai già inviato due decklist per questo evento.",
};

// When the send itself fails (Resend refusing or over its limits, the
// function unreachable, the network), the user is pointed to sending it by
// hand to the same address — a mail link already filled in like the
// function's own email (subject, and the list as the body when it fits a
// mail link: those get cut past ~2000 characters in some mail apps). Public
// here, unlike DECKLIST_TO (the function's secret).
const DECKLIST_FALLBACK_TO = "lamialistadeck@gmail.com";
const DECKLIST_MAILTO_MAX = 1800;

function decklistFallbackHtml(ev, text) {
  // The same subject as supabase/functions/send-decklist's.
  const eventName = ev.name || ev.league?.name || "Evento";
  const date = (ev.event_date ?? "").split("-").reverse().join("/");
  const subject = `${eventName} - ${date} - ${playerLabel(claim.linked)}`;
  const base = `mailto:${DECKLIST_FALLBACK_TO}?subject=${encodeURIComponent(subject)}`;
  const withBody = `${base}&body=${encodeURIComponent(text.trim())}`;
  const fits = withBody.length <= DECKLIST_MAILTO_MAX;
  return `Invio non riuscito. Puoi mandare la lista via email a <a href="${
    fits ? withBody : base
  }">${DECKLIST_FALLBACK_TO}</a>, con oggetto «${escapeHtml(subject)}»${
    fits ? "" : ": incolla la lista nel testo dell'email"
  }.`;
}

// The events that can still get a list (id → event: upcoming first, soonest
// first, then the ones played, newest first) and the ones already sent
// ({ event, sentAt, isNew }, most recently sent first — "Ultime inviate"
// shows the first DECKLIST_SENT_SHOWN; all of them stay out of the list).
const DECKLIST_SENT_SHOWN = 3;
// Only recent events are offered: the next DECKLIST_EVENTS_EACH upcoming and
// the last DECKLIST_EVENTS_EACH played (by date — one out of sends just
// isn't listed, no older one takes its place).
const DECKLIST_EVENTS_EACH = 2;
// Sends allowed per event (the send-decklist function's MAX_SENDS, migration
// 009); how many each event has had so far (event id → 1 or 2).
const DECKLIST_MAX_SENDS = 2;
let decklistEvents = new Map();
let sentDecklists = [];
let decklistSendCount = new Map();

// One more send recorded for an event: it moves to the front of "Ultime
// inviate" (one chip per event) and leaves the list once out of sends.
function recordDecklistSend(ev, count) {
  decklistSendCount.set(ev.id, count);
  if (count >= DECKLIST_MAX_SENDS) decklistEvents.delete(ev.id);
  sentDecklists = sentDecklists.filter((item) => item.event.id !== ev.id);
  sentDecklists.unshift({ event: ev, sentAt: new Date().toISOString(), isNew: true });
}

async function loadDecklistCard(player, entries) {
  decklistCard.hidden = false;
  setDecklistOpen(false);
  closeDecklistConfirm();
  setMessage(decklistMessageEl, "");
  let upcoming;
  let sent;
  try {
    [upcoming, sent] = await Promise.all([Events.listUpcoming(), Decklists.sentEvents(player.id)]);
  } catch (err) {
    // E.g. migration 008 not run yet: no card rather than a broken one.
    console.error(err);
    decklistCard.hidden = true;
    return;
  }
  const played = entries
    .map((e) => e.event)
    .filter((ev) => ev && !ev.is_open)
    .sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? ""));
  // One row per send: per event, how many and the latest.
  decklistSendCount = new Map();
  const lastSentAt = new Map();
  for (const row of sent) {
    decklistSendCount.set(row.event_id, (decklistSendCount.get(row.event_id) ?? 0) + 1);
    if ((row.sent_at ?? "") > (lastSentAt.get(row.event_id) ?? "")) lastSentAt.set(row.event_id, row.sent_at);
  }
  // Every event the player has, for the "Ultime inviate" chips — the list
  // itself offers only the recent ones.
  const known = new Map([...upcoming, ...played].map((ev) => [ev.id, ev]));
  decklistEvents = new Map(
    [
      ...upcoming.slice(0, DECKLIST_EVENTS_EACH).map((ev) => ({ ...ev, upcoming: true })),
      ...played.slice(0, DECKLIST_EVENTS_EACH),
    ]
      .filter((ev) => (decklistSendCount.get(ev.id) ?? 0) < DECKLIST_MAX_SENDS)
      .map((ev) => [ev.id, ev])
  );
  sentDecklists = [...lastSentAt.keys()]
    .map((id) => known.get(id))
    .filter(Boolean)
    .map((event) => ({ event, sentAt: lastSentAt.get(event.id) ?? "", isNew: false }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  renderDecklistCard();
}

function decklistEventSublabel(ev) {
  const sentOnce = (decklistSendCount.get(ev.id) ?? 0) > 0;
  return [ev.upcoming ? "In arrivo" : "Giocato", formatDate(ev.event_date), ev.league?.name, sentOnce && "1 invio rimasto"]
    .filter(Boolean)
    .join(" · ");
}

function renderDecklistCard() {
  const events = [...decklistEvents.values()];
  decklistForm.hidden = events.length === 0;
  decklistNoneEl.hidden = events.length > 0;
  decklistNoneEl.textContent = sentDecklists.length
    ? "Hai già inviato la decklist per tutti gli eventi disponibili."
    : "Nessun evento disponibile: puoi inviare la decklist per i prossimi due eventi o per gli ultimi due che hai giocato.";
  // data-label / data-sublabel: js/custom-select.js shows the name with a
  // smaller line below (in arrivo / giocato · date · league).
  decklistEventSelect.innerHTML =
    '<option value="">Scegli un evento&hellip;</option>' +
    events
      .map((ev) => {
        const name = eventTitle(ev);
        const sub = decklistEventSublabel(ev);
        return `<option value="${ev.id}" data-label="${escapeHtml(name)}" data-sublabel="${escapeHtml(sub)}">${escapeHtml(
          name
        )} — ${escapeHtml(sub)}</option>`;
      })
      .join("");
  decklistSentBox.hidden = sentDecklists.length === 0;
  decklistSentList.innerHTML = sentDecklists
    .slice(0, DECKLIST_SENT_SHOWN)
    .map(
      ({ event, isNew }) => `<li class="decklist-sent-chip${isNew ? " is-new" : ""}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
        <span class="decklist-sent-name">${escapeHtml(eventTitle(event))}</span>
      </li>`
    )
    .join("");
  // Animated once, as it's added — not again on the next redraw.
  for (const item of sentDecklists) item.isNew = false;
}

// What's in the box, said under it as you type: a link, or the cards counted
// from the list (a leading number is the quantity, "1 Sol Ring" / "1x Sol
// Ring"; section names like "Commander" or "Sideboard:" aren't cards). A
// Duel Commander deck is 100 cards: that count turns green.
const DECKLIST_SECTION = /^(commander|commanders|deck|mainboard|main|sideboard|companion|maybeboard)\s*:?$/i;

function updateDecklistMeter() {
  const text = decklistText.value.trim();
  decklistMeter.className = "decklist-meter";
  if (!text) {
    decklistMeter.textContent = "";
    return;
  }
  if (/^https?:\/\/\S+$/i.test(text)) {
    decklistMeter.textContent = "Link alla decklist";
    decklistMeter.classList.add("is-link");
    return;
  }
  let cards = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(\/\/|#)/.test(line) || DECKLIST_SECTION.test(line)) continue;
    const quantity = line.match(/^(\d+)\s*x?\s+\S/i);
    cards += quantity ? Number(quantity[1]) : 1;
  }
  decklistMeter.textContent = `${cards} ${cards === 1 ? "carta" : "carte"}`;
  decklistMeter.classList.toggle("is-full", cards === 100);
}

// The warning before sending slides open in place of the send button.
function openDecklistConfirm(ev) {
  // First send: one more possible; second: the last, replacing the first.
  const last = (decklistSendCount.get(ev.id) ?? 0) + 1 >= DECKLIST_MAX_SENDS;
  decklistConfirmText.innerHTML = `Inviare la decklist per <strong>${escapeHtml(eventTitle(ev))}</strong> del ${formatDate(
    ev.event_date
  )}? ${
    last
      ? "È il tuo <strong>ultimo invio</strong> per questo evento: sostituirà la lista che hai già mandato."
      : "Potrai inviarne <strong>al massimo due</strong> per questo evento: la seconda sostituirà la prima."
  }`;
  decklistConfirm.classList.add("is-open");
  decklistConfirm.inert = false;
  decklistActions.hidden = true;
  decklistConfirmSend.focus({ preventScroll: true });
}

function closeDecklistConfirm() {
  decklistConfirm.classList.remove("is-open");
  decklistConfirm.inert = true;
  decklistActions.hidden = false;
}

function setDecklistSending(sending) {
  decklistConfirmSend.disabled = sending;
  decklistConfirmCancel.disabled = sending;
  decklistConfirmSend.classList.toggle("is-sending", sending);
  decklistConfirmSend.textContent = sending ? "Invio in corso…" : "Conferma e invia";
}

decklistText.addEventListener("input", () => {
  updateDecklistMeter();
  // Changed after the warning: it's for the old text, so it goes.
  if (decklistConfirm.classList.contains("is-open")) closeDecklistConfirm();
});
decklistEventSelect.addEventListener("change", () => {
  if (decklistConfirm.classList.contains("is-open")) closeDecklistConfirm();
});
decklistConfirmCancel.addEventListener("click", closeDecklistConfirm);

decklistForm.addEventListener("submit", (e) => {
  e.preventDefault();
  setMessage(decklistMessageEl, "");
  // Checked here, not with `required`: the native <select> is hidden behind
  // js/custom-select.js's skin, where the browser can't show its warning.
  const ev = decklistEvents.get(decklistEventSelect.value);
  if (!ev) {
    setMessage(decklistMessageEl, "Scegli l'evento.");
    return;
  }
  if (!decklistText.value.trim()) {
    setMessage(decklistMessageEl, "Incolla la decklist o un link.");
    return;
  }
  openDecklistConfirm(ev);
});

decklistConfirmSend.addEventListener("click", async () => {
  const ev = decklistEvents.get(decklistEventSelect.value);
  if (!ev) {
    closeDecklistConfirm();
    return;
  }
  setDecklistSending(true);
  try {
    await Decklists.send(ev.id, decklistText.value);
  } catch (err) {
    console.error(err);
    setDecklistSending(false);
    closeDecklistConfirm();
    const known = DECKLIST_ERROR_TEXT[err?.message];
    if (known) {
      setMessage(decklistMessageEl, known);
    } else {
      // The send itself failed: by hand, to the same address.
      decklistMessageEl.className = "form-message is-error";
      decklistMessageEl.innerHTML = decklistFallbackHtml(ev, decklistText.value);
    }
    // Out of sends (another tab, another device): it leaves the list.
    if (err?.message === "already_sent") {
      recordDecklistSend(ev, DECKLIST_MAX_SENDS);
      renderDecklistCard();
    }
    return;
  }
  setDecklistSending(false);
  closeDecklistConfirm();
  recordDecklistSend(ev, (decklistSendCount.get(ev.id) ?? 0) + 1);
  decklistText.value = "";
  updateDecklistMeter();
  renderDecklistCard();
  setMessage(decklistMessageEl, `Decklist inviata per ${eventTitle(ev)}.`, "ok");
});

// --- Seguiti -----------------------------------------------------------------------------

// The players and commanders this account follows (★ on their pages,
// js/follow-button.js), newest follow first, in two groups (each only when
// it has someone): just the names, linked to their pages, and a filled ★ to
// unfollow (hollow on hover — the same star as on their pages). Any
// signed-in account — following needs no linked player.
const followsCard = document.getElementById("profile-follows");
const followsListEl = document.getElementById("follows-list");
const followsEmptyEl = document.getElementById("follows-empty");

function followRowHtml(kind, target) {
  const href = kind === "player" ? `player.html?id=${target.id}` : `commander.html?id=${target.id}`;
  const name = kind === "player" ? playerLabel(target) : target.name;
  return `<li class="follow-row" data-kind="${kind}" data-id="${target.id}">
    <div class="follow-main">
      <span class="follow-title">
        <a class="follow-name" href="${href}">${escapeHtml(name)}</a>${kind === "player" ? '<span class="follow-badges"></span>' : ""}
      </span>
      <span class="follow-stats"></span>
    </div>
    <button type="button" class="follow-remove" aria-label="Non seguire più ${escapeHtml(name)}" title="Non seguire più">
      <span class="follow-remove-star" aria-hidden="true"></span>
    </button>
  </li>`;
}

function followGroupHtml(title, kind, targets) {
  if (!targets.length) return "";
  return `<li class="follow-group">
    <p class="follow-group-title">${title}</p>
    <ul class="follow-group-list">${targets.map((t) => followRowHtml(kind, t)).join("")}</ul>
  </li>`;
}

function updateFollowsEmpty() {
  // A group whose last row went goes too.
  for (const group of followsListEl.querySelectorAll(".follow-group")) {
    if (!group.querySelector(".follow-row")) group.remove();
  }
  followsEmptyEl.hidden = followsListEl.querySelector(".follow-row") !== null;
}

async function loadFollows() {
  let follows;
  try {
    follows = await Follows.mine(user.id);
  } catch (err) {
    // E.g. migration 010 not run yet: no card rather than a broken one.
    console.error(err);
    followsCard.hidden = true;
    return;
  }
  followsListEl.innerHTML =
    followGroupHtml("Giocatori", "player", follows.map((f) => f.player).filter(Boolean)) +
    followGroupHtml("Comandanti", "commander", follows.map((f) => f.commander).filter(Boolean));
  updateFollowsEmpty();
  followsCard.hidden = false;
  // The numbers next to each name come after, without holding up the page.
  fillFollowStats(follows).catch((err) => console.error(err));
}

// --- Seguiti: the numbers next to each name ---

// Small chips beside a name, the full text on hover:
//  - a player: its badges right after the name (the same icons as in the
//    lists, js/player-badges.js), then winrate (its cached standings —
//    closed events, counted like the player page's), latest placement with
//    the event, and its position in the open league's standings (a real
//    league, not a Topdeck series; computed like the Bacheca's, js/home.js);
//  - a commander: winrate counted like commander.html's (a bye or a drop
//    isn't a match it played), how many events it was played in, the
//    latest of them.
const winrate = ({ wins, draws, losses }) => {
  const played = wins + draws + losses;
  return played ? `${Math.round((wins / played) * 100)}%` : null;
};

function chip(text, title, extraClass = "") {
  return `<span class="follow-chip${extraClass}" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
}

function setFollowStats(kind, id, html) {
  const slot = followsListEl.querySelector(`.follow-row[data-kind="${kind}"][data-id="${id}"] .follow-stats`);
  if (!slot || !html) return;
  slot.innerHTML = html;
  slot.classList.add("is-ready");
}

const latestEvent = (rows) =>
  rows.reduce((best, row) => (!best || (row.event?.event_date ?? "") > (best.event?.event_date ?? "") ? row : best), null);

async function openLeagueStandings() {
  const league = await Leagues.getOpen();
  if (!league) return null;
  const allEvents = await Events.listByLeague(league.id);
  const [eventsData, scheduledEvents] = await Promise.all([
    fetchEventsResults(allEvents.filter((ev) => !ev.is_open).map((ev) => ev.id)),
    Leagues.eventCount(league.id, allEvents.length),
  ]);
  return { league, standings: computeLeaguePoints(eventsData, { scheduledEvents }) };
}

async function fillPlayerStats(playerIds) {
  const [results, open, badgesFor] = await Promise.all([
    Follows.playerResults(playerIds),
    openLeagueStandings().catch((err) => (console.error(err), null)),
    // Never rejects: without them the names just have no badges.
    fetchPlayerBadgesRenderer(),
  ]);
  for (const id of playerIds) {
    const badgesSlot = followsListEl.querySelector(`.follow-row[data-kind="player"][data-id="${id}"] .follow-badges`);
    if (badgesSlot) badgesSlot.innerHTML = badgesFor({ id });
    const rows = results.filter((r) => r.player_id === id);
    const totals = rows.reduce(
      (t, r) => ({ wins: t.wins + r.wins, draws: t.draws + r.draws, losses: t.losses + r.losses }),
      { wins: 0, draws: 0, losses: 0 }
    );
    const chips = [];
    const rate = winrate(totals);
    if (rate) chips.push(chip(`WR ${rate}`, "Winrate su tutti gli eventi", " is-strong"));
    const latest = latestEvent(rows);
    if (latest) {
      chips.push(
        chip(`#${latest.position} · ${eventTitle(latest.event)}`, `Ultimo evento: ${eventTitle(latest.event)}, ${formatDate(latest.event.event_date)}`)
      );
    }
    const index = open ? open.standings.findIndex((row) => row.player?.id === id) : -1;
    if (index >= 0) chips.push(chip(`#${index + 1} · ${open.league.name}`, `${open.league.name}: ${index + 1}° in classifica`));
    setFollowStats("player", id, chips.join(""));
  }
}

async function fillCommanderStats(commanderIds) {
  const appearances = await Follows.commanderAppearances(commanderIds);
  const eventIds = [...new Set(appearances.map((a) => a.event.id))];
  const results = await fetchEventsResults(eventIds);
  const plays = (entry, id) => entry && (entry.commander_id === id || entry.partner_commander_id === id);
  for (const id of commanderIds) {
    const mine = appearances.filter((a) => a.commander_id === id || a.partner_commander_id === id);
    if (!mine.length) continue;
    const bucket = { wins: 0, draws: 0, losses: 0 };
    for (const { entries, matches } of results) {
      const entryByPlayer = new Map(entries.map((e) => [e.player_id, e]));
      for (const m of matches) {
        if (isBye(m) || isDrop(m)) continue;
        const outcome = matchRoundOutcome(m);
        // Each side that piloted it (both, in a mirror) counts.
        for (const [playerId, side] of [
          [m.player1_id, "player1"],
          [m.player2_id, "player2"],
        ]) {
          if (!plays(entryByPlayer.get(playerId), id)) continue;
          tallyOutcome(bucket, outcome === "draw" ? "draw" : outcome === side ? "win" : "loss");
        }
      }
    }
    const chips = [];
    const rate = winrate(bucket);
    if (rate) chips.push(chip(`WR ${rate}`, "Winrate su tutti gli eventi", " is-strong"));
    chips.push(chip(`${mine.length} ${mine.length === 1 ? "evento" : "eventi"}`, `Giocato in ${mine.length} ${mine.length === 1 ? "evento" : "eventi"}`));
    const latest = latestEvent(mine);
    chips.push(
      chip(
        `Ultimo: ${eventTitle(latest.event)}`,
        `${eventTitle(latest.event)}, ${formatDate(latest.event.event_date)} — giocato da ${latest.player?.name ?? "—"}`
      )
    );
    setFollowStats("commander", id, chips.join(""));
  }
}

async function fillFollowStats(follows) {
  const playerIds = follows.filter((f) => f.player).map((f) => f.player.id);
  const commanderIds = follows.filter((f) => f.commander).map((f) => f.commander.id);
  await Promise.all([
    playerIds.length ? fillPlayerStats(playerIds) : null,
    commanderIds.length ? fillCommanderStats(commanderIds) : null,
  ]);
}

// ★: unfollowed, and the row slides away (or just goes, with reduced motion).
followsListEl.addEventListener("click", async (e) => {
  const button = e.target.closest(".follow-remove");
  if (!button) return;
  const row = button.closest(".follow-row");
  button.disabled = true;
  try {
    await Follows.unfollow(user.id, row.dataset.kind, row.dataset.id);
  } catch (err) {
    console.error(err);
    button.disabled = false;
    return;
  }
  const remove = () => {
    row.remove();
    updateFollowsEmpty();
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    remove();
    return;
  }
  row.classList.add("is-leaving");
  row.addEventListener("animationend", remove, { once: true });
});

// --- Loading the signed-in view -----------------------------------------------------

// Also kept by id, for the card's live preview of a commander picked in
// edit mode (its name → Scryfall art).
async function loadCommanders() {
  const commanders = await Commanders.list();
  commandersById = new Map(commanders.map((c) => [c.id, c]));
  commanderSelect.innerHTML =
    '<option value="">&mdash; nessuno &mdash;</option>' +
    commanders.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

async function loadSignedIn(sessionUser) {
  user = sessionUser;
  profile = null;
  firstYear = null;
  playerBadges = [];
  setEditing(false, { animate: false });
  accountDangerEl.hidden = true;
  decklistCard.hidden = true;
  followsCard.hidden = true;
  setMessage(accountMessageEl, "");
  try {
    let isAdmin;
    [profile, , , isAdmin] = await Promise.all([Profiles.mine(user.id), loadClaim(), loadCommanders(), MyAccount.isAdmin()]);
    // Admins can't delete their own account from here (nor in the database).
    accountDangerEl.hidden = isAdmin;
    if (claim.linked) await loadStats(claim.linked);
  } catch (err) {
    console.error(err);
    setMessage(pageMessageEl(), "Impossibile caricare il profilo, ricarica la pagina.");
  }
  await loadFollows();
  renderCard(savedValues());
  renderPublicSwitch();
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
      showGoogleButton();
      const loginMessageEl = viewOf("login").querySelector("[data-message]");
      if (loginNotice) {
        setMessage(loginMessageEl, loginNotice, "ok");
        loginNotice = null;
      } else if (isFirst && returnedError()) {
        setMessage(loginMessageEl, "Accesso con Google non riuscito o annullato: riprova.");
      }
    }
    if (isFirst) hidePageLoading();
  }, 0);
});

// --- Sign in with Google's own button ------------------------------------------

// Google Identity Services: Google's button, drawn on this page, signs the
// user in itself and hands its ID token to Supabase (signInWithIdToken) —
// the sign-in never leaves the site, so Google's window names the site
// instead of Supabase's address (the redirect flow below does that). The
// script loads only here, only while the sign-in card is shown; if it's
// blocked or slow (privacy browsers, ad blockers), the redirect button below
// takes its place. Same Google client as Supabase's Google provider (its
// Client ID is public; the secret stays in Supabase); this site's addresses
// are its "Authorized JavaScript origins" (PLAYER_LOGIN.md).
const GOOGLE_CLIENT_ID = "758643767973-5akt6sepj004h3l0qjn1o9tts8nld00g.apps.googleusercontent.com";
const GOOGLE_SCRIPT_TIMEOUT_MS = 5000;
const googleButtonEl = document.getElementById("account-google-gsi");
const googleFallbackBtn = document.getElementById("account-google");

let googleScript = null;

function loadGoogleScript() {
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("gsi_missing")));
    script.onerror = () => reject(new Error("gsi_blocked"));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error("gsi_timeout")), GOOGLE_SCRIPT_TIMEOUT_MS);
  });
  return googleScript;
}

// A one-time value tying Google's token to this attempt, so a token can't be
// replayed: Google gets its SHA-256 (hex), Supabase the value itself, and
// checks they match.
async function newNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

// Draws (or redraws, each with a fresh nonce) Google's button on the
// sign-in card; the fallback instead if Google's script can't be had.
async function showGoogleButton() {
  const loginMessageEl = viewOf("login").querySelector("[data-message]");
  let gsi;
  let nonce;
  try {
    [gsi, nonce] = await Promise.all([loadGoogleScript(), newNonce()]);
  } catch (err) {
    console.error(err);
    googleButtonEl.hidden = true;
    googleFallbackBtn.hidden = false;
    return;
  }
  gsi.initialize({
    client_id: GOOGLE_CLIENT_ID,
    nonce: nonce.hashed,
    // Never signs in by itself: after "Esci" (or on a shared device) only
    // a click signs in again.
    auto_select: false,
    callback: async ({ credential }) => {
      setMessage(loginMessageEl, "");
      const { error } = await sb.auth.signInWithIdToken({ provider: "google", token: credential, nonce: nonce.raw });
      if (error) {
        console.error(error);
        setMessage(loginMessageEl, "Accesso con Google non riuscito, riprova.");
        // The nonce is spent: a fresh button for the next try.
        showGoogleButton();
      }
      // On success the SIGNED_IN event switches to the profile.
    },
  });
  googleButtonEl.hidden = false;
  googleFallbackBtn.hidden = true;
  googleButtonEl.innerHTML = "";
  gsi.renderButton(googleButtonEl, {
    type: "standard",
    theme: document.documentElement.dataset.theme === "dark" ? "filled_black" : "outline",
    size: "large",
    shape: "pill",
    text: "signin_with",
    locale: "it",
    // Google's own limits: 200–400px.
    width: Math.max(200, Math.min(400, Math.floor(googleButtonEl.clientWidth || 320))),
  });
}

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
  // Google's button never signs in by itself (auto_select: false); this also
  // makes Google forget the last choice, if its script was loaded here.
  window.google?.accounts?.id?.disableAutoSelect();
  const { error } = await sb.auth.signOut();
  if (error) {
    console.error(error);
    setMessage(accountMessageEl, "Uscita non riuscita, riprova.");
  }
  // The SIGNED_OUT event switches back to the login view.
});

// Deletes the login account for good (supabase/migrations/006's
// delete_my_account()): its card and pending request go with it, its
// player is unlinked and kept. Signing in with Google again later creates a
// new, empty account.
accountDeleteBtn.addEventListener("click", async () => {
  if (
    !confirm(
      "Eliminare definitivamente il tuo account?\n\nLa tua carta verrà cancellata e il collegamento al tuo giocatore rimosso. Il giocatore e i suoi risultati restano."
    )
  ) {
    return;
  }
  setMessage(accountMessageEl, "");
  accountDeleteBtn.disabled = true;
  try {
    await MyAccount.remove();
  } catch (err) {
    console.error(err);
    accountDeleteBtn.disabled = false;
    setMessage(
      accountMessageEl,
      err?.message === "admin_account"
        ? "Un account amministratore non può essere eliminato da qui."
        : "Eliminazione non riuscita, riprova."
    );
    return;
  }
  accountDeleteBtn.disabled = false;
  loginNotice = "Account eliminato. Puoi accedere di nuovo con Google quando vuoi.";
  // The account no longer exists, so only this browser's session is
  // cleared (a server-side sign-out would just fail); SIGNED_OUT follows.
  await sb.auth.signOut({ scope: "local" });
});
