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

function openMenu(wrap) {
  if (wrap.classList.contains("is-disabled")) return;
  closeAllExcept(wrap);
  wrap.classList.add("is-open");
  wrap.querySelector(".cs-trigger").setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".cs-menu");
  const active = menu.querySelector('.cs-option[aria-selected="true"]') || menu.querySelector(".cs-option");
  active?.focus();
}

function currentLabel(select) {
  const opt = select.options[select.selectedIndex];
  return opt ? opt.textContent : "";
}

function selectValue(select, value) {
  select.value = value; // goes through the wrapped setter below, which re-syncs the UI
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function rebuildMenu(wrap, select) {
  const menu = wrap.querySelector(".cs-menu");
  menu.innerHTML = "";
  Array.from(select.options).forEach((opt) => {
    const row = document.createElement("div");
    row.className = "cs-option";
    row.setAttribute("role", "option");
    row.tabIndex = -1;
    row.dataset.value = opt.value;
    row.textContent = opt.textContent;
    row.addEventListener("click", () => {
      selectValue(select, opt.value);
      closeMenu(wrap);
      wrap.querySelector(".cs-trigger").focus();
    });
    menu.appendChild(row);
  });
}

function syncUI(wrap, select) {
  rebuildMenu(wrap, select);
  const menu = wrap.querySelector(".cs-menu");
  menu.querySelectorAll(".cs-option").forEach((row) => {
    row.setAttribute("aria-selected", row.dataset.value === select.value ? "true" : "false");
  });
  wrap.querySelector(".cs-trigger-label").textContent = currentLabel(select);
  const trigger = wrap.querySelector(".cs-trigger");
  trigger.disabled = select.disabled;
  wrap.classList.toggle("is-disabled", select.disabled);
}

function moveMenuFocus(menu, delta) {
  const rows = Array.from(menu.querySelectorAll(".cs-option"));
  if (rows.length === 0) return;
  const idx = rows.indexOf(document.activeElement);
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
  trigger.innerHTML = '<span class="cs-trigger-label"></span><span class="cs-trigger-arrow" aria-hidden="true"></span>';

  const menu = document.createElement("div");
  menu.className = "cs-menu";
  menu.setAttribute("role", "listbox");

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
