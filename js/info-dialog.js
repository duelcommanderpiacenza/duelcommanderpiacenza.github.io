// The site's small explanation pop-up, opened by a round "?" (.help-toggle-
// btn): a native modal <dialog> (Escape/backdrop close for free, same as the
// Bacheca's events calendar, whose .ecal-dialog look it shares) with a
// title, a × and the given content (styles.css .info-dialog). Used by
// player.html's "Carte speciali" (js/commander-carousel.js) and Matchups'
// "how to read the matrix" (js/matchups-page.js).
//
// Built once per id, on first use, then just reopened. Every way out (×,
// backdrop click, Escape) plays the exit animation (.info-dialog.is-closing)
// before the real close() — which would otherwise hide it on the spot.
// Closes straight away when there's no animation to wait for (reduced
// motion).

import { escapeHtml } from "./ui.js";

/**
 * @param {{ id: string, title: string, bodyHtml: string }} options
 *   bodyHtml: the content under the title (trusted markup, not escaped).
 * @returns {HTMLDialogElement} the dialog (e.g. to finish its content with
 *   JS — js/card-cosmetics.js dresses its preview cards).
 */
export function openInfoDialog({ id, title, bodyHtml }) {
  let dialog = document.getElementById(id);
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = id;
    dialog.className = "ecal-dialog info-dialog";
    dialog.setAttribute("aria-labelledby", `${id}-title`);
    // The content scrolls on its own under the title (.info-dialog-body), so
    // a long one's scrollbar stays inside the rounded box.
    dialog.innerHTML = `
      <div class="info-dialog-head">
        <h3 id="${id}-title">${escapeHtml(title)}</h3>
        <button type="button" class="ecal-close" aria-label="Chiudi">&times;</button>
      </div>
      <div class="info-dialog-body">${bodyHtml}</div>`;
    const closeAnimated = () => {
      if (dialog.classList.contains("is-closing")) return;
      if (getComputedStyle(dialog).animationName === "none") return dialog.close();
      dialog.classList.add("is-closing");
      dialog.addEventListener(
        "animationend",
        () => {
          dialog.classList.remove("is-closing");
          dialog.close();
        },
        { once: true }
      );
    };
    dialog.querySelector(".ecal-close").addEventListener("click", closeAnimated);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeAnimated();
    });
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeAnimated();
    });
    document.body.append(dialog);
  }
  dialog.showModal();
  return dialog;
}
