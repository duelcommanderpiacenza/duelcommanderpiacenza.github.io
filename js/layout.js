// Highlights the active nav tab via `document.body.dataset.activeNav`, and
// animates the red "pill" sliding from whichever tab was clicked on the
// previous page to the new active tab (works across full page loads, not
// just within one page, via sessionStorage — no reliance on experimental
// browser APIs).
//
// The header/nav/footer markup itself is duplicated statically in every page
// rather than fetched and injected at runtime: fetch-injection meant the
// logo/nav only appeared a beat after the rest of the page had already
// painted (a visible "pop-in" on every navigation, worse now that
// view-transitions make everything else cross-fade smoothly), and it also
// couldn't participate in that cross-fade at all since it didn't exist yet
// when the transition snapshot was taken.

const NAV_PILL_KEY = "navPillFrom";

function placePill(pill, link, container, instant) {
  const linkRect = link.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (instant) pill.style.transition = "none";
  // `left`/`top` on this absolutely-positioned pill are measured from the
  // container's *unscrolled* content origin, but getBoundingClientRect()
  // reflects the *current* (possibly scrolled) on-screen position — on the
  // mobile nav, which scrolls horizontally, that mismatch made the browser
  // subtract the scroll offset a second time when rendering, so the pill
  // drifted away from its tab by roughly the scroll distance. Adding the
  // current scroll position back cancels that out.
  pill.style.left = `${linkRect.left - containerRect.left + container.scrollLeft}px`;
  pill.style.top = `${linkRect.top - containerRect.top + container.scrollTop}px`;
  pill.style.width = `${linkRect.width}px`;
  pill.style.height = `${linkRect.height}px`;
  pill.style.opacity = "1";
  if (instant) {
    void pill.offsetWidth; // force reflow so the transition removal takes effect
    pill.style.transition = "";
  }
}

function setupNavPill() {
  const container = document.querySelector(".site-nav-inner");
  if (!container) return;

  let pill = container.querySelector(".nav-pill");
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "nav-pill";
    container.prepend(pill);
  }

  const links = Array.from(container.querySelectorAll(".nav-link"));
  const active = document.body.dataset.activeNav;
  links.forEach((link) => link.classList.toggle("is-active", link.dataset.nav === active));

  const activeLink = links.find((link) => link.dataset.nav === active);
  if (!activeLink) return;

  // On narrow screens the nav scrolls horizontally instead of wrapping, so
  // the active tab could start off-screen. "instant" (not the container's
  // smooth default) so it's already settled before the pill rects below
  // are measured.
  activeLink.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });

  const fromKey = sessionStorage.getItem(NAV_PILL_KEY);
  const fromLink = fromKey ? links.find((link) => link.dataset.nav === fromKey) : null;

  if (fromLink && fromLink !== activeLink) {
    placePill(pill, fromLink, container, true);
    // Double rAF: the first callback still runs before the *next* paint, so
    // changing the target style there risks getting batched into the same
    // paint as the "instant" placement above (no visible jump-then-slide,
    // just a jump). Queuing the real move from *inside* that callback defers
    // it to the frame after the "from" state has actually been painted.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => placePill(pill, activeLink, container, false));
    });
  } else {
    placePill(pill, activeLink, container, true);
  }

  links.forEach((link) => {
    link.addEventListener("click", () => {
      sessionStorage.setItem(NAV_PILL_KEY, link.dataset.nav ?? "");
    });
  });

  // The pill's position/size is measured in pixels at setup time, so a
  // viewport resize or orientation change (nav links reflowing to a new
  // row on narrow screens) would otherwise leave it stranded. Snap it back
  // onto the active link with no animation whenever that happens.
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => placePill(pill, activeLink, container, true), 120);
  });
}

setupNavPill();
