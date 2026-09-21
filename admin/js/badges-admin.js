import { Badges, BadgeIcons } from "../../js/db.js";
import { renderTable, setMessage, fillSelect } from "./crud-ui.js";
import { emit } from "./bus.js";

const MAX_ICON_FILE_BYTES = 300 * 1024;

// Each rule can only ever point at one player at a time, so it only makes
// sense assigned to one badge — the dropdown built from this list leaves
// out whichever rules another badge already has (see populateRuleOptions).
const RULE_LABELS = {
  league_winner: "Vincitore ultima lega conclusa",
  top8_streak: "3 top8 consecutivi (ultimi 3 mesi)",
  league_rank_1: "1° in classifica (lega attuale)",
  league_rank_2: "2° in classifica (lega attuale)",
  league_rank_3: "3° in classifica (lega attuale)",
  highest_winrate: "Winrate più alto (min. 5 partite)",
  most_matches_played: "Più match giocati (min. 5 partite)",
  most_commanders_played: "Più comandanti giocati (min. 5 comandanti)",
};

function ruleLabel(row) {
  return row.auto_rule ? RULE_LABELS[row.auto_rule] ?? row.auto_rule : "—";
}

// .badge-icon-box gives the image and the emoji the same flex-centered box
// (see styles.css) so they share a vertical anchor — an emoji as bare text
// sits per font glyph metrics, which doesn't line up with a flex-centered
// <img>.
function iconCellHtml(row) {
  return row.icon_url
    ? `<img src="${row.icon_url}" alt="" class="badge-icon-box" style="width:1.3rem;height:1.3rem;">`
    : `<span class="badge-icon-box" style="width:1.3rem;height:1.3rem;font-size:1.3rem;">${row.icon ?? ""}</span>`;
}

export function initBadgesAdmin() {
  const listEl = document.getElementById("badges-admin-list");
  const searchField = document.getElementById("badges-admin-search");
  const form = document.getElementById("badges-admin-form");
  const idField = document.getElementById("badges-admin-id");
  const nameField = document.getElementById("badges-admin-name");
  const autoRuleField = document.getElementById("badges-admin-auto-rule");
  const priorityField = document.getElementById("badges-admin-priority");
  const priorityFieldWrap = document.getElementById("badges-admin-priority-field");
  const msgEl = document.getElementById("badges-admin-message");
  const cancelBtn = document.getElementById("badges-admin-cancel");
  const iconRadios = () => Array.from(document.querySelectorAll('input[name="badges-admin-icon"]'));
  const modeRadios = () => Array.from(document.querySelectorAll('input[name="badges-admin-icon-mode"]'));
  const emojiWrap = document.getElementById("badges-admin-icon-emoji-wrap");
  const imageWrap = document.getElementById("badges-admin-icon-image-wrap");
  const fileInput = document.getElementById("badges-admin-icon-file");
  const previewEl = document.getElementById("badges-admin-icon-preview");

  let allBadges = [];
  let selectedFile = null; // a newly-picked file, pending upload on submit
  let editingIconUrl = null; // the icon_url the badge being edited already had, if any

  function currentMode() {
    return modeRadios().find((r) => r.checked)?.value ?? "emoji";
  }

  function updateIconModeUI() {
    const isImage = currentMode() === "image";
    emojiWrap.hidden = isImage;
    imageWrap.hidden = !isImage;
  }

  // Priority only means anything as a tiebreak among a player's *automatic*
  // badges — irrelevant for a manual-only one, so there's nothing to show
  // until an auto rule is actually picked.
  function updatePriorityVisibility() {
    priorityFieldWrap.hidden = !autoRuleField.value;
  }
  autoRuleField.addEventListener("change", updatePriorityVisibility);
  modeRadios().forEach((r) => r.addEventListener("change", updateIconModeUI));

  function renderPreview(src) {
    previewEl.innerHTML = src ? `<img src="${src}" alt="">` : "";
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_ICON_FILE_BYTES) {
      setMessage(msgEl, "Immagine troppo grande (max 300 KB).", true);
      fileInput.value = "";
      return;
    }
    selectedFile = file;
    renderPreview(URL.createObjectURL(file));
  });

  // Rebuilds the rule dropdown from whichever rules aren't already taken by
  // another badge. excludeId is the badge currently being edited (if any),
  // so its own already-assigned rule stays offered — otherwise saving it
  // again with the same rule unchanged would have nowhere to select it.
  function populateRuleOptions(excludeId) {
    const usedRules = new Set(
      allBadges.filter((b) => b.auto_rule && b.id !== excludeId).map((b) => b.auto_rule)
    );
    const options =
      '<option value="">Nessuna (solo manuale)</option>' +
      Object.entries(RULE_LABELS)
        .filter(([value]) => !usedRules.has(value))
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join("");
    fillSelect(autoRuleField, options);
  }

  // Live filter over the already-fetched list, so it's easy to check
  // whether a badge already exists before adding a duplicate.
  function renderList(animate = true) {
    const term = searchField.value.trim().toLowerCase();
    const visible = term ? allBadges.filter((b) => b.name.toLowerCase().includes(term)) : allBadges;
    if (term && visible.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessun badge corrisponde alla ricerca.</p>';
      return;
    }
    renderTable(
      listEl,
      visible,
      [
        { key: "icon", label: "Icona", render: iconCellHtml },
        { key: "name", label: "Nome" },
        { key: "auto_rule", label: "Regola automatica", render: ruleLabel },
      ],
      { onEdit, onDelete },
      { animate }
    );
  }

  async function refresh() {
    try {
      allBadges = await Badges.list();
      renderList();
      populateRuleOptions(null);
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  searchField.addEventListener("input", () => renderList(false));

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    populateRuleOptions(row.id);
    autoRuleField.value = row.auto_rule ?? "";
    priorityField.value = row.priority ?? 0;
    updatePriorityVisibility();

    selectedFile = null;
    fileInput.value = "";
    editingIconUrl = row.icon_url ?? null;

    if (row.icon_url) {
      modeRadios().find((r) => r.value === "image").checked = true;
      renderPreview(row.icon_url);
      iconRadios().forEach((radio) => (radio.checked = false));
    } else {
      modeRadios().find((r) => r.value === "emoji").checked = true;
      renderPreview(null);
      iconRadios().forEach((radio) => {
        radio.checked = radio.value === row.icon;
      });
    }
    updateIconModeUI();
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    populateRuleOptions(null);
    priorityField.value = 0;
    updatePriorityVisibility();
    selectedFile = null;
    editingIconUrl = null;
    renderPreview(null);
    updateIconModeUI();
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
    if (!confirm(`Eliminare il badge "${row.name}"?`)) return;
    try {
      await Badges.remove(row.id);
      if (row.icon_url) BadgeIcons.remove(row.icon_url);
      await refresh();
      emit("badges:changed");
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameField.value.trim();
    if (!name) return;

    const mode = currentMode();
    let icon = null;
    let iconUrl = null;

    if (mode === "emoji") {
      icon = iconRadios().find((radio) => radio.checked)?.value ?? null;
      if (!icon) {
        setMessage(msgEl, "Seleziona un'icona.", true);
        return;
      }
    } else {
      if (selectedFile) {
        try {
          iconUrl = await BadgeIcons.upload(selectedFile);
        } catch (err) {
          console.error(err);
          setMessage(msgEl, "Errore nel caricamento dell'immagine.", true);
          return;
        }
      } else if (editingIconUrl) {
        iconUrl = editingIconUrl; // keeping the existing image unchanged
      } else {
        setMessage(msgEl, "Carica un'immagine.", true);
        return;
      }
    }

    const payload = {
      name,
      icon,
      icon_url: iconUrl,
      auto_rule: autoRuleField.value || null,
      priority: parseInt(priorityField.value, 10) || 0,
    };

    try {
      if (idField.value) await Badges.update(idField.value, payload);
      else await Badges.create(payload);
      // Best-effort cleanup once the badge itself is safely saved — only
      // when the old image was actually replaced or dropped, never the one
      // we just kept or just uploaded.
      if (editingIconUrl && editingIconUrl !== iconUrl) BadgeIcons.remove(editingIconUrl);
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
      emit("badges:changed");
    } catch (err) {
      console.error(err);
      setMessage(msgEl, `Errore nel salvataggio${err?.message ? `: ${err.message}` : " (nome forse duplicato)."}`, true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  updateIconModeUI();
  updatePriorityVisibility();
  refresh();
}
