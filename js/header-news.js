// "Novità": the bell in every public page's header (#site-news, static
// markup like the rest of the header, before the search and the account
// button). The active announcements (Announcements.listActive — expired ones
// left out, newest first) are fetched once per page load (the header stays
// across in-app navigations); a click opens them in the shared pop-up
// (js/info-dialog.js) with its own look (.news-dialog: a red band with the
// bell, the announcements across its width with a thin rule between them,
// the unread ones marked "Nuovo"). The red
// badge on the bell counts the ones this browser hasn't opened yet (their ids
// in localStorage "seenNews"), and goes once the bell is clicked. The bell
// itself is shown only while there's something unread: it grows in once
// they're loaded, and shrinks away when the pop-up that read them closes.
// An event's own one (made when it's first closed — migration
// 022: announcements.event_id) gets a button to the event's page;
// following it closes the pop-up.

import { Announcements } from "./db.js";
import { escapeHtml } from "./ui.js";
import { openInfoDialog } from "./info-dialog.js";

const SEEN_KEY = "seenNews";

const BELL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>';

function readSeen() {
  try {
    const ids = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode / storage full: the badge just shows again next time.
  }
}

// The pop-up's content: the announcements one under the other (the unread
// ones marked "Nuovo"), each fading in a beat after the one before; none: a
// big faded bell and a line.
function bodyHtml(announcements, unseen) {
  if (announcements.length === 0) {
    return `<div class="news-empty">${BELL_ICON}<p>Nessuna novità al momento.</p></div>`;
  }
  return `<div class="news-list">${announcements
    .map(
      (a, i) => `
      <article class="news-item${unseen.has(String(a.id)) ? " is-new" : ""}" style="animation-delay: ${80 + i * 70}ms">
        ${unseen.has(String(a.id)) ? '<span class="news-new">Nuovo</span>' : ""}
        <h4 class="news-title">${escapeHtml(a.title)}</h4>
        <p class="news-body">${escapeHtml(a.body)}</p>
        ${a.event_id ? `<a class="btn-primary news-link" href="event.html?id=${encodeURIComponent(a.event_id)}">Vai all'evento<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg></a>` : ""}
      </article>`
    )
    .join("")}</div>`;
}

function subtitleFor(announcements, unseenCount) {
  if (announcements.length === 0) return "";
  const total = announcements.length === 1 ? "1 annuncio" : `${announcements.length} annunci`;
  return unseenCount ? `${total} · ${unseenCount} da leggere` : total;
}

async function init() {
  const button = document.getElementById("site-news");
  const badge = button?.querySelector(".site-news-badge");
  if (!button || !badge) return;

  let announcements = [];
  const loaded = Announcements.listActive()
    .then((rows) => {
      announcements = rows;
    })
    .catch((err) => console.error(err));

  const unseenIds = () => {
    const seen = readSeen();
    return new Set(announcements.map((a) => String(a.id)).filter((id) => !seen.has(id)));
  };

  function syncBadge() {
    const unseen = unseenIds().size;
    badge.hidden = unseen === 0;
    badge.textContent = unseen > 9 ? "9+" : String(unseen);
    button.setAttribute("aria-label", unseen ? `Novità (${unseen} da leggere)` : "Novità");
  }

  // The bell is there only while something is unread (styles.css
  // .site-news.has-news): arriving it grows in and swings once
  // (.is-arriving, dropped after — so it doesn't replay when a page change
  // hides and shows it again); once all is read, at the pop-up's closing, it
  // shrinks away (.is-leaving). Still where motion is reduced.
  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function reveal() {
    button.classList.add("has-news");
    if (still()) return;
    button.classList.add("is-arriving");
    setTimeout(() => button.classList.remove("is-arriving"), 1300);
  }
  function dismiss() {
    if (!button.classList.contains("has-news")) return;
    const done = () => {
      // Focus back on the bell (the pop-up returns it there): hand it on to
      // the search button, not lost with the bell.
      if (document.activeElement === button) document.getElementById("site-search-trigger")?.focus({ preventScroll: true });
      button.classList.remove("has-news", "is-arriving", "is-leaving");
    };
    if (still() || getComputedStyle(button).display === "none") return done();
    button.classList.add("is-leaving");
    setTimeout(done, 220);
  }

  button.addEventListener("click", async () => {
    await loaded;
    const unseen = unseenIds();
    const dialog = openInfoDialog({
      id: "news-dialog",
      className: "news-dialog",
      title: "Novità",
      subtitle: subtitleFor(announcements, unseen.size),
      bodyHtml: bodyHtml(announcements, unseen),
    });
    // (Once per dialog — it's built once, then reopened.)
    if (!dialog.dataset.linksWired) {
      dialog.dataset.linksWired = "";
      dialog.addEventListener("click", (e) => {
        if (e.target.closest?.(".news-link")) dialog.close();
      });
      // All read now: the bell goes once the pop-up is closed.
      dialog.addEventListener("close", () => {
        if (unseenIds().size === 0) dismiss();
      });
    }
    // Every one shown is now seen (the ones no longer active dropped, so the
    // list doesn't grow forever).
    writeSeen(new Set(announcements.map((a) => String(a.id))));
    syncBadge();
  });

  await loaded;
  syncBadge();
  if (unseenIds().size) reveal();
}

init();
