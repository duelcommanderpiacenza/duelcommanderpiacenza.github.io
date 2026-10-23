// An upcoming event's countdown — Leghe & Eventi's red "Prossimo evento"
// tile: "tra N giorni", "domani", then on the day "tra N ore" / "tra N min"
// (just "oggi" without a start time), and "in corso" once it has started,
// for the rest of its day (an open event stays the next one until the day
// is over). Kept up to date by startCountdowns while the page is open.

const LIVE = "in corso";
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

function countdownLabel(dateIso, time, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${dateIso}T00:00:00`) - today) / DAY);
  if (days > 1) return `tra ${days} giorni`;
  if (days === 1) return "domani";
  if (!time) return "oggi";
  const minutes = Math.ceil((new Date(`${dateIso}T${time}`) - now) / MINUTE);
  if (minutes <= 0) return LIVE;
  if (minutes < 60) return `tra ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `tra ${hours} ${hours === 1 ? "ora" : "ore"}`;
}

// The label in a span startCountdowns keeps up to date (`.countdown`, plus
// `.is-live` once started, and any `className`). "" with no date.
export function countdownHtml(ev, className = "") {
  if (!ev?.event_date) return "";
  const label = countdownLabel(ev.event_date, ev.start_time);
  const cls = `countdown${className ? ` ${className}` : ""}${label === LIVE ? " is-live" : ""}`;
  return `<span class="${cls}" data-countdown="${ev.event_date}" data-countdown-time="${ev.start_time ?? ""}">${label}</span>`;
}

// Every countdown in the page refreshed every 30 seconds until `signal`
// aborts (the page left).
export function startCountdowns(signal) {
  const timer = setInterval(() => {
    for (const el of document.querySelectorAll("[data-countdown]")) {
      const label = countdownLabel(el.dataset.countdown, el.dataset.countdownTime);
      if (el.textContent !== label) el.textContent = label;
      el.classList.toggle("is-live", label === LIVE);
    }
  }, 30 * 1000);
  signal.addEventListener("abort", () => clearInterval(timer), { once: true });
}
