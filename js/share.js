// The heroes' share button (event.html, league.html — the round one at the
// end of .hero-actions): on touch screens the system's share sheet; on a
// computer (where that sheet is an odd, rarely wanted window) the link
// copied, "Link copiato!" in the site's tooltip for a moment.

import { showFloatingTooltip, hideFloatingTooltipOf } from "./floating-tooltip.js";
import { haptic } from "./haptics.js";

const COPIED_FOR = 1600; // ms

/**
 * Wires `btn` to share `url` (absolute or relative to this page) as
 * `title`. Safe to call again on the same button (the latest wins).
 */
export function initShareButton(btn, { title, url }) {
  if (!btn) return;
  btn.onclick = async () => {
    const href = new URL(url, location.href).href;
    const touch = document.documentElement.classList.contains("nav-mobile");
    if (touch && navigator.share) {
      try {
        await navigator.share({ title, url: href });
      } catch {
        // The sheet dismissed: nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      // No clipboard (an insecure origin, a refusal): nothing to show.
      return;
    }
    haptic();
    showFloatingTooltip(btn, "Link copiato!");
    setTimeout(() => hideFloatingTooltipOf(btn), COPIED_FOR);
  };
}
