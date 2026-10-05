import { Events } from "../../js/db.js";
import { getSession, signIn, signOut, isAdmin, onAuthChange } from "./auth.js";
import { setupThemeToggle } from "../../js/theme.js";
import { eventTitle } from "../../js/ui.js";
import { enhanceSelects } from "../../js/custom-select.js";
import { enhanceDateInputs } from "../../js/custom-date.js";
import { setStatusToggle } from "./crud-ui.js";
import { emit } from "./bus.js";
import { initPlayersAdmin } from "./players-admin.js";
import { initCommandersAdmin } from "./commanders-admin.js";
import { initBadgesAdmin } from "./badges-admin.js";
import { initLeaguesAdmin } from "./leagues-admin.js";
import { initEventsAdmin } from "./events-admin.js";
import { initStandaloneEventsAdmin } from "./standalone-events-admin.js";
import { initAnnouncementsAdmin } from "./announcements-admin.js";
import { initUsersAdmin } from "./users-admin.js";
import { initEntriesAdmin } from "./entries-admin.js";
import { initMatchesAdmin } from "./matches-admin.js";
import { initAdminNavDropdown } from "./admin-nav-dropdown.js";
import { syncAutoBadges } from "./badges-sync.js";

const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
const adminTabsBar = document.getElementById("admin-tabs-bar");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const whoamiEl = document.getElementById("whoami");
const logoutBtn = document.getElementById("logout-btn");

const adminTabsView = document.getElementById("admin-tabs-view");
const adminEventFlow = document.getElementById("admin-event-flow");
const subviewLeaguesList = document.getElementById("subview-leagues-list");
const subviewLeagueDetail = document.getElementById("subview-league-detail");
const subviewEventDetail = document.getElementById("subview-event-detail");
const subviewMatchesDetail = document.getElementById("subview-matches-detail");
const leagueDetailTitle = document.getElementById("league-detail-title");
const leagueDetailBack = document.getElementById("league-detail-back");
const eventFlowTitle = document.getElementById("event-flow-title");
const eventFlowBack = document.getElementById("event-flow-back");
const eventFlowToggleBtn = document.getElementById("event-flow-toggle-open");
const eventFlowSwitch = document.getElementById("event-flow-switch");

let modulesInitialized = false;
let currentEvent = null;
// The event view on screen ("entries" or "matches"), and a counter bumped by
// every request to change what the event flow shows — a view whose data
// arrives after a newer request (another switch, back, a tab) is dropped
// instead of shown.
let shownView = null;
let viewRequest = 0;

// Re-triggers a CSS entrance animation (removing the class, forcing a
// reflow, then re-adding it), since simply toggling `hidden` wouldn't replay
// it on its own.
function replayAnimation(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// Shows one subview of the leagues pyramid and replays its entrance
// animation. The event flow lives in its own top-level container with its
// own views (below) — toggling one must never touch the other's `hidden`
// state, or returning from the event flow would leave the leagues panel's
// own subviews stuck hidden.
function showSubview(group, target) {
  group.forEach((el) => {
    el.hidden = el !== target;
  });
  replayAnimation(target, "subview-enter");
}

const leaguesSubviews = [subviewLeaguesList, subviewLeagueDetail];
const eventViews = { entries: subviewEventDetail, matches: subviewMatchesDetail };

// The Giocatori/Partite switch: data-active moves its red pill (CSS), the
// classes/aria mark the current option.
function setSwitch(view) {
  eventFlowSwitch.dataset.active = view;
  eventFlowSwitch.querySelectorAll("[data-view]").forEach((btn) => {
    const active = btn.dataset.view === view;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

// direction "left"/"right": the view slides in from that side (a switch);
// null: no animation of its own (entering the flow animates it as a whole).
function showEventView(view, direction) {
  for (const [name, el] of Object.entries(eventViews)) el.hidden = name !== view;
  shownView = view;
  const el = eventViews[view];
  el.classList.remove("view-enter-left", "view-enter-right");
  if (direction) replayAnimation(el, `view-enter-${direction}`);
}

// Drilling into an event works the same whether it came from inside a
// league or from the standalone events list, so both hand off to this one
// shared flow — hiding the tab area (whichever tab/subview was active there
// is left untouched, so "back" just reveals it again).
function enterEventFlow() {
  adminTabsView.hidden = true;
  adminEventFlow.hidden = false;
  replayAnimation(adminEventFlow, "subview-enter");
}

// Also cancels a view still loading, so it can't pop up over the list.
function exitEventFlow() {
  viewRequest += 1;
  adminEventFlow.hidden = true;
  adminTabsView.hidden = false;
}

function showLeaguesListSubview() {
  showSubview(leaguesSubviews, subviewLeaguesList);
}

function showLeagueDetailSubview() {
  showSubview(leaguesSubviews, subviewLeagueDetail);
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll(".admin-tab"));
  const panels = Array.from(document.querySelectorAll(".admin-panel"));
  const pageTitle = document.getElementById("admin-page-title");

  // The heading and browser tab title said "Gestione dati" everywhere,
  // regardless of which tab was open — swap in the clicked tab's own label
  // (its button text is already the exact name to show) instead.
  function setActiveTab(tab) {
    tabs.forEach((t) => t.classList.remove("is-active"));
    panels.forEach((p) => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("is-active");
    pageTitle.textContent = tab.textContent;
    document.title = `${tab.textContent} - Duel Commander Piacenza Admin`;
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // The tab bar is reachable from anywhere, including while drilled
      // into an event — back out of that flow first so the clicked panel is
      // actually visible (and so an event still loading doesn't open over
      // it afterwards).
      exitEventFlow();
      setActiveTab(tab);
    });
  });
  if (tabs[0]) setActiveTab(tabs[0]);
}

function showAdmin(session) {
  loginView.style.display = "none";
  adminView.style.display = "block";
  adminTabsBar.style.display = "block";
  whoamiEl.textContent = session.user.email;

  if (!modulesInitialized) {
    initTabs();
    initBadgesAdmin();
    initPlayersAdmin();
    initCommandersAdmin();
    initAnnouncementsAdmin();
    initUsersAdmin();

    const entriesCtl = initEntriesAdmin();
    const matchesCtl = initMatchesAdmin();
    const viewCtls = { entries: entriesCtl, matches: matchesCtl };

    // Loads a view's data before it goes on screen, so it appears once with
    // its content in place instead of empty (or still showing the previous
    // event) and then filling in. False if a newer request superseded it
    // while it loaded.
    async function loadEventView(view) {
      const request = ++viewRequest;
      try {
        await viewCtls[view].openEvent(currentEvent);
      } catch (err) {
        console.error(err);
      }
      return request === viewRequest;
    }

    async function openEvent(event) {
      currentEvent = event;
      eventFlowTitle.textContent = eventTitle(event);
      setStatusToggle(eventFlowToggleBtn, event.is_open, "event");
      // Set while the flow is still hidden, so the switch's pill jumps
      // straight to Giocatori instead of sliding there from last time.
      setSwitch("entries");
      if (!(await loadEventView("entries"))) return;
      showEventView("entries", null);
      enterEventFlow();
    }

    // The pill moves at once (immediate feedback); the content swaps once
    // the new view's data is in, sliding in from the side of the option
    // clicked. Picking the view already on screen cancels a switch still
    // loading.
    async function switchEventView(view) {
      if (!currentEvent) return;
      setSwitch(view);
      if (view === shownView) {
        viewRequest += 1;
        return;
      }
      if (!(await loadEventView(view))) return;
      showEventView(view, view === "matches" ? "right" : "left");
    }

    eventFlowSwitch.addEventListener("click", (e) => {
      const option = e.target.closest("[data-view]");
      if (option) switchEventView(option.dataset.view);
    });

    // currentEvent is the one object both entriesCtl and matchesCtl were
    // handed, so updating it here and re-running each module's own refresh
    // keeps both views in sync, whichever is on screen.
    async function toggleEventOpen() {
      if (!currentEvent) return;
      const wasOpen = currentEvent.is_open;
      try {
        const updated = await Events.update(currentEvent.id, { is_open: !wasOpen });
        currentEvent.is_open = updated.is_open;
        setStatusToggle(eventFlowToggleBtn, currentEvent.is_open, "event");
        entriesCtl.openEvent(currentEvent);
        matchesCtl.refreshOpenState();
        emit("events:changed");
        // Closed or reopened — see events-admin.js's own onToggleOpen for
        // why both count, and why this is fire-and-forget.
        syncAutoBadges().catch(console.error);
      } catch (err) {
        console.error(err);
      }
    }

    eventFlowToggleBtn.addEventListener("click", toggleEventOpen);

    const eventsCtl = initEventsAdmin({ onOpenEvent: openEvent });
    initStandaloneEventsAdmin({ onOpenEvent: openEvent });

    initLeaguesAdmin({
      onOpenLeague: (league) => {
        leagueDetailTitle.textContent = league.name;
        eventsCtl.openLeague(league);
        showLeagueDetailSubview();
      },
    });

    leagueDetailBack.addEventListener("click", (e) => {
      e.preventDefault();
      showLeaguesListSubview();
    });

    // Back returns to the list the event was opened from — exitEventFlow
    // just reveals the tab area as it was left: the league's event list for
    // a league event, Eventi singoli for a standalone one (the only two
    // places an event can be opened from).
    eventFlowBack.addEventListener("click", (e) => {
      e.preventDefault();
      exitEventFlow();
    });

    showLeaguesListSubview();

    modulesInitialized = true;
  }
}

function showLogin() {
  adminView.style.display = "none";
  adminTabsBar.style.display = "none";
  loginView.style.display = "flex";
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    await signIn(email, password);
  } catch (err) {
    loginError.textContent = "Credenziali non valide.";
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut();
});

// A signed-in account that isn't in the admins table (a player) never sees
// the admin UI — the database would refuse its writes anyway. It stays on
// the login form with a message, but isn't signed out: the session is
// shared with the public site, where it's the player's own login. Signing
// in here with the admin's credentials replaces it. If the check itself
// fails, same thing: never show the admin without a positive answer.
async function handleSession(session) {
  if (!session) {
    showLogin();
    return;
  }
  let allowed = false;
  try {
    allowed = await isAdmin();
  } catch (err) {
    console.error(err);
    showLogin();
    loginError.textContent = "Impossibile verificare l'account, riprova.";
    return;
  }
  if (allowed) {
    showAdmin(session);
    return;
  }
  showLogin();
  loginError.textContent = `${session.user.email} non è un account amministratore.`;
}

onAuthChange(handleSession);

getSession().then(handleSession);

setupThemeToggle();
enhanceSelects();
enhanceDateInputs();
initAdminNavDropdown();
