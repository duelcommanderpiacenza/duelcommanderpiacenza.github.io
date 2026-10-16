// A tiny vibration as feedback for a tap — only on Android touch screens
// whose browser can vibrate (navigator.vibrate: Chrome, Samsung Internet,
// Firefox; iOS has no web vibration at all, and a computer's Chrome has the
// function but nothing to vibrate). "tick": a tab switched, the nav pill
// opened, pull-to-refresh armed; "confirm": a slightly fuller double tap,
// for a follow. The browser may refuse until the visitor has tapped the page
// once — harmless, it's just skipped.
//
// On by default; the footer's switch (js/haptics-toggle.js) turns it off —
// kept in this browser (localStorage "haptics" = "off") and, signed in, for
// the account. A web page can only choose how long a vibration lasts, not
// how strong it is, hence just on / off.
const PATTERNS = { tick: 10, confirm: [10, 50, 14] };
const STORAGE_KEY = "haptics";

export function hapticsSupported() {
  return (
    document.documentElement.classList.contains("nav-mobile") &&
    typeof navigator.vibrate === "function" &&
    /android/i.test(navigator.userAgentData?.platform ?? navigator.userAgent)
  );
}

export function hapticsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on) {
  try {
    if (on) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    // Private mode / storage full: the choice just lasts this page.
  }
}

export function haptic(kind = "tick") {
  if (!hapticsSupported() || !hapticsEnabled()) return;
  try {
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tick);
  } catch {
    // Some browsers throw instead of ignoring it — never worth an error.
  }
}
