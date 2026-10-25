// The app's settings on account.html (Profilo): the theme (Chiaro / Scuro
// / Sistema, a segmented control) and the vibration (a switch, only where
// it works — js/haptics.js hapticsSupported), plus the footer's own small
// print (copyright, version, credits) for the touch screens, which hide the
// footer (styles.css). In the "Impostazioni" tab when signed in, in a card
// under the sign-in when not. The choices go through js/theme.js
// chooseTheme / js/haptics-toggle.js chooseHaptics — kept in the browser
// and, signed in, for the account — and every control showing them follows
// along ("theme:change" / "haptics:change").

import { THEME_ICONS, themeMode, chooseTheme } from "./theme.js";
import { chooseHaptics } from "./haptics-toggle.js";
import { haptic, hapticsSupported, hapticsEnabled } from "./haptics.js";

const PHONE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="4" width="8" height="16" rx="1.5"></rect><path d="m3 8 1.5 2L3 12l1.5 2L3 16"></path><path d="m21 8-1.5 2 1.5 2-1.5 2 1.5 2"></path></svg>';

const MODES = [
  ["light", "Chiaro"],
  ["dark", "Scuro"],
  ["system", "Sistema"],
];

/**
 * Fills `controlsEl` with the controls and `aboutEl` (optional) with the
 * footer's small print; `signal` (the page's, js/router.js) ends their
 * listeners with the page.
 */
export function mountSettings({ controlsEl, aboutEl = null, signal }) {
  controlsEl.innerHTML = `
    <div class="settings-group">
      <p class="settings-label">Tema</p>
      <div class="settings-seg" role="radiogroup" aria-label="Tema">
        ${MODES.map(
          ([mode, label]) =>
            `<button type="button" role="radio" aria-checked="false" data-mode="${mode}">${THEME_ICONS[mode]}<span>${label}</span></button>`
        ).join("")}
      </div>
    </div>
    ${
      hapticsSupported()
        ? `<div class="settings-group">
      <div class="settings-row">
        <span class="settings-row-icon">${PHONE}</span>
        <span class="settings-row-text">Vibrazione<small>Un tocco leggero a ogni scelta</small></span>
        <button type="button" class="settings-switch" role="switch" aria-checked="false" aria-label="Vibrazione"><span></span></button>
      </div>
    </div>`
        : ""
    }`;

  // The footer's own copy (its version filled in by js/layout.js), so the
  // two never differ.
  const credits = document.querySelector("footer .footer-center")?.cloneNode(true);
  if (aboutEl && credits) {
    credits.querySelector("#site-version")?.removeAttribute("id");
    aboutEl.replaceChildren(credits);
  }

  const reflectTheme = () => {
    const mode = themeMode();
    for (const btn of controlsEl.querySelectorAll(".settings-seg button")) {
      btn.setAttribute("aria-checked", String(btn.dataset.mode === mode));
    }
  };
  const reflectHaptics = () => {
    controlsEl.querySelector(".settings-switch")?.setAttribute("aria-checked", String(hapticsEnabled()));
  };

  controlsEl.querySelector(".settings-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn || btn.dataset.mode === themeMode()) return;
    haptic();
    chooseTheme(btn.dataset.mode, true);
  });
  controlsEl.querySelector(".settings-switch")?.addEventListener("click", () => chooseHaptics(!hapticsEnabled()));
  document.addEventListener("theme:change", reflectTheme, { signal });
  document.addEventListener("haptics:change", reflectHaptics, { signal });
  reflectTheme();
  reflectHaptics();
}
