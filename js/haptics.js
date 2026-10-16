// A tiny vibration as feedback for a tap, on touch screens whose browser
// supports it (Android; iOS has no web vibration at all, so nothing happens
// there — nor anywhere else without navigator.vibrate). "tick": a tab
// switched, the nav pill opened, pull-to-refresh armed; "confirm": a
// slightly fuller double tap, for a follow. The browser may refuse until the
// visitor has tapped the page once — harmless, it's just skipped.
const PATTERNS = { tick: 10, confirm: [10, 50, 14] };

export function haptic(kind = "tick") {
  if (!document.documentElement.classList.contains("nav-mobile")) return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tick);
  } catch {
    // Some browsers throw instead of ignoring it — never worth an error.
  }
}
