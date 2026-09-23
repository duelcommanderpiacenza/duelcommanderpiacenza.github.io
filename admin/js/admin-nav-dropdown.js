// Mobile-only admin nav dropdown — same pattern as the public site's
// js/nav-dropdown.js (collapsed behind a pill, gated on real touch devices
// via html.nav-mobile), adapted for the admin's own SPA-style tab buttons:
// a .admin-tab click switches panels in place rather than navigating to a
// new page, so this also keeps the trigger's own label in sync and closes
// the dropdown on tab click — neither of which the public version needs,
// since there a click just navigates away on its own.

const MOBILE_QUERY = "(max-width: 640px) and (pointer: coarse) and (hover: none)";

function closeDropdown(bar) {
  bar.classList.remove("is-open");
  bar.querySelector(".admin-nav-trigger")?.setAttribute("aria-expanded", "false");
}

export function initAdminNavDropdown() {
  // Self-healing fallback for the inline head script's own check — see
  // js/nav-dropdown.js for why (a DevTools device-emulation reload can
  // have the touch/hover override land a beat after that first script).
  if (!document.documentElement.classList.contains("nav-mobile") && window.matchMedia(MOBILE_QUERY).matches) {
    document.documentElement.classList.add("nav-mobile");
  }

  const bar = document.getElementById("admin-tabs-bar");
  const trigger = bar?.querySelector(".admin-nav-trigger");
  const label = trigger?.querySelector(".admin-nav-label");
  if (!bar || !trigger || !label) return;

  trigger.addEventListener("click", () => {
    const open = bar.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", String(open));
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

  bar.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      label.textContent = tab.textContent;
      closeDropdown(bar);
    });
  });
}
