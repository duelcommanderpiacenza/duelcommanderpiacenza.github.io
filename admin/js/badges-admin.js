import { Badges } from "../../js/db.js";
import { renderTable, setMessage, fillSelect } from "./crud-ui.js";
import { emit } from "./bus.js";

// Each rule can only ever point at one player at a time, so it only makes
// sense assigned to one badge — the dropdown built from this list leaves
// out whichever rules another badge already has (see populateRuleOptions).
const RULE_LABELS = {
  league_winner: "Vincitore ultima lega conclusa",
  top8_streak: "3 top8 consecutivi (ultimi 3 mesi)",
  league_rank_1: "1° in classifica (lega attuale)",
  league_rank_2: "2° in classifica (lega attuale)",
  league_rank_3: "3° in classifica (lega attuale)",
};

function ruleLabel(row) {
  return row.auto_rule ? RULE_LABELS[row.auto_rule] ?? row.auto_rule : "—";
}

export function initBadgesAdmin() {
  const listEl = document.getElementById("badges-admin-list");
  const searchField = document.getElementById("badges-admin-search");
  const form = document.getElementById("badges-admin-form");
  const idField = document.getElementById("badges-admin-id");
  const nameField = document.getElementById("badges-admin-name");
  const autoRuleField = document.getElementById("badges-admin-auto-rule");
  const priorityField = document.getElementById("badges-admin-priority");
  const msgEl = document.getElementById("badges-admin-message");
  const cancelBtn = document.getElementById("badges-admin-cancel");
  const iconRadios = () => Array.from(document.querySelectorAll('input[name="badges-admin-icon"]'));

  let allBadges = [];

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
  function renderList() {
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
        { key: "icon", label: "Icona", render: (r) => `<span style="font-size:1.3rem;">${r.icon}</span>` },
        { key: "name", label: "Nome" },
        { key: "auto_rule", label: "Regola automatica", render: ruleLabel },
      ],
      { onEdit, onDelete }
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

  searchField.addEventListener("input", renderList);

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    iconRadios().forEach((radio) => {
      radio.checked = radio.value === row.icon;
    });
    populateRuleOptions(row.id);
    autoRuleField.value = row.auto_rule ?? "";
    priorityField.value = row.priority ?? 0;
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    populateRuleOptions(null);
    priorityField.value = 0;
    setMessage(msgEl, "", false);
  }

  async function onDelete(row) {
    if (!confirm(`Eliminare il badge "${row.name}"?`)) return;
    try {
      await Badges.remove(row.id);
      await refresh();
      emit("badges:changed");
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const icon = iconRadios().find((radio) => radio.checked)?.value;
    if (!icon) {
      setMessage(msgEl, "Seleziona un'icona.", true);
      return;
    }
    const payload = {
      name: nameField.value.trim(),
      icon,
      auto_rule: autoRuleField.value || null,
      priority: parseInt(priorityField.value, 10) || 0,
    };
    if (!payload.name) return;
    try {
      if (idField.value) await Badges.update(idField.value, payload);
      else await Badges.create(payload);
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

  refresh();
}
