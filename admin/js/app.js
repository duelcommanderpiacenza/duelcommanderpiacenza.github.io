import { getSession, signIn, signOut, onAuthChange } from "./auth.js";
import { initPlayersAdmin } from "./players-admin.js";
import { initCommandersAdmin } from "./commanders-admin.js";
import { initLeaguesAdmin } from "./leagues-admin.js";
import { initEventsAdmin } from "./events-admin.js";
import { initEntriesAdmin } from "./entries-admin.js";
import { initMatchesAdmin } from "./matches-admin.js";

const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const whoamiEl = document.getElementById("whoami");
const logoutBtn = document.getElementById("logout-btn");

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

// Shows one subview and re-triggers its entrance animation every time
// (removing the class, forcing a reflow, then re-adding it) since simply
// toggling `hidden` wouldn't replay a CSS `animation` on its own.
function showSubview(target) {
  [subviewLeaguesList, subviewLeagueDetail, subviewEventDetail, subviewMatchesDetail].forEach((el) => {
    el.hidden = el !== target;
  });
  target.classList.remove("subview-enter");
  void target.offsetWidth;
  target.classList.add("subview-enter");
}

function showLeaguesListSubview() {
  showSubview(subviewLeaguesList);
}

function showLeagueDetailSubview() {
  showSubview(subviewLeagueDetail);
}

function showEventDetailSubview() {
  showSubview(subviewEventDetail);
}

function showMatchesDetailSubview() {
  showSubview(subviewMatchesDetail);
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
    initPlayersAdmin();
    initCommandersAdmin();

    const entriesCtl = initEntriesAdmin();
    const matchesCtl = initMatchesAdmin();

    const eventsCtl = initEventsAdmin({
      onOpenEvent: (event) => {
        currentEvent = event;
        eventDetailTitle.textContent = event.name;
        entriesCtl.openEvent(event);
        showEventDetailSubview();
      },
    });

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
      showLeagueDetailSubview();
    });

    openMatchesBtn.addEventListener("click", () => {
      if (!currentEvent) return;
      matchesDetailTitle.textContent = `${currentEvent.name} — Partite`;
      matchesCtl.openEvent(currentEvent);
      showMatchesDetailSubview();
    });

    matchesDetailBack.addEventListener("click", (e) => {
      e.preventDefault();
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
