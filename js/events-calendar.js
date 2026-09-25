// "Calendario" overlay on the Bacheca's "Prossimi eventi" card: a full
// month grid marking every event (past and future — same set the public
// site can see elsewhere, via Events.list()), so a visitor can browse any
// month rather than only the next few upcoming ones "Prossimi eventi"
// itself is limited to. Grid math mirrors js/custom-date.js's own
// (duplicated, not imported — that module builds a single <input>'s popup,
// this builds one shared dialog with an events side-panel, different enough
// shapes that sharing the functions wouldn't be simpler than repeating the
// handful of small ones involved).

import { Events } from "./db.js";
import { escapeHtml, eventTitle, formatTime } from "./ui.js";

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAYS_IT = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];
const GRID_CELLS = 42;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoOf(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
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

function firstWeekdayMondayIndex(y, m) {
  return (new Date(y, m, 1).getDay() + 6) % 7;
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

function init() {
  const trigger = document.getElementById("events-calendar-btn");
  const dialog = document.getElementById("events-calendar-dialog");
  if (!trigger || !dialog) return;

  const monthLabel = dialog.querySelector(".ecal-month-label");
  const weekdaysEl = dialog.querySelector(".ecal-weekdays");
  const grid = dialog.querySelector(".ecal-grid");
  const dayPanel = dialog.querySelector(".ecal-day-panel");

  weekdaysEl.innerHTML = WEEKDAYS_IT.map((w) => `<span>${w}</span>`).join("");

  let view = todayParts();
  let selected = todayParts();
  // eventsByDate: ISO date -> events[]. Fetched once, lazily, on first open
  // — no need to slow down the rest of the homepage's initial load for a
  // widget that starts closed.
  let eventsByDate = null;
  let loadPromise = null;

  async function loadEvents() {
    if (eventsByDate) return eventsByDate;
    if (!loadPromise) {
      loadPromise = Events.list().then((events) => {
        const map = new Map();
        for (const ev of events) {
          if (!ev.event_date) continue;
          if (!map.has(ev.event_date)) map.set(ev.event_date, []);
          map.get(ev.event_date).push(ev);
        }
        eventsByDate = map;
        return map;
      });
    }
    return loadPromise;
  }

  function renderDayPanel() {
    const iso = isoOf(selected.y, selected.m, selected.d);
    // No date heading here — the selected day is already highlighted in the
    // grid right above, so repeating it only costs vertical space.
    const dayEvents = (eventsByDate?.get(iso) ?? []).slice().sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

    dayPanel.innerHTML = `
      ${
        dayEvents.length === 0
          ? '<p class="ecal-day-panel-empty">Nessun evento in questo giorno.</p>'
          : `<div class="dashboard-event-list">
              ${dayEvents
                .map((ev) => {
                  const leaguePrefix = ev.league ? `${escapeHtml(ev.league.name)} &middot; ` : "";
                  // A future event with no start time set yet still reads as
                  // scheduled ("In programma") rather than a bare dash.
                  const time = ev.start_time
                    ? `ore ${formatTime(ev.start_time)}`
                    : ev.is_open
                      ? "In programma"
                      : "&mdash;";
                  const inner = `
                    <span class="dashboard-event-name">${escapeHtml(eventTitle(ev))}</span>
                    <span class="dashboard-event-meta">${leaguePrefix}${time}</span>`;
                  // A still-open event has no published entries/matches yet,
                  // same reason the homepage's "Ultimi eventi" widget
                  // excludes it entirely (js/home.js) — here it stays
                  // visible on the calendar (so it's still marked as
                  // happening) but isn't a link, since event.html has
                  // nothing to show for it yet.
                  return ev.is_open
                    ? `<div class="dashboard-event-row ecal-event-row-future">${inner}</div>`
                    : `<a class="dashboard-event-row" href="event.html?id=${ev.id}">${inner}</a>`;
                })
                .join("")}
            </div>`
      }`;
  }

  function renderGrid() {
    monthLabel.textContent = `${MONTHS_IT[view.m]} ${view.y}`;
    const today = todayParts();
    grid.innerHTML = "";
    buildGrid(view.y, view.m).forEach((cell) => {
      const iso = isoOf(cell.y, cell.m, cell.d);
      const hasEvents = eventsByDate?.has(iso);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cd-day ecal-day";
      btn.textContent = String(cell.d);
      if (cell.outside) btn.classList.add("is-outside");
      if (sameDate(cell, today)) btn.classList.add("is-today");
      if (sameDate(cell, selected)) btn.classList.add("is-selected");
      if (hasEvents) btn.classList.add("has-events");
      btn.addEventListener("click", () => {
        selected = cell;
        if (cell.outside) {
          view = { y: cell.y, m: cell.m };
          renderGrid();
        } else {
          grid.querySelectorAll(".ecal-day.is-selected").forEach((el) => el.classList.remove("is-selected"));
          btn.classList.add("is-selected");
        }
        renderDayPanel();
      });
      grid.appendChild(btn);
    });
  }

  async function open() {
    view = { y: selected.y, m: selected.m };
    dialog.showModal();
    renderGrid();
    renderDayPanel();
    await loadEvents();
    renderGrid();
    renderDayPanel();
  }

  trigger.addEventListener("click", open);
  dialog.querySelector(".ecal-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.querySelector(".ecal-nav-prev").addEventListener("click", () => {
    view = view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 };
    renderGrid();
  });
  dialog.querySelector(".ecal-nav-next").addEventListener("click", () => {
    view = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 };
    renderGrid();
  });
}

init();
