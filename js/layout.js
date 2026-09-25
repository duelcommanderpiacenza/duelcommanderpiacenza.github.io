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
import { attachHoverTooltips } from "./floating-tooltip.js";

setupThemeToggle();
enhanceSelects();
enhanceDateInputs();

// Every data-tooltip badge-like element on every page — player badges,
// the banned-commander icon, the mtgtop8 "Top 8" pill — through the one
// shared tooltip (js/floating-tooltip.js), delegated on the whole body so
// it covers markup rendered later too.
attachHoverTooltips(document.body, ".icon-badge[data-tooltip], .results-link[data-tooltip]", (el) => el.dataset.tooltip);
