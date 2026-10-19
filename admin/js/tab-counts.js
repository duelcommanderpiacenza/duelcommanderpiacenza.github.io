// Counts on the admin tabs: a small red circle with a number after a tab's
// label (e.g. "Utenti" and its pending link requests), hidden at 0. On touch
// screens the tabs are the bottom tab bar's, the count on the tab's icon
// (js/admin-nav-dropdown.js, admin.css .admin-tab-count).

// A tab's own label, without its count — for the page title and the pill's
// label, which copy it (index.html wraps a counted tab's text in
// .admin-tab-label).
export function tabLabel(tab) {
  return (tab.querySelector(".admin-tab-label") ?? tab).textContent.trim();
}

export function setTabCount(tabName, count) {
  const tab = document.querySelector(`.admin-tab[data-tab="${tabName}"]`);
  const badge = tab?.querySelector(".admin-tab-count");
  if (badge) {
    badge.textContent = count ? String(count) : "";
    badge.hidden = !count;
    // Read out with the tab: "Utenti, 2 in attesa".
    badge.setAttribute("aria-label", `${count} in attesa`);
  }
}
