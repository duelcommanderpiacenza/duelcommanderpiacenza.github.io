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

setupThemeToggle();
enhanceSelects();
enhanceDateInputs();
