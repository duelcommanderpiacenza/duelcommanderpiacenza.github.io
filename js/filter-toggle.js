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
// Filters set: the button gets .has-active-filters (a light red fill and
// edge — styles.css) whenever any filter inside the panel is set —
// a select or date with a value, a checked checkbox — so a filter hidden in
// the collapsed panel (e.g. the default "Dal" date) never goes unnoticed.
// Kept in sync from the panel's own (bubbling) change events; a page that
// sets a filter from code calls the returned refresh() instead.

import { escapeHtml } from "./ui.js";

// It pops (styles.css) only the first time it's marked in a visit: moving
// to another page whose filters are set too (the Meta section's shared
// filter, js/meta-filters.js) shows it already marked — until a filter is
// changed by hand there, which pops it again. (This module stays loaded
// across in-app navigations, so the flag lasts the visit.)
let activeShown = false;

// "30 ott 2024": the "Dal" date in the summary.
const day = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");

// The Meta pages' button on touch screens is the switcher's bottom line
// (styles.css .meta-row, option E of a mockup, 2026-10-30): its
// .filter-summary lists the filters set — only those, in the panel's order
// (a league or event by its name, "Dal <date>", Comandanti's colours as
// pips, "Identità esatta") — or just "Filtri" with none. HTML, and the
// same as plain text for the button's label.
function summaryOf(panel) {
  const parts = [];
  const words = [];
  let colors = null;
  for (const el of panel.querySelectorAll('select, input[type="date"], input[type="checkbox"]')) {
    if (el.type === "checkbox") {
      if (!el.checked) continue;
      if (/^[WUBRG]$/.test(el.value)) {
        if (!colors) {
          colors = [];
          parts.push(colors);
        }
        colors.push(el.value);
        continue;
      }
      const text = el.closest("label")?.textContent.trim() || el.getAttribute("aria-label") || "";
      if (text) parts.push(text);
    } else if (el.value) {
      parts.push(el.type === "date" ? `Dal ${day(el.value)}` : el.selectedOptions[0]?.textContent.trim() ?? el.value);
    }
  }
  const html = parts
    .map((p) =>
      Array.isArray(p)
        ? `<span class="filter-summary-colors">${p.map((c) => `<i class="color-pip color-pip-${c}"></i>`).join("")}</span>`
        : escapeHtml(p)
    )
    .join('<span class="filter-summary-sep"> · </span>');
  for (const p of parts) words.push(Array.isArray(p) ? `colori ${p.join("")}` : p);
  return { html, text: words.join(", ") };
}

export function initFilterToggle(buttonId, panelId) {
  const btn = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  const clip = panel?.querySelector(".filter-panel-clip");
  if (!btn || !panel || !clip) return { refresh() {} };

  btn.classList.toggle("no-active-pop", activeShown);
  const summaryEl = btn.querySelector(".filter-summary");
  function refresh(e) {
    const active = [...panel.querySelectorAll('select, input[type="date"], input[type="checkbox"]')].some((el) =>
      el.type === "checkbox" ? el.checked : el.value !== ""
    );
    if (e?.isTrusted) btn.classList.remove("no-active-pop");
    if (active) activeShown = true;
    btn.classList.toggle("has-active-filters", active);
    if (summaryEl) {
      const { html, text } = summaryOf(panel);
      summaryEl.innerHTML = html || "Filtri";
      btn.setAttribute("aria-label", text ? `Filtri: ${text}` : "Filtri");
    } else {
      btn.setAttribute("aria-label", active ? "Filtri (attivi)" : "Filtri");
    }
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
    // Opened from a button that stays in view while scrolling (the Meta
    // pages' sticky sub-tabs) with the panel scrolled away above: back up
    // to it.
    if (opening) {
      requestAnimationFrame(() => {
        if (panel.getBoundingClientRect().top < 0) {
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        }
      });
    }
  }

  btn.addEventListener("click", () => setOpen(panel.classList.contains("is-collapsed")));

  return { refresh };
}
