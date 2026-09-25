// Mobile (≤640px) page-title fitting for the detail pages (commander,
// league, event): shrink a long <h1> to fit one line instead of wrapping,
// and keep the back button beside it vertically centered on it. (League/
// event status pills are a sibling of the <h1>, .page-heading-pill, not
// inside it — only the name itself is ever fitted.)

const MOBILE_MAX_WIDTH = 640;
const MIN_FONT_SIZE = 17;

// Shrinks the title's font-size (down to a 17px floor) when it doesn't fit
// the width actually left for it on a phone (viewport minus the back button
// and its gap) — flex-wrap on .page-heading already lets it wrap rather than
// overflow, but a name reads better shrunk to fit one line than broken
// across two. Measures the text's own natural (unwrapped) width against the
// space actually available and scales the font down to match, rather than
// picking one fixed smaller mobile size — a short name stays at full size,
// only a genuinely long one shrinks, and only exactly as much as it needs
// to. Desktop is untouched (plenty of width there) and a name still too
// long even at the floor size is left to wrap, same as before.
export function fitTitleToOneLine(titleEl) {
  titleEl.style.fontSize = "";
  if (window.innerWidth > MOBILE_MAX_WIDTH) return;
  const baseFontSize = parseFloat(getComputedStyle(titleEl).fontSize);
  const availableWidth = titleEl.clientWidth;
  // Forcing nowrap for a moment reveals the text's true single-line width
  // (scrollWidth) — reset right after, so this doesn't leave the title
  // permanently overflowing its box before the shrink is applied.
  titleEl.style.whiteSpace = "nowrap";
  const naturalWidth = titleEl.scrollWidth;
  titleEl.style.whiteSpace = "";
  if (naturalWidth <= availableWidth) return;
  titleEl.style.fontSize = `${Math.max(MIN_FONT_SIZE, Math.floor((baseFontSize * availableWidth) / naturalWidth))}px`;
}

// .page-heading-row's mobile align-items: flex-start (styles.css) lines the
// back button's TOP up with the title's top — needed on commander.html so
// the button anchors to the name rather than the (taller, stacked-below-it-
// on-mobile) card image further down .page-heading. That's fine as long as
// the title's own line box happens to be close to the button's 44px height,
// but fitTitleToOneLine above can shrink it well below that, leaving the
// button's vertical *center* well below the now-smaller text's center
// instead of level with it. Nudges the button down/up by exactly the
// difference so its center lines up with the title's actual rendered
// height, whatever that ends up being, instead of relying on a fixed CSS
// alignment that only happened to look right at the original font size.
export function alignBackButtonToTitle(titleEl) {
  const linkEl = document.querySelector(".page-heading-row .breadcrumb-link");
  if (!linkEl) return;
  if (window.innerWidth > MOBILE_MAX_WIDTH) {
    linkEl.style.marginTop = "";
    return;
  }
  const titleHeight = titleEl.getBoundingClientRect().height;
  const linkHeight = linkEl.getBoundingClientRect().height;
  linkEl.style.marginTop = `${Math.round((titleHeight - linkHeight) / 2)}px`;
}

// Fits the title now and again on every resize/rotation.
export function initTitleFit(titleEl) {
  const fit = () => {
    fitTitleToOneLine(titleEl);
    alignBackButtonToTitle(titleEl);
  };
  fit();
  window.addEventListener("resize", fit);
}
