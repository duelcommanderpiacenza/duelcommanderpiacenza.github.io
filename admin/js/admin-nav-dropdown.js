// Mobile-only admin nav dropdown — same pattern as the public site's
// js/nav-dropdown.js (collapsed behind a pill, gated on real touch devices
// via html.nav-mobile), adapted for the admin's own SPA-style tab buttons:
// a .admin-tab click switches panels in place rather than navigating to a
// new page, so this also keeps the trigger's own label in sync and closes
// the dropdown on tab click — neither of which the public version needs,
// since there a click just navigates away on its own.
//
// Like the public pill: the list grows out of the pill and retracts back
// into it (.is-closing keeps it rendered for its exit animation —
// admin.css), and the pill slides away while the page scrolls down,
// back as soon as it scrolls up (.is-scrolled-away).

import { tabLabel } from "./tab-counts.js";

function isMobileNav() {
  return navigator.maxTouchPoints > 0;
}

function closeDropdown(bar, { instant = false } = {}) {
  if (instant) bar.classList.remove("is-closing");
  if (!bar.classList.contains("is-open")) return;
  bar.classList.remove("is-open");
  bar.querySelector(".admin-nav-trigger")?.setAttribute("aria-expanded", "false");
  if (instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const inner = bar.querySelector(".admin-tabs-inner");
  if (!inner) return;
  bar.classList.add("is-closing");
  // The panel's own animation only — its rows' bubble up here too.
  const done = (e) => {
    if (e.target !== inner) return;
    inner.removeEventListener("animationend", done);
    bar.classList.remove("is-closing");
  };
  inner.addEventListener("animationend", done);
}

export function initAdminNavDropdown() {
  // Self-healing fallback for the inline head script's own check — see
  // js/nav-dropdown.js for why (a DevTools device-emulation reload can
  // have the touch/hover override land a beat after that first script).
  if (!document.documentElement.classList.contains("nav-mobile") && isMobileNav()) {
    document.documentElement.classList.add("nav-mobile");
  }

  const bar = document.getElementById("admin-tabs-bar");
  const trigger = bar?.querySelector(".admin-nav-trigger");
  const label = trigger?.querySelector(".admin-nav-label");
  if (!bar || !trigger || !label) return;

  trigger.addEventListener("click", () => {
    if (bar.classList.contains("is-open")) {
      closeDropdown(bar);
      return;
    }
    bar.classList.remove("is-closing");
    bar.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  });

  document.addEventListener("click", (e) => {
    if (!bar.contains(e.target)) closeDropdown(bar);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && bar.classList.contains("is-open")) {
      closeDropdown(bar);
      trigger.focus();
    }
  });

  // A tab picked: the screen changes under the list (js/app.js's fade), so
  // the list goes at once rather than retracting over it.
  bar.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      label.textContent = tabLabel(tab);
      closeDropdown(bar, { instant: true });
      bar.classList.remove("is-scrolled-away");
      lastY = window.scrollY;
    });
  });

  // Touch screens: the pill slides away while the page scrolls down and
  // comes back as soon as it scrolls up — always shown near the top, at the
  // bottom of a short page hidden too (it would sit over the end), never
  // while its list is open. Moves under SCROLL_SLACK px ignored (a finger's
  // jitter), checked once per frame.
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
        if (!document.documentElement.classList.contains("nav-mobile")) return;
        const y = window.scrollY;
        if (Math.abs(y - lastY) < SCROLL_SLACK) return;
        const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 2;
        const away = y > lastY && (y > SHOW_NEAR_TOP || atBottom) && !bar.classList.contains("is-open");
        bar.classList.toggle("is-scrolled-away", away);
        lastY = y;
      });
    },
    { passive: true }
  );
}
