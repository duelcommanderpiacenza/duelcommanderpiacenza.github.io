// Chart rows (Comandanti/Archetipi: Metashare, Winrate, + Comandanti's
// "Colori più giocati"; Bacheca: most played commanders/archetypes) as a
// horizontal carousel of whole blocks: 2 charts visible side by side when
// there's room, 1 otherwise (sizes in styles.css, .chart-grid). The row
// itself is a native scroll-snap container, so touch swipes and trackpads
// already land on whole charts; this adds what a mouse user needs on top —
// prev/next arrows (hidden on touch devices, html.nav-mobile) — plus dots
// showing where you are, below the row.
//
// Call after every render: both pages rebuild the chart markup from scratch
// on each filter change, so the controls are rebuilt with it.

function stepWidth(grid) {
  const first = grid.firstElementChild;
  if (!first) return grid.clientWidth;
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
  return first.getBoundingClientRect().width + gap;
}

// How many distinct scroll positions there are: charts minus however many
// fit side by side, plus one (3 charts, 2 visible → 2 positions).
function positionCount(grid) {
  const step = stepWidth(grid);
  const visible = Math.max(1, Math.round((grid.clientWidth + (parseFloat(getComputedStyle(grid).columnGap) || 0)) / step));
  return Math.max(1, grid.children.length - visible + 1);
}

/**
 * @param {HTMLElement} containerEl - element whose content is the .chart-grid.
 * @param {object} [options]
 * @param {HTMLElement} [options.navAfter] - put the ‹ • › controls right after
 *   this element instead of directly under the row (the Bacheca: below its
 *   whole card, outside the white box).
 */
export function initChartCarousel(containerEl, { navAfter = null } = {}) {
  const grid = containerEl.querySelector(".chart-grid");
  if (!grid) return;
  // Controls placed outside containerEl survive a re-render of its content,
  // unlike ones inside it — drop the previous render's before adding new.
  containerEl._chartCarouselNav?.remove();
  // Makes containerEl a CSS size container, so "2 side by side or 1" goes
  // by how wide the charts' own area is (styles.css @container), not the
  // viewport — the Bacheca's narrow side card shows one at a time even on
  // a wide desktop, Comandanti/Archetipi's full-width row shows two.
  containerEl.classList.add("chart-carousel-host");

  const nav = document.createElement("div");
  nav.className = "chart-carousel-nav";
  nav.innerHTML = `
    <button type="button" class="chart-carousel-arrow" data-dir="-1" aria-label="Grafico precedente">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>
    </button>
    <div class="chart-carousel-dots" aria-hidden="true"></div>
    <button type="button" class="chart-carousel-arrow" data-dir="1" aria-label="Grafico successivo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
    </button>`;
  (navAfter ?? grid).after(nav);
  containerEl._chartCarouselNav = nav;

  const dotsEl = nav.querySelector(".chart-carousel-dots");
  const prevBtn = nav.querySelector('[data-dir="-1"]');
  const nextBtn = nav.querySelector('[data-dir="1"]');

  function update() {
    const count = positionCount(grid);
    // Everything already fits (e.g. only 2 charts, 2 visible) — no controls.
    nav.hidden = count <= 1;
    if (dotsEl.children.length !== count) {
      dotsEl.innerHTML = Array.from({ length: count }, () => '<span class="chart-carousel-dot"></span>').join("");
    }
    const index = Math.min(count - 1, Math.round(grid.scrollLeft / stepWidth(grid)));
    Array.from(dotsEl.children).forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= count - 1;
  }

  nav.querySelectorAll(".chart-carousel-arrow").forEach((btn) => {
    btn.addEventListener("click", () => {
      grid.scrollBy({ left: Number(btn.dataset.dir) * stepWidth(grid), behavior: "smooth" });
    });
  });
  grid.addEventListener("scroll", update, { passive: true });
  // A ResizeObserver on the row itself (not a window listener) — nothing to
  // clean up when a re-render throws this row away, it just stops firing.
  new ResizeObserver(update).observe(grid);
  update();
}
