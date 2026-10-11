// The header/nav/footer markup itself is duplicated statically in every page
// rather than fetched and injected at runtime: fetch-injection meant the
// logo/nav only appeared a beat after the rest of the page had already
// painted (a visible "pop-in" on every navigation, worse now that
// view-transitions make everything else cross-fade smoothly), and it also
// couldn't participate in that cross-fade at all since it didn't exist yet
// when the transition snapshot was taken.
//
// The active nav tab is highlighted with plain CSS (data-active-nav
// attribute selectors in styles.css) — no JS involved, after an earlier
// JS-driven sliding "pill" version turned out to cost a synchronous
// layout/reflow on every navigation.

import { setupThemeToggle } from "./theme.js";
import { enhanceSelects } from "./custom-select.js";
import { enhanceDateInputs } from "./custom-date.js";
import "./pwa-install.js";
import "./nav-dropdown.js";
import "./site-search.js";
import "./top-bar.js";
import "./header-account.js";
import { initMeHighlight } from "./me-highlight.js";
import { attachHoverTooltips, showFloatingTooltip } from "./floating-tooltip.js";
import { watchPageLoading } from "./page-loading.js";
import { navigate } from "./router.js";
import "./system-bars.js";

// Never stuck on "Caricamento...": a reload offered when loading takes too
// long or fails (js/page-loading.js).
watchPageLoading();
setupThemeToggle();
enhanceSelects();
enhanceDateInputs();

// "Tu" next to the signed-in account's own player, wherever it appears.
initMeHighlight();

// Every data-tooltip badge-like element on every page — player badges,
// the banned-commander icon, an event's mtgtop8/Moxfield links — through the
// one shared tooltip (js/floating-tooltip.js), delegated on the whole body so
// it covers markup rendered later too.
attachHoverTooltips(
  document.body,
  ".icon-badge[data-tooltip], .results-link[data-tooltip]",
  (el) => el.dataset.tooltip
);

// An archetype badge (js/ui.js archetypeBadge) opens its archetype's page —
// on a click or Enter, also when it sits inside a sub-card linking
// elsewhere (event.html's entries): captured before that link sees it.
function openArchetype(e) {
  const badge = e.target.closest?.(".badge-archetype[data-archetype]");
  if (!badge) return;
  if (e.type === "keydown" && e.key !== "Enter") return;
  e.preventDefault();
  e.stopPropagation();
  navigate(`archetype.html?id=${encodeURIComponent(badge.dataset.archetype)}`);
}
document.addEventListener("click", openArchetype, true);
document.addEventListener("keydown", openArchetype, true);

// Touch: a badge inside a link (a list's sub-card — Giocatori, the Bacheca's
// standings, a league's Classifica…) is tapped to read it, not to follow the
// card: the tap only shows its tooltip. Captured before the link sees it. A
// mouse click still follows the link (its tooltip shows on hover anyway).
document.addEventListener(
  "click",
  (e) => {
    const badge = e.target.closest?.(".icon-badge[data-tooltip]");
    if (!badge || !badge.closest("a")) return;
    const touch = e.pointerType ? e.pointerType !== "mouse" : window.matchMedia("(hover: none)").matches;
    if (!touch) return;
    e.preventDefault();
    showFloatingTooltip(badge, badge.dataset.tooltip);
  },
  true
);
