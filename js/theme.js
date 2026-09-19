// Dark mode. The actual theme is applied as early as possible by a tiny
// inline script in every page's <head> (before first paint, reading
// localStorage so there's no flash of the wrong theme on navigation) — this
// module just wires up the toggle button to reflect and change that
// already-applied state. Shared by both js/layout.js (public pages) and
// admin/js/app.js (admin has no nav, so doesn't load layout.js at all).

const THEME_KEY = "theme";

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function reflect(toggle, theme) {
  toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  toggle.textContent = theme === "dark" ? "☀️" : "🌙";
  toggle.title = theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro";
}

export function setupThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  reflect(toggle, currentTheme());

  toggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (err) {
      // Private browsing / storage disabled — theme just won't persist.
    }
    reflect(toggle, next);
  });
}
