// The admin's notifications: a quick message for whatever an action ended
// with — "Salvato.", an error, the badges sync's progress — instead of a
// line of text under the form. One place for all of them (admin.css
// .admin-toasts): bottom left on a computer, top centre on touch screens;
// stacked when there are more than one (the newest nearest the edge), each
// gone on its own after a few seconds (an error a little longer) or at a
// tap. "ok" dark with a green tick, "error" red with a "!", "running" dark
// with a spinning ring and no timeout (updated or closed by its caller).
// Read out by screen readers (a live region; errors assertive).

const DURATION = { ok: 3200, error: 6500 };

const ICONS = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 6.5v7"></path><path d="M12 17.5v.01"></path></svg>',
  running: "",
};

let container = null;

function ensureContainer() {
  if (container?.isConnected) return container;
  container = document.createElement("div");
  container.className = "admin-toasts";
  document.body.append(container);
  return container;
}

/**
 * @param {string} text
 * @param {"ok"|"error"|"running"} [type]
 * @returns {{ update: (text: string, type?: "ok"|"error"|"running") => void, close: () => void }}
 */
export function showToast(text, type = "ok") {
  const box = ensureContainer();
  const el = document.createElement("div");
  el.className = "admin-toast";
  const icon = document.createElement("span");
  icon.className = "admin-toast-icon";
  const label = document.createElement("span");
  label.className = "admin-toast-text";
  el.append(icon, label);
  box.prepend(el);

  let timer = null;

  function close() {
    clearTimeout(timer);
    if (!el.isConnected || el.classList.contains("is-leaving")) return;
    el.classList.add("is-leaving");
    const remove = () => el.remove();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) remove();
    else el.addEventListener("animationend", remove, { once: true });
  }

  function update(nextText, nextType = type) {
    type = nextType;
    el.dataset.type = type;
    el.setAttribute("role", type === "error" ? "alert" : "status");
    icon.innerHTML = ICONS[type] ?? "";
    label.textContent = nextText;
    clearTimeout(timer);
    if (DURATION[type]) timer = setTimeout(close, DURATION[type]);
  }

  el.addEventListener("click", () => {
    if (type !== "running") close();
  });

  update(text, type);
  return { update, close };
}
