// Touch screens (html.nav-mobile): the admin's tabs as a tab bar at the
// bottom of the screen, like the public site's (js/tab-bar.js) — a solid
// capsule with every tab always in view: the open one a red chip with its
// icon and short name, the others their icon only (admin.css "Tab bar").
// The same .admin-tab buttons as the computer's top row (js/app.js switches
// the panels), given here an icon and a short name each; a count (Utenti's
// pending requests, js/tab-counts.js) sits on its icon's corner.
//
// The bar slides away while the page scrolls down, back as soon as it
// scrolls up (.is-scrolled-away). (The file's name is from the old pill
// and its list this replaced.)

import { tabLabel } from "./tab-counts.js";

function isMobileNav() {
  return navigator.maxTouchPoints > 0;
}

const svg = (body) =>
  `<svg class="admin-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// tab -> [short name, icon]
const TABS = {
  players: ["Giocatori", svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>')],
  commanders: ["Comandanti", svg('<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z"></path>')],
  badges: ["Badge", svg('<circle cx="12" cy="9" r="6"></circle><path d="M8.5 14 7 21l5-2.5 5 2.5-1.5-7"></path>')],
  leagues: ["Leghe", svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"></path><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"></path>')],
  "standalone-events": ["Eventi", svg('<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>')],
  announcements: ["Annunci", svg('<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"></path><path d="M16 9a3 3 0 0 1 0 6M19 6.5a7 7 0 0 1 0 11"></path>')],
  users: ["Utenti", svg('<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"></path>')],
};

export function initAdminNavDropdown() {
  // Self-healing fallback for the inline head script's own check — see
  // js/nav-dropdown.js for why (a DevTools device-emulation reload can
  // have the touch/hover override land a beat after that first script).
  if (!document.documentElement.classList.contains("nav-mobile") && isMobileNav()) {
    document.documentElement.classList.add("nav-mobile");
  }
  if (!document.documentElement.classList.contains("nav-mobile")) return;

  const bar = document.getElementById("admin-tabs-bar");
  if (!bar) return;

  // Each tab: its icon (the count, if any, on it) and its short name — the
  // full label kept for the page title (tabLabel) and screen readers.
  bar.querySelectorAll(".admin-tab").forEach((tab) => {
    const [short, icon] = TABS[tab.dataset.tab] ?? [tabLabel(tab), ""];
    if (!tab.querySelector(".admin-tab-label")) {
      const label = document.createElement("span");
      label.className = "admin-tab-label";
      label.textContent = tab.textContent.trim();
      tab.textContent = "";
      tab.append(label);
    }
    tab.setAttribute("aria-label", tabLabel(tab));
    const iconWrap = document.createElement("span");
    iconWrap.className = "admin-tab-icon-wrap";
    iconWrap.innerHTML = icon;
    const count = tab.querySelector(".admin-tab-count");
    if (count) iconWrap.append(count);
    const shortEl = document.createElement("span");
    shortEl.className = "admin-tab-short";
    shortEl.textContent = short;
    tab.prepend(iconWrap);
    tab.append(shortEl);
    // A tab picked: the bar back in view.
    tab.addEventListener("click", () => {
      bar.classList.remove("is-scrolled-away");
      lastY = window.scrollY;
    });
  });

  // The bar slides away while the page scrolls down and comes back as soon
  // as it scrolls up — always shown near the top, at the bottom of a short
  // page hidden too (it would sit over the end). Moves under SCROLL_SLACK px
  // ignored (a finger's jitter), checked once per frame.
  const SCROLL_SLACK = 8;
  const SHOW_NEAR_TOP = 80;
  let lastY = window.scrollY;
  let queued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const y = window.scrollY;
        if (Math.abs(y - lastY) < SCROLL_SLACK) return;
        const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 2;
        bar.classList.toggle("is-scrolled-away", y > lastY && (y > SHOW_NEAR_TOP || atBottom));
        lastY = y;
      });
    },
    { passive: true }
  );
}
