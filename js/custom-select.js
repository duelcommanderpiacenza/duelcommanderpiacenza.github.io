// Skins every native <select> with a custom-styled trigger + popup list, so
// the open dropdown matches the site's rounded/card look instead of the
// browser's plain native listbox (which can't be styled reliably across
// browsers any other way). The native <select> stays the single source of
// truth for .value/.disabled/its <option> list — every existing call site
// elsewhere in the codebase that reads `select.value`, listens for
// "change", or rewrites the <option> list (fillSelect, scope-filter's
// populateEvents, admin onEdit/resetForm handlers) keeps working completely
// untouched.
//
// Two things make that safe to do without touching those call sites:
//  1. Options get rebuilt live via `.innerHTML =` in several places while a
//     form may be mid-edit — a MutationObserver on the select mirrors that
//     into the custom menu automatically.
//  2. Several admin handlers set `.value = x` directly with no accompanying
//     "change" event (confirmed by an audit of every select in the repo) —
//     caught by wrapping the native `value` setter on each enhanced select,
//     so *any* assignment, from anywhere, re-syncs the custom UI.

const ENHANCED = new WeakSet();
const NATIVE_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");

function closeMenu(wrap) {
  wrap.classList.remove("is-open");
  wrap.querySelector(".cs-trigger").setAttribute("aria-expanded", "false");
}

function closeAllExcept(except) {
  document.querySelectorAll(".cs-wrap.is-open").forEach((wrap) => {
    if (wrap !== except) closeMenu(wrap);
  });
}

// Same "flip upward when there isn't room below" behavior as the date
// popup (js/custom-date.js) — otherwise a select low on the page (e.g. the
// admin's match form, sitting above a scrolled-to bottom bar) opens a menu
// that spills past the viewport instead of over it.
function openMenu(wrap) {
  if (wrap.classList.contains("is-disabled")) return;
  closeAllExcept(wrap);
  wrap.classList.remove("cs-open-upward");
  // A searchable menu always opens unfiltered, whatever was typed last time.
  const search = wrap.querySelector(".cs-search");
  if (search) {
    search.value = "";
    applySearchFilter(wrap);
  }
  wrap.classList.add("is-open");
  wrap.querySelector(".cs-trigger").setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".cs-menu");
  const wrapRect = wrap.getBoundingClientRect();
  const menuHeight = menu.getBoundingClientRect().height;
  const spaceBelow = window.innerHeight - wrapRect.bottom;
  if (menuHeight > spaceBelow && wrapRect.top > menuHeight) {
    wrap.classList.add("cs-open-upward");
  }
  const active = menu.querySelector('.cs-option[aria-selected="true"]') || menu.querySelector(".cs-option");
  if (search) {
    // Typing starts right away; the current choice is scrolled into view.
    active?.scrollIntoView({ block: "nearest" });
    search.focus();
  } else {
    active?.focus();
  }
}

// Case- and accent-insensitive, so "nicolo" finds "Nicolò".
function normalizeForSearch(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// data-searchable selects only: hides the options whose label doesn't
// contain the typed text, with a "Nessun risultato" line when none match.
function applySearchFilter(wrap) {
  const search = wrap.querySelector(".cs-search");
  const list = wrap.querySelector(".cs-options");
  if (!search || !list) return;
  const term = normalizeForSearch(search.value.trim());
  let visible = 0;
  list.querySelectorAll(".cs-option").forEach((row) => {
    const match = !term || normalizeForSearch(row.textContent).includes(term);
    row.hidden = !match;
    if (match) visible += 1;
  });
  let empty = list.querySelector(".cs-empty");
  if (visible === 0) {
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "cs-empty";
      empty.textContent = "Nessun risultato";
      list.appendChild(empty);
    }
  } else {
    empty?.remove();
  }
}

function currentLabel(select) {
  const opt = select.options[select.selectedIndex];
  return opt ? opt.textContent : "";
}

function selectValue(select, value) {
  select.value = value; // goes through the wrapped setter below, which re-syncs the UI
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

// An <option> can carry an icon two ways — data-icon (a URL, e.g. a
// custom-uploaded badge image) or data-icon-text (a single emoji/glyph,
// e.g. a badge's fixed icon). Both render into an identically-sized
// .cs-option-icon box (see CSS) so an image and an emoji end up on the
// same vertical anchor — an emoji left as plain inline text next to the
// label would sit wherever the font's own glyph metrics happen to place
// it, which rarely lines up with a flex-centered <img>. Built as real DOM
// elements rather than an HTML string, so there's no need to hand-escape
// the option's own text.
function appendOptionIcon(container, opt) {
  const iconUrl = opt.dataset.icon;
  const iconText = opt.dataset.iconText;
  if (iconUrl) {
    const img = document.createElement("img");
    img.className = "cs-option-icon";
    img.src = iconUrl;
    img.alt = "";
    container.appendChild(img);
  } else if (iconText) {
    const span = document.createElement("span");
    span.className = "cs-option-icon cs-option-icon-text";
    span.textContent = iconText;
    container.appendChild(span);
  }
}

function rebuildMenu(wrap, select) {
  // A searchable menu keeps its search field; only the list below it is
  // rebuilt (and re-filtered by whatever is typed, at the end).
  const menu = wrap.querySelector(".cs-options") ?? wrap.querySelector(".cs-menu");
  menu.innerHTML = "";
  Array.from(select.options).forEach((opt) => {
    // A native <option hidden> (e.g. a "Ordina per..." placeholder that's
    // the default .value but shouldn't be a real, re-choosable entry) is
    // already skipped by the browser's own native dropdown for free —
    // this popup is hand-built from scratch instead, so it needs the same
    // check explicitly, or a hidden option would still render as a normal
    // clickable row here.
    if (opt.hidden) return;
    const row = document.createElement("div");
    row.className = "cs-option";
    row.setAttribute("role", "option");
    row.tabIndex = -1;
    row.dataset.value = opt.value;
    appendOptionIcon(row, opt);
    // An option can carry a data-label/data-sublabel pair (e.g. the event
    // filter's "event name" + "league name") for a two-line row instead of
    // the plain single-line text — opt.textContent itself is untouched
    // either way, so the native <select> (no-JS fallback, screen readers)
    // still reads the full combined string exactly as before.
    if (opt.dataset.label) {
      // .cs-option is itself a flex row (for icon + text side by side on
      // selects that use one) — label/sublabel need their own column-flex
      // wrapper to actually stack, rather than sitting as two more items
      // in that same row.
      const textWrap = document.createElement("span");
      textWrap.className = "cs-option-text";
      const label = document.createElement("span");
      label.className = "cs-option-label";
      label.textContent = opt.dataset.label;
      textWrap.appendChild(label);
      if (opt.dataset.sublabel) {
        const sublabel = document.createElement("span");
        sublabel.className = "cs-option-sublabel";
        sublabel.textContent = opt.dataset.sublabel;
        textWrap.appendChild(sublabel);
      }
      row.appendChild(textWrap);
    } else {
      const label = document.createElement("span");
      label.textContent = opt.textContent;
      row.appendChild(label);
    }
    row.addEventListener("click", () => {
      selectValue(select, opt.value);
      closeMenu(wrap);
      wrap.querySelector(".cs-trigger").focus();
    });
    menu.appendChild(row);
  });
  applySearchFilter(wrap);
}

function syncUI(wrap, select) {
  rebuildMenu(wrap, select);
  const menu = wrap.querySelector(".cs-menu");
  menu.querySelectorAll(".cs-option").forEach((row) => {
    row.setAttribute("aria-selected", row.dataset.value === select.value ? "true" : "false");
  });

  const triggerIcon = wrap.querySelector(".cs-trigger-icon");
  triggerIcon.innerHTML = "";
  const selectedOption = select.options[select.selectedIndex];
  if (selectedOption) appendOptionIcon(triggerIcon, selectedOption);

  wrap.querySelector(".cs-trigger-label").textContent = currentLabel(select);
  const trigger = wrap.querySelector(".cs-trigger");
  trigger.disabled = select.disabled;
  wrap.classList.toggle("is-disabled", select.disabled);
}

// Skips options hidden by the search filter. On a searchable menu, going up
// from the first option returns to the search field.
function moveMenuFocus(menu, delta) {
  const rows = Array.from(menu.querySelectorAll(".cs-option")).filter((row) => !row.hidden);
  if (rows.length === 0) return;
  const idx = rows.indexOf(document.activeElement);
  const search = menu.querySelector(".cs-search");
  if (search && idx === 0 && delta < 0) {
    search.focus();
    return;
  }
  const next = rows[(idx + delta + rows.length) % rows.length];
  next.focus();
}

export function enhanceSelect(select) {
  if (ENHANCED.has(select) || !select.parentNode) return;
  ENHANCED.add(select);

  const wrap = document.createElement("div");
  wrap.className = "cs-wrap";
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add("cs-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "cs-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML =
    '<span class="cs-trigger-icon"></span><span class="cs-trigger-label"></span><span class="cs-trigger-arrow" aria-hidden="true"></span>';

  const menu = document.createElement("div");
  menu.className = "cs-menu";
  menu.setAttribute("role", "listbox");

  // Opt-in (data-searchable on the <select>, for long lists like the admin
  // entry form's players/commanders): a search field at the top of the
  // menu, filtering the options below it as you type. A plain text input,
  // not type="search" — that one picks up the site's own search-box styles.
  const search = select.hasAttribute("data-searchable") ? document.createElement("input") : null;
  if (search) {
    search.type = "text";
    search.className = "cs-search";
    search.placeholder = "Cerca…";
    search.autocomplete = "off";
    search.setAttribute("aria-label", "Cerca");
    const list = document.createElement("div");
    list.className = "cs-options";
    menu.classList.add("cs-menu-searchable");
    menu.appendChild(search);
    menu.appendChild(list);
    search.addEventListener("input", () => applySearchFilter(wrap));
  }

  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  trigger.addEventListener("click", () => {
    if (wrap.classList.contains("is-open")) closeMenu(wrap);
    else openMenu(wrap);
  });

  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu(wrap);
    }
  });

  menu.addEventListener("keydown", (e) => {
    // Keys typed in the search field: letters/space just type; arrows and
    // Enter reach the (filtered) options.
    if (search && e.target === search) {
      const firstVisible = Array.from(menu.querySelectorAll(".cs-option")).find((row) => !row.hidden);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        firstVisible?.focus();
      } else if (e.key === "Enter") {
        // Picks the first match — only once something is typed, so Enter
        // in an empty field never silently selects the first entry.
        e.preventDefault();
        if (search.value.trim()) firstVisible?.click();
      } else if (e.key === "Escape") {
        closeMenu(wrap);
        trigger.focus();
      } else if (e.key === "Tab") {
        closeMenu(wrap);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveMenuFocus(menu, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveMenuFocus(menu, -1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      document.activeElement?.click();
    } else if (e.key === "Escape") {
      closeMenu(wrap);
      trigger.focus();
    } else if (e.key === "Tab") {
      closeMenu(wrap);
    }
  });

  select.addEventListener("change", () => syncUI(wrap, select));

  // Rewriting the <option> list (fillSelect, populateEvents, etc.) is a
  // childList mutation on the select itself — mirror it live. `.disabled`
  // is a boolean IDL attribute that reflects back to the actual `disabled`
  // HTML attribute, so a plain `select.disabled = x` (e.g. matches-admin.js
  // greying out Giocatore 2 while Bye is checked) shows up here too.
  new MutationObserver(() => syncUI(wrap, select)).observe(select, {
    childList: true,
    attributes: true,
    attributeFilter: ["disabled"],
  });

  // Wrap the native `value` setter so a plain `select.value = x` from
  // anywhere else in the app — however it happens, with or without a
  // "change" event — re-syncs the custom UI too.
  if (NATIVE_VALUE_DESCRIPTOR) {
    Object.defineProperty(select, "value", {
      configurable: true,
      enumerable: true,
      get() {
        return NATIVE_VALUE_DESCRIPTOR.get.call(this);
      },
      set(v) {
        NATIVE_VALUE_DESCRIPTOR.set.call(this, v);
        syncUI(wrap, select);
      },
    });
  }

  syncUI(wrap, select);
}

export function enhanceSelects(root = document) {
  root.querySelectorAll("select").forEach(enhanceSelect);
}

document.addEventListener("click", (e) => {
  document.querySelectorAll(".cs-wrap.is-open").forEach((wrap) => {
    if (!wrap.contains(e.target)) closeMenu(wrap);
  });
});

// form.reset() resets each field via an internal browser algorithm that
// bypasses the wrapped `value` setter above entirely — re-sync explicitly,
// a tick after the browser's own reset has actually applied. (Mirrors the
// same handling in js/custom-date.js, needed here now that at least one
// form with <select> fields — players-admin-form — calls form.reset().)
document.addEventListener("reset", (e) => {
  if (!(e.target instanceof HTMLFormElement)) return;
  const form = e.target;
  setTimeout(() => {
    form.querySelectorAll(".cs-wrap select.cs-native").forEach((select) => {
      select.dispatchEvent(new Event("change", { bubbles: false }));
    });
  }, 0);
});
