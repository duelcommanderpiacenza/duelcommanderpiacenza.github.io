// Each archetype's icon — beside its name everywhere it's shown: the
// archetype badges (js/ui.js archetypeBadge), the meta charts' bubbles and
// legends (js/metagame-chart.js, a row's `icon`), the Archetipi bars and
// archetype.html's title. Line icons drawn in currentColor (the site's other
// icons' look), from Lucide (ISC licence): aggro a lightning bolt (fast and
// hard — the swords were the matches' icon, docs/icons.md), control a shield,
// combo infinity (the loops combos win with), tempo a stopwatch, midrange a
// balance (the middle ground).

const PATHS = {
  aggro:
    '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  control:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  combo: '<path d="M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8"/>',
  tempo: '<path d="M10 2h4"/><path d="m12 14 3-3"/><circle cx="12" cy="14" r="8"/>',
  midrange:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
};

// The icon's <svg> ("" for an unknown archetype); `className` for its size
// and place where it's used.
export function archetypeIcon(archetype, className = "archetype-icon") {
  const paths = PATHS[archetype];
  if (!paths) return "";
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
