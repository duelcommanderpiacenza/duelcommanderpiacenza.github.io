// Skins every native <input type="date"> with a custom-styled trigger +
// calendar popup, matching the site's rounded/card look — unlike <select>,
// no browser exposes *any* CSS hook into the native date-picker calendar,
// so getting a seamless look means replacing it outright.
//
// Same contract as js/custom-select.js: the native input stays in the DOM
// (hidden) as the single source of truth for .value ("" or an ISO
// yyyy-mm-dd string) — every existing call site that reads `input.value` or
// listens for "change" keeps working untouched. Two things needed to make
// that safe:
//  1. The native `value` setter is wrapped per-input, so a direct
//     `dateField.value = row.event_date ?? ""` (used in admin onEdit
//     handlers) still re-syncs the custom UI.
//  2. `form.reset()` resets a field's value through an internal browser
//     algorithm that bypasses any JS-overridden property setter entirely —
//     confirmed necessary here since the two admin forms with a date field
//     both call it in resetForm() — so a "reset" listener re-syncs
//     explicitly, a tick after the browser's own reset has applied.

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAYS_IT = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"]; // week starts Monday, as in it-IT
const GRID_CELLS = 42; // fixed 6 rows so the popup never resizes between months

const ENHANCED = new WeakSet();
const NATIVE_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Manual yyyy-mm-dd parsing/formatting throughout (never `new Date(iso)` or
// `.toISOString()`, both UTC-based) so a date never silently shifts by a day
// depending on the visitor's timezone offset.
function parseISO(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function toISO(date) {
  return `${date.y}-${pad2(date.m + 1)}-${pad2(date.d)}`;
}

function todayParts() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

function sameDate(a, b) {
  return !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;
}

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

// Converts JS's Sunday-first getDay() (0-6) to a Monday-first index (0-6).
function firstWeekdayMondayIndex(y, m) {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

function formatLabel(date) {
  return `${date.d} ${MONTHS_IT[date.m].slice(0, 3).toLowerCase()} ${date.y}`;
}

function buildGrid(viewY, viewM) {
  const lead = firstWeekdayMondayIndex(viewY, viewM);
  const cells = [];
  for (let i = 0; i < GRID_CELLS; i++) {
    const dayNum = i - lead + 1;
    if (dayNum < 1) {
      const prevDays = daysInMonth(viewY, viewM - 1);
      cells.push({ y: viewM === 0 ? viewY - 1 : viewY, m: (viewM + 11) % 12, d: prevDays + dayNum, outside: true });
    } else if (dayNum > daysInMonth(viewY, viewM)) {
      cells.push({ y: viewM === 11 ? viewY + 1 : viewY, m: (viewM + 1) % 12, d: dayNum - daysInMonth(viewY, viewM), outside: true });
    } else {
      cells.push({ y: viewY, m: viewM, d: dayNum, outside: false });
    }
  }
  return cells;
}

function closePopup(wrap) {
  wrap.classList.remove("is-open");
  wrap.querySelector(".cd-trigger").setAttribute("aria-expanded", "false");
}

function closeAllExcept(except) {
  document.querySelectorAll(".cd-wrap.is-open").forEach((wrap) => {
    if (wrap !== except) closePopup(wrap);
  });
}

export function enhanceDateInput(input) {
  if (ENHANCED.has(input) || !input.parentNode) return;
  ENHANCED.add(input);

  const wrap = document.createElement("div");
  wrap.className = "cd-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.classList.add("cd-native");
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "cd-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = '<span class="cd-trigger-label"></span><span class="cd-trigger-arrow" aria-hidden="true"></span>';

  const popup = document.createElement("div");
  popup.className = "cd-popup";
  popup.setAttribute("role", "dialog");
  popup.innerHTML = `
    <div class="cd-header">
      <button type="button" class="cd-nav cd-nav-prev" aria-label="Mese precedente">&lsaquo;</button>
      <span class="cd-month-label"></span>
      <button type="button" class="cd-nav cd-nav-next" aria-label="Mese successivo">&rsaquo;</button>
    </div>
    <div class="cd-weekdays">${WEEKDAYS_IT.map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="cd-grid" role="grid"></div>
    <div class="cd-footer">
      <button type="button" class="cd-footer-btn cd-today">Oggi</button>
      <button type="button" class="cd-footer-btn cd-clear">Cancella</button>
    </div>
  `;

  wrap.appendChild(trigger);
  wrap.appendChild(popup);

  const grid = popup.querySelector(".cd-grid");
  const monthLabel = popup.querySelector(".cd-month-label");
  const label = trigger.querySelector(".cd-trigger-label");

  // The month currently being *browsed* in the popup — independent of the
  // input's actual value until a day cell is clicked.
  let view = parseISO(input.value) ?? todayParts();

  function renderGrid() {
    monthLabel.textContent = `${MONTHS_IT[view.m]} ${view.y}`;
    const selected = parseISO(input.value);
    const today = todayParts();
    grid.innerHTML = "";
    buildGrid(view.y, view.m).forEach((cell) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cd-day";
      btn.tabIndex = -1;
      btn.textContent = String(cell.d);
      if (cell.outside) btn.classList.add("is-outside");
      if (sameDate(cell, today)) btn.classList.add("is-today");
      if (sameDate(cell, selected)) {
        btn.classList.add("is-selected");
        btn.setAttribute("aria-selected", "true");
      }
      btn.addEventListener("click", () => {
        input.value = toISO(cell); // goes through the wrapped setter, which re-syncs the trigger label
        input.dispatchEvent(new Event("change", { bubbles: true }));
        closePopup(wrap);
        trigger.focus();
      });
      grid.appendChild(btn);
    });
  }

  function moveGridFocus(delta) {
    const cells = Array.from(grid.querySelectorAll(".cd-day"));
    const idx = cells.indexOf(document.activeElement);
    const next = cells[Math.min(Math.max((idx < 0 ? 0 : idx) + delta, 0), cells.length - 1)];
    next?.focus();
  }

  // The popup always used to open downward, so a date field sitting low on
  // a page (e.g. the last field before a form's Salva/Annulla bar, itself
  // near the bottom of a short page) could push it partly past the
  // viewport — flip it to open upward instead whenever there isn't enough
  // room below but there is above, same behavior as a native <select>.
  function openPopup() {
    closeAllExcept(wrap);
    view = parseISO(input.value) ?? todayParts();
    renderGrid();
    wrap.classList.remove("cd-open-upward");
    wrap.classList.add("is-open");
    const wrapRect = wrap.getBoundingClientRect();
    const popupHeight = popup.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - wrapRect.bottom;
    if (popupHeight > spaceBelow && wrapRect.top > popupHeight) {
      wrap.classList.add("cd-open-upward");
    }
    trigger.setAttribute("aria-expanded", "true");
    (grid.querySelector(".cd-day.is-selected") ?? grid.querySelector(".cd-day:not(.is-outside)"))?.focus();
  }

  trigger.addEventListener("click", () => {
    if (wrap.classList.contains("is-open")) closePopup(wrap);
    else openPopup();
  });

  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPopup();
    }
  });

  popup.querySelector(".cd-nav-prev").addEventListener("click", () => {
    view = view.m === 0 ? { y: view.y - 1, m: 11, d: 1 } : { y: view.y, m: view.m - 1, d: 1 };
    renderGrid();
  });

  popup.querySelector(".cd-nav-next").addEventListener("click", () => {
    view = view.m === 11 ? { y: view.y + 1, m: 0, d: 1 } : { y: view.y, m: view.m + 1, d: 1 };
    renderGrid();
  });

  popup.querySelector(".cd-today").addEventListener("click", () => {
    const t = todayParts();
    input.value = toISO(t);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    closePopup(wrap);
    trigger.focus();
  });

  popup.querySelector(".cd-clear").addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    closePopup(wrap);
    trigger.focus();
  });

  grid.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveGridFocus(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveGridFocus(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveGridFocus(7);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveGridFocus(-7);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      document.activeElement?.click();
    } else if (e.key === "Escape") {
      closePopup(wrap);
      trigger.focus();
    } else if (e.key === "Tab") {
      closePopup(wrap);
    }
  });

  function syncTrigger() {
    const parsed = parseISO(input.value);
    label.textContent = parsed ? formatLabel(parsed) : "gg/mm/aaaa";
    label.classList.toggle("is-placeholder", !parsed);
    trigger.disabled = input.disabled;
    wrap.classList.toggle("is-disabled", input.disabled);
    if (wrap.classList.contains("is-open")) {
      view = parsed ?? todayParts();
      renderGrid();
    }
  }

  input.addEventListener("change", syncTrigger);
  input.addEventListener("input", syncTrigger);

  if (NATIVE_VALUE_DESCRIPTOR) {
    Object.defineProperty(input, "value", {
      configurable: true,
      enumerable: true,
      get() {
        return NATIVE_VALUE_DESCRIPTOR.get.call(this);
      },
      set(v) {
        NATIVE_VALUE_DESCRIPTOR.set.call(this, v);
        syncTrigger();
      },
    });
  }

  syncTrigger();
}

export function enhanceDateInputs(root = document) {
  root.querySelectorAll('input[type="date"]').forEach(enhanceDateInput);
}

document.addEventListener("click", (e) => {
  document.querySelectorAll(".cd-wrap.is-open").forEach((wrap) => {
    if (!wrap.contains(e.target)) closePopup(wrap);
  });
});

// form.reset() resets a field's value via an internal algorithm that
// bypasses the wrapped `value` setter above entirely — re-sync explicitly,
// a tick after the browser's own reset has actually applied.
document.addEventListener("reset", (e) => {
  if (!(e.target instanceof HTMLFormElement)) return;
  const form = e.target;
  setTimeout(() => {
    form.querySelectorAll(".cd-wrap input.cd-native").forEach((input) => {
      input.dispatchEvent(new Event("change", { bubbles: false }));
    });
  }, 0);
});
