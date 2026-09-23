// Wires up the click-to-open/close behavior for the phones-only nav
// dropdown trigger. The trigger button and its label are static HTML in
// every page (same as the page's own <h1> — present in the very first
// paint, not waiting on this deferred module), and the plain <a
// class="nav-link"> list is likewise real, untouched markup, only hidden
// by the synchronous html.nav-mobile class (set by the inline head
// script). This file only adds the open/close interaction on top of both.

function closeDropdown(nav) {
  nav.classList.remove("is-open");
  nav.querySelector(".nav-dropdown-trigger")?.setAttribute("aria-expanded", "false");
}

function init() {
  const nav = document.querySelector(".site-nav");
  const trigger = nav?.querySelector(".nav-dropdown-trigger");
  if (!nav || !trigger) return;

  trigger.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) closeDropdown(nav);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      closeDropdown(nav);
      trigger.focus();
    }
  });
}

init();
