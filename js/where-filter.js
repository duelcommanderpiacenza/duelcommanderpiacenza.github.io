// "Dove": which events the Meta pages (Comandanti / Matchups / Archetipi /
// Evoluzione) and Giocatori / Confronto count — Dal vivo (the default),
// Online (endstep, migration 034) or Tutto. Option H2 of a mockup
// (2026-11-04): a small three-way bar in the section's head (.where-filter,
// static in each page's .meta-head — on a computer in the tabs' row before
// the filters' button, on touch screens a bar of its own under the sticky
// switcher). One choice for all six pages, kept in localStorage "where"
// (Dal vivo = no key).
// Shown only when there are closed events of both kinds (user, 2026-11-04):
// with one kind only there's nothing to choose — hidden, and everything
// counted (Tutto), whatever was picked before. Whether it was shown is kept
// too (localStorage "whereShown"), so the next page starts as the last one
// ended rather than popping the bar in or out once its events are in.

const KEY = "where";
const SHOWN_KEY = "whereShown";
const VALUES = ["live", "online", "all"];

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode / storage off: kept for this page only.
  }
}

// Whether event `ev` is in `where`'s scope (events.is_online tells).
export function inWhere(where, ev) {
  return where === "all" || Boolean(ev.is_online) === (where === "online");
}

// Wires the page's bar (its <main>'s .where-filter): shows the saved
// choice and, on a click, saves the new one and calls the listeners added
// with onChange(fn) — js/scope-filter.js redraws its lists and reports the
// new scope. `value` is the choice in force ("all" while the bar is
// hidden); setEvents(events) — the page's events, once loaded, before its
// scope filter starts — shows or hides the bar.
export function initWhereFilter({ signal } = {}) {
  const root = document.querySelector("main .where-filter");
  const saved = read(KEY);
  let picked = VALUES.includes(saved) ? saved : "live";
  let shown = read(SHOWN_KEY) === "1";
  const listeners = [];

  function paint() {
    if (root) root.hidden = !shown;
    for (const btn of root?.querySelectorAll("[data-where]") ?? []) {
      const on = btn.dataset.where === picked;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-checked", String(on));
    }
  }
  paint();

  root?.addEventListener(
    "click",
    (e) => {
      const next = e.target.closest("[data-where]")?.dataset.where;
      if (!next || next === picked) return;
      picked = next;
      write(KEY, picked === "live" ? null : picked);
      paint();
      for (const fn of listeners) fn(picked);
    },
    { signal }
  );

  return {
    get value() {
      return shown ? picked : "all";
    },
    onChange(fn) {
      listeners.push(fn);
    },
    setEvents(events) {
      const closed = events.filter((ev) => !ev.is_open);
      shown = closed.some((ev) => ev.is_online) && closed.some((ev) => !ev.is_online);
      write(SHOWN_KEY, shown ? "1" : null);
      paint();
    },
  };
}
