// account.html — "Profilo": a signed-in account's own profile page. Signed
// out: an "Accedi con Google" card (the first sign-in creates the account).
// Signed in:
//  - "Il tuo giocatore" on top, only while the account isn't linked to a
//    player: the list of players not linked yet to request one, or the
//    pending request (with "Annulla richiesta") — linking itself is the
//    admin's (PLAYER_LOGIN.md);
//  - the player card (left on desktop): Magic-card proportions, the
//    art of a card of the owner's choice (any Magic card, picked from
//    Scryfall's autocomplete — profiles.fav_card, migration 014) as its
//    background, a glow in the favourite colours; the upper part left to the art; a nameplate
//    straight on the art — avatar (the Google picture — hidden by the
//    owner, no circle at all outside edit mode) and name — then, on a glass
//    panel at the bottom (faintly tinted in the favourite colours), the
//    links, then the description (50 characters at most); "Dal <year>" of the linked player's first event at
//    the bottom. The background card is shown only as the art; ✎ edits
//    the card without changing its layout (each value turns into its own
//    field / toggles / text, plus the background card search and "Mostra foto", live
//    preview) and becomes ✓ to save, with ✕ (or Esc) to cancel — saved to
//    the account's own row in `profiles` (migrations 004-006);
//    under it, once linked, the switch showing it on the player page too
//    (js/player-detail.js, migration 007);
//  - beside the card, once linked: the hero's numbers (the player page's own
//    winrate tiles over the whole history plus the leagues played as one
//    more tile) and the link to the player page; "Account" (the Google
//    email, "Esci", and — not for admins — "Elimina account") in the
//    Impostazioni tab.
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
  PlayerClaims,
  Profiles,
  MyAccount,
  Events,
  Decklists,
  EventEntries,
  Matches,
  PlayerProgress,
} from "./db.js";
import { isDrop } from "./leaderboard.js";
import { tallyOutcome, winRatePct, outcomeFor } from "./winrate.js";
import { applyCardCosmetics, openCardEffectsInfo } from "./card-cosmetics.js";
import { escapeHtml, eventTitle, formatDate, softFail, statTileHtml } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";
import { haptic } from "./haptics.js";
import { mountSettings } from "./settings-panel.js";
import { rememberMyPlayer } from "./me-highlight.js";
import {
  applyCardAccents,
  createArtPainter,
  cardArtUrl,
  cardLinksHtml,
  fitCardDescription,
  parseCardLink,
  CARD_LINK_SITES,
} from "./player-card.js";

const ACCOUNT_URL = new URL("account.html", window.location.href).href;
const COLOR_ORDER = ["W", "U", "B", "R", "G"];
// One line, at most this many characters — also enforced by the database
// (migration 012).
const DESCRIPTION_MAX = 50;

// Google's script (loadGoogleScript, in mount): added to the document once,
// kept across visits.
let googleScript = null;

// In-app page (js/router.js): mounted by the router on this page's <main>
// (data-page), on first load and after each in-app navigation; `signal`
// aborts when the page is left (the auth subscription, the Escape key).
// Google's redirect sign-in comes back with a normal load of this page.
export function mount({ signal = new AbortController().signal } = {}) {
  const views = Array.from(document.querySelectorAll("[data-view]"));
  const viewOf = (name) => views.find((v) => v.dataset.view === name);
  const pageMessageEl = () => viewOf("signed-in").querySelector("[data-message]");

  // Player card
  const cardEl = document.getElementById("player-card");
  const artEl = document.getElementById("pc-art");
  const avatarImg = document.getElementById("profile-avatar");
  const initialEl = document.getElementById("profile-initial");
  const nameEl = document.getElementById("profile-name");
  // The same name, big, in the hero beside the card; the background card's
  // art blurred behind it all (styles.css .profile-hero).
  const heroNameEl = document.getElementById("profile-hero-name");
  const bioEl = document.getElementById("profile-bio");
  const sinceEl = document.getElementById("pc-since");
  const linksEl = document.getElementById("pc-links");
  const editToggleBtn = document.getElementById("profile-edit-toggle");
  const editCancelBtn = document.getElementById("profile-edit-cancel");
  const emailEl = document.getElementById("account-email");
  // The same email in the Account section's header (shown while it's closed).

  // The card's edit mode: each value's editable twin, in its place.
  const profileForm = document.getElementById("profile-form");
  const showAvatarInput = document.getElementById("profile-show-avatar");
  const cardInput = document.getElementById("profile-card");
  const cardClearBtn = document.getElementById("profile-card-clear");
  const cardListEl = document.getElementById("profile-card-list");
  const artPickerEl = document.getElementById("profile-art-picker");
  const artStripEl = document.getElementById("profile-art-strip");
  const colorInputs = Array.from(profileForm.querySelectorAll('input[name="profile-color"]'));
  const descriptionEl = document.getElementById("profile-description");
  const counterEl = document.getElementById("profile-counter");
  // One field per site (CARD_LINK_SITES: instagram, moxfield, archidekt, endstep).
  const linkInputs = Object.fromEntries(Object.keys(CARD_LINK_SITES).map((key) => [key, document.getElementById(`profile-${key}`)]));

  // "Il tuo giocatore" (top, until linked)
  const claimCard = document.getElementById("profile-claim");
  const claimBlocks = Array.from(document.querySelectorAll("[data-claim]"));
  const claimMessageEl = document.querySelector("[data-claim-message]");
  const claimSelect = document.getElementById("account-claim-player");
  const pendingPlayerEl = document.getElementById("account-pending-player");

  // The hero's numbers (once linked)
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
  // The background card picked in edit mode (a card name, null for none) —
  // only ever a name chosen from Scryfall's list (or the saved one).
  let pickedCard = null;
  // …and its printing (a Scryfall card id — the "Versione" picked), null for
  // Scryfall's default printing of that card.
  let pickedPrint = null;
  let firstYear = null;
  // The linked player's progress row (player_progress): the card's cosmetics
  // (js/card-cosmetics.js). null: none (not linked, no results, no table).
  let cardProgress = null;

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
  const paintHeroArt = createArtPainter(document.getElementById("profile-hero-art"));

  // --- Player card ------------------------------------------------------------------

  // What the card shows: the saved profile, or — in edit mode — the form's
  // current values (the live preview).
  function savedValues() {
    return {
      colors: profile?.fav_colors ?? "",
      // A card saved before the background could be any card: its favourite
      // commander's (migration 014).
      card: profile?.fav_card ?? profile?.fav_commander?.name ?? null,
      print: (profile?.fav_card && profile?.fav_card_print) || null,
      description: profile?.description ?? "",
      showAvatar: profile?.show_avatar ?? true,
      instagram: profile?.instagram ?? null,
      moxfield: profile?.moxfield ?? null,
      archidekt: profile?.archidekt ?? null,
      endstep: profile?.endstep ?? null,
    };
  }

  function formValues() {
    return {
      colors: COLOR_ORDER.filter((c) => colorInputs.some((i) => i.value === c && i.checked)).join(""),
      card: pickedCard,
      print: pickedPrint,
      description: descriptionEl.value,
      showAvatar: showAvatarInput.checked,
    };
  }

  function renderCard(values) {
    const meta = user.user_metadata ?? {};
    // The linked player's own name once there is one, the Google name before.
    const displayName = claim.linked ? playerLabel(claim.linked) : meta.full_name || meta.name || user.email;
    nameEl.textContent = displayName;
    heroNameEl.textContent = displayName;
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

    const description = values.description.trim();
    bioEl.textContent = description || "Nessuna descrizione: premi ✎ per raccontare qualcosa di te.";
    bioEl.classList.toggle("is-empty", !description);

    // The links: what's saved (the edit fields are only read on save).
    linksEl.innerHTML = cardLinksHtml(savedValues());
    fitCardDescription(cardEl);

    // The player's (not the account's) first event and badges, once linked.
    sinceEl.textContent = claim.linked && firstYear ? `Dal ${firstYear}` : "";

    // After "Dal …" above (the stars go after it); taken off and put back on
    // every redraw.
    applyCardCosmetics(cardEl, claim.linked ? cardProgress : null);

    paintArt(values.card, values.print);
    paintHeroArt(values.card, values.print);
  }

  // --- Edit mode (on the card itself, same layout) -----------------------------------

  function updateCounter() {
    counterEl.textContent = `${descriptionEl.value.length}/${DESCRIPTION_MAX}`;
  }

  // Puts the saved profile into the form (also how "Annulla" discards edits).
  function fillForm() {
    const saved = savedValues();
    showAvatarInput.checked = saved.showAvatar;
    pickedCard = saved.card;
    pickedPrint = saved.print;
    cardInput.value = saved.card ?? "";
    cardClearBtn.hidden = !saved.card;
    closeCardList();
    loadArtPicker();
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
  document.addEventListener(
    "keydown",
    (e) => {
      // Not while a dropdown is open: Escape closes that first.
      if (e.key === "Escape" && isEditing() && !switching && !cardEl.querySelector(".cs-wrap.is-open") && cardListEl.hidden) {
        setEditing(false);
      }
    },
    { signal }
  );

  // Impostazioni: the theme and the vibration — in the tab when signed in,
  // in a card under the sign-in (touch screens) when not.
  mountSettings({
    controlsEl: document.getElementById("profile-settings"),
    aboutEl: document.getElementById("profile-settings-about"),
    signal,
  });
  mountSettings({
    controlsEl: document.getElementById("login-settings"),
    aboutEl: document.getElementById("login-settings-about"),
    signal,
  });

  // --- The sections, one at a time behind tabs -------------------------------------

  // Decklist, Impostazioni: a tab each, only for a section that's shown
  // (styles.css hides the others' tabs) — a pill bar on desktop, a
  // full-width segmented control on phones. Until the user picks one, the
  // first section shown is the open one (the decklist once linked);
  // when the open one goes (e.g. no decklist to send any more), the first
  // still shown takes over.
  const tabButtons = [...document.querySelectorAll(".profile-tab")];
  const tabPanels = tabButtons.map((b) => document.getElementById(b.dataset.tab));
  let currentTab = null;
  let tabChosen = false;

  function selectTab(id) {
    currentTab = id;
    for (const b of tabButtons) {
      const on = b.dataset.tab === id;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    }
    for (const panel of tabPanels) panel.classList.toggle("is-current", panel.id === id);
  }

  function syncTabs() {
    const shown = tabPanels.filter((p) => !p.hidden).map((p) => p.id);
    if (!tabChosen || !shown.includes(currentTab)) selectTab(shown[0] ?? null);
  }

  for (const b of tabButtons) {
    b.addEventListener("click", () => {
      tabChosen = true;
      if (b.dataset.tab !== currentTab) haptic();
      selectTab(b.dataset.tab);
    });
  }
  const tabsObserver = new MutationObserver(syncTabs);
  for (const panel of tabPanels) tabsObserver.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  signal.addEventListener("abort", () => tabsObserver.disconnect(), { once: true });
  syncTabs();

  // "Invia la tua decklist" in the hero: its tab, brought into view.
  document.getElementById("profile-action-decklist").addEventListener("click", () => {
    tabChosen = true;
    selectTab("profile-decklist");
    document.querySelector(".profile-tabs").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  });

  // --- The background card: any Magic card, searched on Scryfall ----------------

  // Scryfall's autocomplete (card names, up to 20) as the user types; a name
  // is only taken when picked from the list (click, or ↑↓ + Enter) — typed
  // text alone is put back to the picked card when the field is left. Picking
  // redraws the card (its art) right away; × clears it.
  const CARD_SEARCH_MIN = 2;
  const CARD_SEARCH_DELAY_MS = 200;
  let cardSearchTimer = 0;
  let cardSearchToken = 0;
  let cardOptions = [];
  let cardHighlight = -1;

  function closeCardList() {
    cardListEl.hidden = true;
    cardListEl.innerHTML = "";
    cardInput.setAttribute("aria-expanded", "false");
    cardOptions = [];
    cardHighlight = -1;
  }

  function renderCardList() {
    cardListEl.innerHTML = cardOptions.length
      ? cardOptions
          .map(
            (name, i) =>
              `<button type="button" class="pc-card-option${i === cardHighlight ? " is-highlighted" : ""}" role="option" data-i="${i}" tabindex="-1">${escapeHtml(name)}</button>`
          )
          .join("")
      : '<p class="pc-card-empty">Nessuna carta trovata.</p>';
    cardListEl.hidden = false;
    cardInput.setAttribute("aria-expanded", "true");
  }

  function pickCard(name) {
    // A new card starts on its default art.
    if (name !== pickedCard) pickedPrint = null;
    pickedCard = name;
    cardInput.value = name ?? "";
    cardClearBtn.hidden = !name;
    closeCardList();
    renderCard(formValues());
    loadArtPicker();
  }

  // "Versione": the picked card's different illustrations (Scryfall's search,
  // one result per illustration, oldest first), as a strip of small art
  // crops — only when there's more than one. The one in use is marked: the
  // picked printing's, else the one of Scryfall's default printing (that
  // name's own lookup). Picking one redraws the card with it.
  const ART_PICKER_MAX = 60;
  const artPrintsCache = new Map();
  let artPickerToken = 0;

  function fetchArtPrints(name) {
    if (!artPrintsCache.has(name)) {
      const q = encodeURIComponent(`!"${name}"`);
      artPrintsCache.set(
        name,
        Promise.all([
          fetch(`https://api.scryfall.com/cards/search?q=${q}&unique=art&order=released&dir=asc`)
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((json) => (json.data ?? []).filter(cardArtUrl).slice(0, ART_PICKER_MAX)),
          fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((card) => card?.illustration_id ?? card?.card_faces?.[0]?.illustration_id ?? null),
        ]).catch(() => [[], null])
      );
    }
    return artPrintsCache.get(name);
  }

  function markArtInUse() {
    for (const option of artStripEl.children) {
      const on = pickedPrint ? option.dataset.id === pickedPrint : option.dataset.default === "true";
      option.classList.toggle("is-selected", on);
      option.setAttribute("aria-selected", String(on));
    }
  }

  async function loadArtPicker() {
    const token = ++artPickerToken;
    const name = pickedCard;
    if (!name) {
      artPickerEl.hidden = true;
      artStripEl.innerHTML = "";
      return;
    }
    const [prints, defaultIllustration] = await fetchArtPrints(name);
    if (token !== artPickerToken) return;
    artPickerEl.hidden = prints.length < 2;
    artStripEl.innerHTML = prints
      .map((card) => {
        const illustration = card.illustration_id ?? card.card_faces?.[0]?.illustration_id;
        const label = `${card.set_name} (${(card.released_at ?? "").slice(0, 4)})`;
        return `<button type="button" class="pc-art-option" role="option" data-id="${escapeHtml(card.id)}" data-default="${
          illustration && illustration === defaultIllustration
        }" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><img src="${escapeHtml(cardArtUrl(card))}" alt="" loading="lazy" draggable="false"></button>`;
      })
      .join("");
    markArtInUse();
    artStripEl.querySelector(".is-selected")?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  artStripEl.addEventListener("click", (e) => {
    const option = e.target.closest(".pc-art-option");
    if (!option) return;
    pickedPrint = option.dataset.id;
    markArtInUse();
    renderCard(formValues());
  });

  cardInput.addEventListener("input", () => {
    clearTimeout(cardSearchTimer);
    const q = cardInput.value.trim();
    if (q.length < CARD_SEARCH_MIN) {
      closeCardList();
      return;
    }
    cardSearchTimer = setTimeout(async () => {
      const token = ++cardSearchToken;
      let names = [];
      try {
        const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
        names = res.ok ? ((await res.json()).data ?? []) : [];
      } catch (err) {
        console.error(err);
      }
      // A slower earlier answer doesn't replace a newer one.
      if (token !== cardSearchToken || document.activeElement !== cardInput) return;
      cardOptions = names;
      cardHighlight = names.length ? 0 : -1;
      renderCardList();
    }, CARD_SEARCH_DELAY_MS);
  });

  cardInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      // Never submits the card from here.
      e.preventDefault();
      if (cardHighlight >= 0) pickCard(cardOptions[cardHighlight]);
      return;
    }
    if (e.key === "Escape" && !cardListEl.hidden) {
      closeCardList();
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && cardOptions.length) {
      e.preventDefault();
      const n = cardOptions.length;
      cardHighlight = (cardHighlight + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      renderCardList();
      cardListEl.querySelector(".is-highlighted")?.scrollIntoView({ block: "nearest" });
    }
  });

  // mousedown, not click: picked before the field loses focus (its blur
  // puts the text back).
  cardListEl.addEventListener("mousedown", (e) => {
    const option = e.target.closest(".pc-card-option");
    if (!option) return;
    e.preventDefault();
    pickCard(cardOptions[Number(option.dataset.i)]);
  });

  cardInput.addEventListener("blur", () => {
    closeCardList();
    cardInput.value = pickedCard ?? "";
  });

  cardClearBtn.addEventListener("click", () => {
    pickCard(null);
    cardInput.focus();
  });

  // Live preview: every change in edit mode redraws the card from the form.
  profileForm.addEventListener("change", () => renderCard(formValues()));

  // The description stays on one line: Enter adds no line break, and a pasted
  // text's breaks become spaces (the database refuses them too). The
  // textarea's own maxlength keeps it to DESCRIPTION_MAX.
  descriptionEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  descriptionEl.addEventListener("input", () => {
    if (/[\r\n]/.test(descriptionEl.value)) {
      const caret = descriptionEl.selectionStart;
      descriptionEl.value = descriptionEl.value.replace(/\s*[\r\n]+\s*/g, " ").slice(0, DESCRIPTION_MAX);
      descriptionEl.setSelectionRange(caret, caret);
    }
    updateCounter();
  });

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
      fav_card: values.card,
      fav_card_print: values.card ? values.print : null,
      // The older favourite commander: replaced by fav_card (migration 014).
      fav_commander_id: null,
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
  // migration 007's public_player_card()). Only while linked to a
  // player (no player page otherwise), and usable only once the card has
  // been saved at least once — before that there's no profile at all, and
  // nothing to show; on by default from the first save. Saved right away.
  function renderPublicSwitch(errorText = "") {
    publicWrapEl.hidden = !claim.linked;
    const saved = Boolean(profile);
    publicInput.disabled = !saved;
    publicInput.checked = saved && (profile.show_on_player_page ?? true);
    // Not saved yet: what to do first takes the label's place.
    publicLabelEl.textContent = saved ? "Mostra nella pagina giocatore" : "Salva prima la tua carta almeno una volta.";
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

  // request_player_claim()'s error codes (migration 002).
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
  // `linkedRequest`: the linked player's request, when already started
  // (loadSignedIn).
  async function loadClaim(linkedRequest = PlayerClaims.linkedPlayer(user.id)) {
    const linked = await linkedRequest;
    // The "Tu" pill's player (js/me-highlight.js) kept in step: this is where
    // a link approved or removed by the admin shows first.
    rememberMyPlayer(user.id, linked?.id ?? null);
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

  // --- The hero's numbers -----------------------------------------------------------

  // Same figures as the player page's own tiles (js/player-detail.js), over the
  // player's whole history: match-basis winrate, a bye counts as a win, a drop
  // isn't a match at all; "Eventi" counts entries (an event counts even if the
  // player dropped before playing).

  // Everything the linked player's parts need, in one round: the stats, the
  // card's badges and cosmetics, "Invia la tua decklist"'s events and sends.
  // `upcomingRequest`: Events.listUpcoming(), when already started
  // (loadSignedIn).
  async function loadStats(player, { upcomingRequest = null } = {}) {
    statsLink.href = `player.html?id=${player.id}`;
    // The card's cosmetics: never fatal (a card without them).
    const progressRequest = softFail(PlayerProgress.get(player.id), null);
    // Handled by loadDecklistCard (a failure: no card); the no-op catch only
    // marks it handled meanwhile.
    const decklistRequest = Promise.all([upcomingRequest ?? Events.listUpcoming(), Decklists.sentEvents(player.id)]);
    decklistRequest.catch(() => {});
    const [entries, { asP1, asP2 }] = await Promise.all([
      EventEntries.listByPlayer(player.id),
      Matches.listByPlayer(player.id),
    ]);

    const bucket = { wins: 0, draws: 0, losses: 0 };
    for (const m of asP1) if (!isDrop(m)) tallyOutcome(bucket, outcomeFor(m, true));
    for (const m of asP2) if (!isDrop(m)) tallyOutcome(bucket, outcomeFor(m, false));

    // The hero's numbers: Winrate, Leghe (the leagues, open or closed, with at
    // least one closed event played), Eventi — the player page's tiles' look
    // (styles.css .profile-hero .stat-tile), not its whole set (no wins /
    // draws / losses here). No match played yet: just a line.
    const played = bucket.wins + bucket.draws + bucket.losses;
    const rate = winRatePct(bucket.wins, played);
    const leagueIds = new Set(
      entries.filter((e) => e.event && !e.event.is_open && e.event.league).map((e) => e.event.league.id)
    );
    statsTilesEl.innerHTML =
      rate === null
        ? '<p class="page-empty">Non ci sono ancora dati sufficienti.</p>'
        : statTileHtml("Winrate", `${rate}%`) + statTileHtml("Leghe", leagueIds.size) + statTileHtml("Eventi", entries.length);

    // The player card's "Dal …": the year of the player's first event.
    const firstDate = entries.reduce((min, e) => {
      const d = e.event?.event_date;
      return d && (!min || d < min) ? d : min;
    }, null);
    firstYear = firstDate ? firstDate.slice(0, 4) : null;

    cardProgress = await progressRequest;

    // "Invia la tua decklist" needs the same entries (the closed events played).
    await loadDecklistCard(player, entries, decklistRequest);
  }

  // "?" on the card's corner: how the card's effects are earned.
  document.getElementById("card-effects-help").addEventListener("click", openCardEffectsInfo);

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
  // player and event (migrations 008-009). The function checks it
  // all again; this only offers the events that qualify and shows the ones
  // already sent; a send goes straight away (no confirmation, by choice).
  const decklistCard = document.getElementById("profile-decklist");
  const decklistNoneEl = document.getElementById("decklist-none");
  const decklistForm = document.getElementById("decklist-form");
  const decklistEventSelect = document.getElementById("decklist-event");
  const decklistText = document.getElementById("decklist-text");
  const decklistMeter = document.getElementById("decklist-meter");
  const decklistSubmit = document.getElementById("decklist-submit");
  const decklistSubmitLabel = decklistSubmit.querySelector(".decklist-submit-label");
  const decklistMessageEl = document.getElementById("decklist-message");
  const decklistSentBox = document.getElementById("decklist-sent");
  const decklistSentList = document.getElementById("decklist-sent-list");

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

  // `request`: [upcoming events, the player's sends] (loadStats starts it).
  async function loadDecklistCard(player, entries, request) {
    decklistCard.hidden = false;
    setMessage(decklistMessageEl, "");
    let upcoming;
    let sent;
    try {
      [upcoming, sent] = await request;
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

  // Sending: the button says so and pulses, and can't be pressed twice.
  function setDecklistSending(sending) {
    decklistSubmit.disabled = sending;
    decklistSubmit.classList.toggle("is-sending", sending);
    decklistSubmitLabel.textContent = sending ? "Invio in corso…" : "Invia decklist";
  }

  decklistText.addEventListener("input", updateDecklistMeter);

  // Sent straight away — no confirmation step (since 2026-10-28).
  decklistForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (decklistSubmit.disabled) return;
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
    setDecklistSending(true);
    try {
      await Decklists.send(ev.id, decklistText.value);
    } catch (err) {
      console.error(err);
      setDecklistSending(false);
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
    recordDecklistSend(ev, (decklistSendCount.get(ev.id) ?? 0) + 1);
    decklistText.value = "";
    updateDecklistMeter();
    renderDecklistCard();
    setMessage(decklistMessageEl, `Decklist inviata per ${eventTitle(ev)}.`, "ok");
  });

  // --- Loading the signed-in view -----------------------------------------------------

  // Also kept by id, for the card's live preview of a commander picked in
  // edit mode (its name → Scryfall art).
  async function loadSignedIn(sessionUser) {
    user = sessionUser;
    profile = null;
    firstYear = null;
    cardProgress = null;
    setEditing(false, { animate: false });
    accountDangerEl.hidden = true;
    decklistCard.hidden = true;
    setMessage(accountMessageEl, "");
    // Two rounds: everything that needs only the account, at once — the
    // profile, the linked player (or the claim), admin or not,
    // the upcoming events (the decklist card's) — then, once the linked
    // player is known, all of its parts together (loadStats). The no-op
    // catches only mark the early ones handled until they're awaited.
    const linkedRequest = PlayerClaims.linkedPlayer(user.id);
    const upcomingRequest = Events.listUpcoming();
    for (const request of [linkedRequest, upcomingRequest]) request.catch(() => {});
    try {
      let isAdmin;
      [profile, , isAdmin] = await Promise.all([Profiles.mine(user.id), loadClaim(linkedRequest), MyAccount.isAdmin()]);
      // Admins can't delete their own account from here (nor in the database).
      accountDangerEl.hidden = isAdmin;
      if (claim.linked) await loadStats(claim.linked, { upcomingRequest });
    } catch (err) {
      console.error(err);
      setMessage(pageMessageEl(), "Impossibile caricare il profilo, ricarica la pagina.");
    }
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

  // (Each visit subscribes anew — supabase-js reports the current session to
  // a new subscriber straight away — and unsubscribes on leaving.)
  let firstEvent = true;
  const {
    data: { subscription },
  } = sb.auth.onAuthStateChange((_event, session) => {
    const isFirst = firstEvent;
    firstEvent = false;
    // Deferred: supabase-js freezes if another Supabase call is awaited inside
    // its own auth-change callback (loadSignedIn makes several).
    setTimeout(async () => {
      if (signal.aborted) return;
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
      if (isFirst) hidePageLoading(signal);
    }, 0);
  });
  signal.addEventListener("abort", () => subscription.unsubscribe(), { once: true });

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

  // Deletes the login account for good (migration 006's
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
}
