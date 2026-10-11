// Section tabs (account.html's look — styles.css .profile-tabs / .profile-tab):
// each button's data-tab names the panel it shows; the panel shown gets
// .is-current (the page's CSS hides the others), the button .is-active and
// aria-selected. The first tab open to start with. Used by event.html and
// commander.html (there only on phones and touch screens — the CSS
// decides); account.html has its own (tabs come and go with its sections).
export function initTabs(tabsEl) {
  const buttons = tabsEl ? [...tabsEl.querySelectorAll(".profile-tab[data-tab]")] : [];
  const select = (panelId) => {
    for (const b of buttons) {
      const on = b.dataset.tab === panelId;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
      document.getElementById(b.dataset.tab)?.classList.toggle("is-current", on);
    }
  };
  for (const b of buttons) b.addEventListener("click", () => select(b.dataset.tab));
  if (buttons.length) select(buttons[0].dataset.tab);
}
