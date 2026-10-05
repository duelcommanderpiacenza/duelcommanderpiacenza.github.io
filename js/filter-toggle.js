// Wires up the round "funnel" button that expands/collapses a page's
// secondary filters (league/event/date/color-identity) below the
// search+sort line — shared by Comandanti/Giocatori/Archetipi rather than
// each page re-implementing the same open/close toggle. Collapsed by
// default (.is-collapsed already present in the static HTML); this only
// adds the interaction on top of styles.css's own collapse mechanics,
// same "markup + CSS state are real from first paint, JS only wires the
// click" split as js/nav-dropdown.js.
//
// .filter-panel-clip's own overflow: hidden (styles.css) is what makes the
// grid-template-rows collapse animation actually clip its content instead
// of just shrinking the track while the content stays visible — but that
// same overflow also clips a select/date field's own popup once opened,
// since a select/date dropdown positions itself relative to its own field,
// a descendant of that clipping box. Once the expand animation genuinely
// finishes (not before — a popup opened mid-animation would already escape
// while the row is still visually only partway open), .is-open switches
// the clip off, letting fields inside open their popups normally; closing
// switches it back on immediately, before the collapse animation starts,
// so the content still clips away as it shrinks.
//
// Active-filter dot: the button gets .has-active-filters (a white dot on
// its top right, styles.css) whenever any filter inside the panel is set —
// a select or date with a value, a checked checkbox — so a filter hidden in
// the collapsed panel (e.g. the default "Dal" date) never goes unnoticed.
// Kept in sync from the panel's own (bubbling) change events; a page that
// sets a filter from code calls the returned refresh() instead.
//
// openOnDesktop (commander.html, player.html): wider than the detail pages'
// phone layout, the panel starts open — no animation, already unclipped, the
// button showing it open — and still closes on click; on phones it starts
// closed like everywhere else.
const DESKTOP_QUERY = "(min-width: 641px)";

export function initFilterToggle(buttonId, panelId, { openOnDesktop = false } = {}) {
  const btn = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  const clip = panel?.querySelector(".filter-panel-clip");
  if (!btn || !panel || !clip) return { refresh() {} };

  function refresh() {
    const active = [...panel.querySelectorAll('select, input[type="date"], input[type="checkbox"]')].some((el) =>
      el.type === "checkbox" ? el.checked : el.value !== ""
    );
    btn.classList.toggle("has-active-filters", active);
    btn.setAttribute("aria-label", active ? "Filtri (attivi)" : "Filtri");
  }
  panel.addEventListener("change", refresh);
  refresh();

  panel.addEventListener("transitionend", (e) => {
    if (e.target === panel && e.propertyName === "grid-template-rows" && !panel.classList.contains("is-collapsed")) {
      clip.classList.add("is-open");
    }
  });

  function setOpen(opening) {
    if (opening) {
      panel.classList.remove("is-collapsed");
      // Reduced motion means no transition plays at all, so transitionend
      // above would never fire to lift the clip — skip straight there.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) clip.classList.add("is-open");
    } else {
      clip.classList.remove("is-open");
      panel.classList.add("is-collapsed");
    }
    btn.classList.toggle("is-open", opening);
    btn.setAttribute("aria-expanded", String(opening));
  }

  if (openOnDesktop && window.matchMedia(DESKTOP_QUERY).matches) {
    // Open from the start: nothing to wait for, so no clip at all.
    setOpen(true);
    clip.classList.add("is-open");
  }

  btn.addEventListener("click", () => setOpen(panel.classList.contains("is-collapsed")));

  return { refresh };
}
