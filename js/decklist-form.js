// account.html's "Invia la tua decklist" form (user, 2026-11-25 — from a
// mockup, made for phones first): 1. the event — only the next one (today's
// included) and the previous one (user: simpler), big tiles to tap, not a
// dropdown: the date, the name, the league; an event out of sends greyed out
// with "Inviata ✓" (the only badge — user); the likeliest one picked to
// start with — then 2. the list — one tap pastes it from the clipboard
// ("Incolla la lista"; refused or empty: the box opens for a normal paste),
// or "scrivila a mano"; a bar fills towards the deck's 100 cards (green at
// 100, amber past it; a link said as such), "Svuota" empties it — and the
// send button at the form's end (not sticky — user), just its icon and
// "Invia" (user); off until both are there. Sent:
// a big green tick, "Invia un'altra lista" while any event has a send left.
// The two-sends rule is said only when it matters: picking an event already
// sent once; the rest — where a list goes, that it isn't kept — behind the
// "?" in the box's corner (openDecklistHelp). js/account-page.js gives the
// events, the sends so far and the sending (`send`, its errors' text —
// `describeError`).
import { escapeHtml, eventTitle, formatDate, localIso } from "./ui.js";
import { locale } from "./locale.js";
import { openInfoDialog } from "./info-dialog.js";

// Sends allowed per event (the send-decklist function's MAX_SENDS, migration 009).
export const DECKLIST_MAX_SENDS = 2;
// A Duel Commander deck.
const DECK_SIZE = 100;
// Section names in a pasted list, not cards.
const SECTION = /^(commander|commanders|deck|mainboard|main|sideboard|companion|maybeboard)\s*:?$/i;

// What's in the box: a link (and to where), or its cards counted (a leading
// number is the quantity, "1 Sol Ring" / "1x Sol Ring").
function readList(text) {
  const t = text.trim();
  if (!t) return { empty: true };
  if (/^https?:\/\/\S+$/i.test(t)) {
    return { link: /moxfield\./i.test(t) ? "Link Moxfield" : /archidekt\./i.test(t) ? "Link Archidekt" : "Link alla lista" };
  }
  let cards = 0;
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(\/\/|#)/.test(line) || SECTION.test(line)) continue;
    const quantity = line.match(/^(\d+)\s*x?\s+\S/i);
    cards += quantity ? Number(quantity[1]) : 1;
  }
  return { cards };
}

// The "?" in the box's corner (user, 2026-11-25 — in place of a line under
// the button): what happens to a list, as three steps along a line (sent →
// emailed → not kept), the two-sends rule as "1 → 2", and what if sending
// fails. In the site's pop-up (js/info-dialog.js); styles: css/5
// "decklist-help". Icons (docs/icons.md): the send's plane, an envelope
// (email), an eye crossed out (not kept on the site).
const HELP_STEPS = [
  [
    '<path d="M22 2 11 13"></path><path d="M22 2 15 22l-4-9-9-4Z"></path>',
    "Scegli l'evento e incolla la lista",
    "Il prossimo evento o l'ultimo: il testo della lista oppure un link (Moxfield, Archidekt…).",
  ],
  [
    '<rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>',
    "Arriva agli organizzatori",
    "Per email, con l'evento e il tuo nome nell'oggetto. Se ti rispondono, scrivono al tuo indirizzo.",
  ],
  [
    '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"></path><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"></path><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"></path><path d="m2 2 20 20"></path>',
    "Non resta sul sito",
    "La lista non viene salvata: il sito ricorda solo che l'hai inviata.",
  ],
];
const HELP_HTML = `
  <ol class="decklist-help-steps">
    ${HELP_STEPS.map(
      ([icon, title, text]) => `
    <li><span class="decklist-help-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg></span><span><b>${title}</b>${text}</span></li>`
    ).join("")}
  </ol>
  <div class="decklist-help-sends">
    <div class="decklist-help-slots" aria-hidden="true">
      <span class="decklist-help-slot">1</span>
      <span class="decklist-help-arrow">→</span>
      <span class="decklist-help-slot is-second">2</span>
    </div>
    <p><b>Due invii per evento</b>Hai sbagliato qualcosa? Inviane un'altra: sostituisce la prima. Dopo il secondo invio l'evento risulta «Inviata ✓».</p>
  </div>
  <p class="decklist-help-fallback">Se l'invio non riesce, ti diciamo come mandarla a mano via email.</p>`;

function openDecklistHelp() {
  openInfoDialog({ id: "decklist-help-dialog", title: "Come funziona", subtitle: "Invia la tua decklist", bodyHtml: HELP_HTML });
}

// The day over its month ("5" / "dic").
function dateChipHtml(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const month = d.toLocaleDateString(locale(), { month: "short" }).replace(".", "");
  return `<span class="decklist-date" aria-hidden="true"><b>${d.getDate()}</b>${escapeHtml(month)}</span>`;
}

// The event likeliest wanted, of the two: the next one when it's today;
// else the previous one when it was yesterday (a list sent after the event,
// past midnight); else the next one; else the previous one — whichever has a
// send left.
function likeliest(events) {
  const open = events.filter((ev) => ev.sendsLeft > 0);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return (
    open.find((ev) => ev.event_date === localIso()) ??
    open.find((ev) => ev.event_date === localIso(y)) ??
    open.find((ev) => ev.upcoming) ??
    open[0] ??
    null
  );
}

/**
 * @param {HTMLElement} card - the #profile-decklist section.
 * @param {{ send: (ev: Object, text: string) => Promise<void>, describeError: (err: Error, ev: Object, text: string) => string }} options -
 *   `send` throws on failure; `describeError` gives the message's HTML for it.
 * @returns {{ setEvents: (events: Array, sendCount: Map<string, number>) => void }}
 */
export function initDecklistForm(card, { send, describeError }) {
  const $ = (sel) => card.querySelector(sel);
  const form = $("#decklist-form");
  const none = $("#decklist-none");
  const eventsEl = $("#decklist-events");
  const note = $("#decklist-note");
  const stepEvent = $("#decklist-step-event");
  const stepList = $("#decklist-step-list");
  const paste = $("#decklist-paste");
  const or = $("#decklist-or");
  const text = $("#decklist-text");
  const meter = $("#decklist-meter");
  const bar = meter.querySelector(".decklist-bar i");
  const count = meter.querySelector(".decklist-count");
  const submit = $("#decklist-submit");
  const submitLabel = submit.querySelector(".decklist-submit-label");
  const message = $("#decklist-message");
  const done = $("#decklist-done");
  const doneText = $("#decklist-done-text");
  const doneMore = $("#decklist-done-more");
  const again = $("#decklist-again");
  $("#decklist-help").addEventListener("click", openDecklistHelp);

  // The box's placeholder: a list's start, or (the clipboard unreadable)
  // how to paste by hand.
  const TEXT_PLACEHOLDER = text.placeholder;
  const PASTE_HERE = "Tieni premuto qui e scegli «Incolla»";

  let events = []; // { ...event, sendsLeft }
  let picked = null;
  let sending = false;

  const setMessage = (html, kind = "error") => {
    message.className = html ? `form-message is-${kind}` : "form-message";
    message.innerHTML = html;
  };

  function drawEvents() {
    eventsEl.innerHTML = events
      .map((ev) => {
        const out = ev.sendsLeft <= 0;
        return `<button type="button" class="decklist-ev" role="radio" aria-checked="${ev === picked}" data-id="${escapeHtml(ev.id)}"${
          out ? " disabled" : ""
        } aria-label="${escapeHtml(`${eventTitle(ev)}, ${formatDate(ev.event_date)}`)}">
          ${dateChipHtml(ev.event_date)}
          <span class="decklist-ev-text">
            <span class="decklist-ev-name">${escapeHtml(eventTitle(ev))}</span>
            ${ev.league?.name ? `<span class="decklist-ev-sub">${escapeHtml(ev.league.name)}</span>` : ""}
            ${out ? '<span class="decklist-ev-done">Inviata ✓</span>' : ""}
          </span>
          <span class="decklist-radio" aria-hidden="true"></span>
        </button>`;
      })
      .join("");
    markPicked();
  }

  // The pick shown — the tiles marked in place, not redrawn (a redraw lost
  // the tapped tile and let the page jump on phones — user).
  function markPicked() {
    for (const tile of eventsEl.querySelectorAll(".decklist-ev")) {
      tile.setAttribute("aria-checked", String(tile.dataset.id === picked?.id));
    }
    note.hidden = !picked || picked.sendsLeft !== 1;
    update();
  }

  function showBox(value = "") {
    paste.hidden = true;
    or.hidden = true;
    text.hidden = false;
    text.value = value;
    update();
  }

  function resetBox() {
    text.value = "";
    text.hidden = true;
    paste.hidden = false;
    or.hidden = false;
    update();
  }

  function update() {
    const list = readList(text.value);
    meter.hidden = list.empty;
    meter.classList.toggle("is-link", Boolean(list.link));
    meter.classList.toggle("is-full", list.cards === DECK_SIZE);
    meter.classList.toggle("is-over", list.cards > DECK_SIZE);
    if (list.link) count.textContent = list.link;
    else if (!list.empty) {
      bar.style.width = `${Math.min(100, (list.cards / DECK_SIZE) * 100)}%`;
      count.textContent = list.cards === DECK_SIZE ? `${DECK_SIZE} carte ✓` : `${list.cards} / ${DECK_SIZE}`;
    }
    stepEvent.classList.toggle("is-done", Boolean(picked));
    stepList.classList.toggle("is-done", !list.empty);
    submit.disabled = sending || !picked || list.empty;
    if (!sending) submitLabel.textContent = "Invia";
  }

  function render() {
    const open = events.some((ev) => ev.sendsLeft > 0);
    form.hidden = !open;
    none.hidden = open;
    none.textContent = events.length
      ? "Hai già inviato la decklist per tutti gli eventi disponibili."
      : "Nessun evento disponibile: puoi inviare la decklist per il prossimo evento o per l'ultimo.";
    if (picked && !events.some((ev) => ev.id === picked.id && ev.sendsLeft > 0)) picked = null;
    else if (picked) picked = events.find((ev) => ev.id === picked.id);
    picked ??= likeliest(events);
    drawEvents();
  }

  eventsEl.addEventListener("click", (e) => {
    const tile = e.target.closest(".decklist-ev");
    if (!tile || tile.disabled) return;
    picked = events.find((ev) => ev.id === tile.dataset.id) ?? null;
    setMessage("");
    markPicked();
  });

  // One tap: the clipboard's text in the box. Not allowed (no permission,
  // not HTTPS, an older browser) or empty: the box opened, saying how to
  // paste — not focused: on a phone the keyboard opening scrolls the page,
  // which nothing can hold still (user: the page mustn't move).
  paste.addEventListener("click", async () => {
    let clip = "";
    try {
      clip = (await navigator.clipboard?.readText?.()) ?? "";
    } catch {
      // Refused: the box, with its hint.
    }
    text.placeholder = clip.trim() ? TEXT_PLACEHOLDER : PASTE_HERE;
    showBox(clip.trim());
  });
  // Typing it: the box focused — the keyboard's what's wanted here.
  $("#decklist-type").addEventListener("click", () => {
    text.placeholder = TEXT_PLACEHOLDER;
    showBox();
    text.focus({ preventScroll: true });
  });
  $("#decklist-clear").addEventListener("click", () => {
    setMessage("");
    resetBox();
  });
  text.addEventListener("input", update);

  // Sent straight away — no confirmation step (since 2026-10-28).
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submit.disabled || !picked) return;
    const ev = picked;
    const list = text.value;
    setMessage("");
    sending = true;
    submit.classList.add("is-sending");
    submitLabel.textContent = "Invio in corso…";
    update();
    try {
      await send(ev, list);
    } catch (err) {
      sending = false;
      submit.classList.remove("is-sending");
      setMessage(describeError(err, ev, list));
      // Out of sends (another tab, another device): it leaves the choice.
      if (err?.message === "already_sent") {
        ev.sendsLeft = 0;
        render();
      } else update();
      return;
    }
    sending = false;
    submit.classList.remove("is-sending");
    ev.sendsLeft -= 1;
    doneText.textContent = `Per ${eventTitle(ev)}: gli organizzatori la ricevono via email.`;
    doneMore.hidden = ev.sendsLeft !== 1;
    again.hidden = !events.some((x) => x.sendsLeft > 0);
    form.hidden = true;
    done.hidden = false;
  });

  again.addEventListener("click", () => {
    done.hidden = true;
    resetBox();
    render();
  });

  return {
    // `list`: decklist_events()'s events (upcoming soonest first, then past
    // newest first) — only the next one and the previous one shown;
    // `sendCount`: event id → sends so far.
    setEvents(list, sendCount) {
      events = [list.find((ev) => ev.upcoming), list.find((ev) => !ev.upcoming)]
        .filter(Boolean)
        .map((ev) => ({ ...ev, sendsLeft: DECKLIST_MAX_SENDS - (sendCount.get(ev.id) ?? 0) }));
      done.hidden = true;
      setMessage("");
      resetBox();
      render();
    },
  };
}
