// The data's freshness, from the service worker (sw.js — Supabase's data
// answered from the last visit's copy at once, the fresh one fetched behind
// it):
//
// * "data-updated" — something on screen changed meanwhile (the network
//   slower than the service worker waits for — usually it answers in time
//   and the page gets the fresh data straight away). Just arrived on the
//   page (the first few seconds) and not touched yet: the page redraws
//   itself in place, quietly (router.refresh quiet — the old screen kept
//   until the new one is drawn, then a short cross-fade; no splash, no
//   animations again). Later, already being used (a tap, a key, a scroll),
//   or where that quiet swap isn't possible (no view transitions, reduced
//   motion): a small note offers it instead ("Dati aggiornati · Aggiorna")
//   — nothing moving under a finger.
// * "data-offline" — the network failed: a short note that what's shown is
//   from the last visit.
//
// Several changes at once (a page's many requests) count as one.

import { refresh } from "./router.js";

const REDRAW_WINDOW = 6000;
let shownAt = performance.now();
let touched = false;
let offlineShown = false;
let timer = null;
let note = null;

function hideNote() {
  note?.remove();
  note = null;
}

function showNote(text, action) {
  hideNote();
  note = document.createElement("div");
  note.className = "data-note";
  note.setAttribute("role", "status");
  note.innerHTML = `<span>${text}</span>`;
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action;
    btn.addEventListener("click", () => {
      hideNote();
      refresh({ keepScroll: true });
    });
    note.append(btn);
  } else {
    setTimeout(hideNote, 4000);
  }
  document.body.append(note);
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function onUpdated() {
  const quietPossible = Boolean(document.startViewTransition) && !reduceMotion.matches;
  if (quietPossible && !touched && performance.now() - shownAt < REDRAW_WINDOW) refresh({ keepScroll: true, quiet: true });
  else showNote("Dati aggiornati", "Aggiorna");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "data-updated") {
      clearTimeout(timer);
      timer = setTimeout(onUpdated, 300);
    } else if (e.data?.type === "data-offline" && !offlineShown) {
      offlineShown = true;
      showNote("Offline · dati dell'ultimo accesso", null);
    }
  });

  // A new page on screen (an in-app navigation, the redraw itself): the
  // window starts again.
  document.addEventListener("app:navigate", () => {
    shownAt = performance.now();
    touched = false;
    offlineShown = false;
    hideNote();
  });
  for (const type of ["pointerdown", "keydown"]) {
    window.addEventListener(type, () => (touched = true), { capture: true, passive: true });
  }
  window.addEventListener("scroll", () => {
    if (window.scrollY > 40) touched = true;
  }, { passive: true });
}
