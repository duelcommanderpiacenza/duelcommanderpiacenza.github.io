// One event on a timeline of events — the Bacheca's Eventi (js/home.js) and
// league.html's (js/league-detail.js) — the same markup on both (styles.css
// "The Bacheca's events"): on the line its date's circle (the day over the
// month; "?" without a date), its card beside it — the name over a line of
// its own (`place`), on the right `side` ("Liste", or the weekday over the
// time), behind the text, big and faint, its kind's emblem. A link when
// `href` is given.
// `state`: "played", "next" (the soonest to come), "future", or "pending"
// (league.html: its day passed, the results not in yet). `kind`: "local"
// (ours: red, the lotus), "online" (endstep's gold and black, its logo) or
// "external" (slate blue, a pin) — eventKind(ev).

import { endstepLogo, formatTime } from "./ui.js";
import { locale } from "./locale.js";

const PIN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>';

export const eventKind = (ev) => (ev?.is_external ? "external" : ev?.is_online ? "online" : "local");

const EMBLEM = {
  local: () => '<span class="home-ev-lotus"></span>',
  online: () => endstepLogo(),
  external: () => PIN_ICON,
};

// An event's date ("2026-11-24") as a Date at local midnight; null without one.
export const eventDate = (ev) => {
  if (!ev?.event_date) return null;
  const [y, m, d] = ev.event_date.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// An upcoming event's `side`: the weekday in full ("oggi" on the day) over
// the time; "" with neither.
export function whenHtml(ev, today) {
  const date = eventDate(ev);
  const weekday = ev.event_date === today ? "oggi" : date ? date.toLocaleDateString(locale(), { weekday: "long" }) : "";
  const time = ev.start_time ? `<b>${formatTime(ev.start_time)}</b>` : "";
  return weekday || time ? `<span class="home-ev-when">${weekday ? `<small>${weekday}</small>` : ""}${time}</span>` : "";
}

export function timelineRowHtml({ state, kind, date, title, place = "", side = "", href = "" }) {
  const node = date
    ? `<b>${String(date.getDate()).padStart(2, "0")}</b><span>${date.toLocaleDateString(locale(), { month: "short" }).replace(".", "")}</span>`
    : "<b>?</b>";
  const body = `
          <span class="home-ev-text">
            <span class="home-ev-name">${title}</span>
            ${place ? `<span class="home-ev-place">${place}</span>` : ""}
          </span>
          ${side}<span class="home-ev-wm">${EMBLEM[kind]()}</span>`;
  const card = href ? `<a class="home-ev-card" href="${href}">${body}</a>` : `<div class="home-ev-card">${body}</div>`;
  return `
      <li class="home-ev is-${state} is-${kind}">
        <span class="home-ev-node">${node}</span>
        ${card}
      </li>`;
}
