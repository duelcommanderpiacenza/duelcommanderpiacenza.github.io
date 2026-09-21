import { getSession, signIn, signOut, onAuthChange } from "./auth.js";
import { setupThemeToggle } from "../../js/theme.js";
import { eventTitle } from "../../js/ui.js";
import { enhanceSelects } from "../../js/custom-select.js";
import { enhanceDateInputs } from "../../js/custom-date.js";
import { initPlayersAdmin } from "./players-admin.js";
import { initCommandersAdmin } from "./commanders-admin.js";
import { initBadgesAdmin } from "./badges-admin.js";
import { initLeaguesAdmin } from "./leagues-admin.js";
import { initEventsAdmin } from "./events-admin.js";
import { initStandaloneEventsAdmin } from "./standalone-events-admin.js";
import { initEntriesAdmin } from "./entries-admin.js";
import { initMatchesAdmin } from "./matches-admin.js";

const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
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
const eventDetailTitle = document.getElementById("event-detail-title");
const matchesDetailTitle = document.getElementById("matches-detail-title");
const leagueDetailBack = document.getElementById("league-detail-back");
const eventDetailBack = document.getElementById("event-detail-back");
const matchesDetailBack = document.getElementById("matches-detail-back");
const openMatchesBtn = document.getElementById("open-matches-btn");

let modulesInitialized = false;
let currentEvent = null;

// Shows one subview among a group and re-triggers its entrance animation
// every time (removing the class, forcing a reflow, then re-adding it)
// since simply toggling `hidden` wouldn't replay a CSS `animation` on its
// own. The leagues pyramid and the shared entries/matches flow are two
// separate groups now that they live in separate top-level containers —
// toggling one must never touch the other's `hidden` state, or returning
// from the event flow would leave the leagues panel's own subviews stuck
// hidden (this used to be a single group spanning both, which did exactly
// that).
function showSubview(group, target) {
  group.forEach((el) => {
    el.hidden = el !== target;
  });
  target.classList.remove("subview-enter");
  void target.offsetWidth;
  target.classList.add("subview-enter");
}

const leaguesSubviews = [subviewLeaguesList, subviewLeagueDetail];
const eventFlowSubviews = [subviewEventDetail, subviewMatchesDetail];

// Drilling into an event's entries/matches works the same whether the event
// came from inside a league or from the standalone events list, so both
// paths hand off to this one shared flow — hiding the tab area (whichever
// tab/subview was active there is left untouched, so "back" just reveals it
// again) and showing the entries/matches subviews in its place.
function enterEventFlow() {
  adminTabsView.hidden = true;
  adminEventFlow.hidden = false;
  showEventDetailSubview();
}

function exitEventFlow() {
  adminEventFlow.hidden = true;
  adminTabsView.hidden = false;
}

function showLeaguesListSubview() {
  showSubview(leaguesSubviews, subviewLeaguesList);
}

function showLeagueDetailSubview() {
  showSubview(leaguesSubviews, subviewLeagueDetail);
}

function showEventDetailSubview() {
  showSubview(eventFlowSubviews, subviewEventDetail);
}

function showMatchesDetailSubview() {
  showSubview(eventFlowSubviews, subviewMatchesDetail);
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll(".admin-tab"));
  const panels = Array.from(document.querySelectorAll(".admin-panel"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      panels.forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add("is-active");
    });
  });
  tabs[0]?.classList.add("is-active");
  panels[0]?.classList.add("is-active");
}

function showAdmin(session) {
  loginView.style.display = "none";
  adminView.style.display = "block";
  whoamiEl.textContent = session.user.email;

  if (!modulesInitialized) {
    initTabs();
    initBadgesAdmin();
    initPlayersAdmin();
    initCommandersAdmin();

    const entriesCtl = initEntriesAdmin();
    const matchesCtl = initMatchesAdmin();

    function openEvent(event) {
      currentEvent = event;
      eventDetailTitle.textContent = eventTitle(event);
      entriesCtl.openEvent(event);
      enterEventFlow();
    }

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

    eventDetailBack.addEventListener("click", (e) => {
      e.preventDefault();
      exitEventFlow();
    });

    openMatchesBtn.addEventListener("click", () => {
      if (!currentEvent) return;
      matchesDetailTitle.textContent = `${eventTitle(currentEvent)} — Partite`;
      matchesCtl.openEvent(currentEvent);
      showMatchesDetailSubview();
    });

    matchesDetailBack.addEventListener("click", (e) => {
      e.preventDefault();
      // currentEvent is the same object reference matchesCtl was handed, so
      // an open/close toggle made there is already reflected on it — just
      // re-run openEvent to refresh the entries form's locked state and list.
      if (currentEvent) entriesCtl.openEvent(currentEvent);
      showEventDetailSubview();
    });

    showLeaguesListSubview();

    modulesInitialized = true;
  }
}

function showLogin() {
  adminView.style.display = "none";
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

onAuthChange((session) => {
  if (session) showAdmin(session);
  else showLogin();
});

getSession().then((session) => {
  if (session) showAdmin(session);
  else showLogin();
});

setupThemeToggle();
enhanceSelects();
enhanceDateInputs();
