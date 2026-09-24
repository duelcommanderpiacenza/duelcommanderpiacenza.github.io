import { Leagues, Events } from "../../js/db.js";
import { renderTable, setMessage, statusToggleButton } from "./crud-ui.js";
import { syncAutoBadges } from "./badges-sync.js";

// The proactive close-before-open/create calls should normally prevent this
// constraint from ever being hit, but it's still the real, ultimate
// guarantee (e.g. a race with another admin tab) — so surface it plainly
// rather than falling through to a generic message when it does fire.
function describeError(err, fallback) {
  if (err?.code === "23505" && err?.message?.includes("leagues_only_one_open_idx")) {
    return "Non possono esistere due leghe (o due Topdeck) dello stesso tipo aperte contemporaneamente. Chiudi quella attualmente aperta di questo tipo per crearne o aprirne un'altra.";
  }
  return fallback;
}

/**
 * Top of the pyramid: leagues are flat (like players/commanders), but each
 * row also offers a "Manage events" action that drills into that league,
 * plus a toggle for open/closed (open = ongoing, shown as the homepage's
 * current league; closing it doesn't hide its already-closed events).
 * A row can also be a "Topdeck" series — same shape, just no points
 * leaderboard and never featured on the homepage (see is_topdeck in db.js).
 */
// Same rule as the public Leghe & Eventi page (js/events-page.js): open
// first, then whichever has the most recently dated associated event,
// newest first — so the admin list matches what visitors actually see.
function compareLeagues(a, b) {
  if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
  if (a.is_open && b.is_open && a.is_topdeck !== b.is_topdeck) return a.is_topdeck ? 1 : -1;
  const aDate = a.latestEventDate ?? "";
  const bDate = b.latestEventDate ?? "";
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;
  return a.name.localeCompare(b.name);
}

export function initLeaguesAdmin({ onOpenLeague }) {
  const listEl = document.getElementById("leagues-admin-list");
  const searchField = document.getElementById("leagues-admin-search");
  const form = document.getElementById("leagues-admin-form");
  const idField = document.getElementById("leagues-admin-id");
  const nameField = document.getElementById("leagues-admin-name");
  const topdeckField = document.getElementById("leagues-admin-topdeck");
  const msgEl = document.getElementById("leagues-admin-message");
  const cancelBtn = document.getElementById("leagues-admin-cancel");

  let leagues = [];

  // Live filter over the already-fetched (and already-ordered) list, so
  // typing a search term never disturbs the open/date ordering.
  function renderList(animate = true) {
    const term = searchField.value.trim().toLowerCase();
    const visible = term ? leagues.filter((l) => l.name.toLowerCase().includes(term)) : leagues;
    if (term && visible.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessuna lega corrisponde alla ricerca.</p>';
      return;
    }
    renderTable(
      listEl,
      visible,
      [
        { key: "name", label: "Nome" },
        { key: "type", label: "Tipo", render: (l) => (l.is_topdeck ? "Topdeck" : "Lega") },
        { key: "status", label: "Stato", render: (l) => statusToggleButton(l.is_open, l.id) },
        {
          key: "manage",
          label: "",
          render: (l) => `
              <div class="row-actions">
                <button type="button" class="btn-secondary" data-open="${l.id}">Gestisci &rarr;</button>
              </div>`,
        },
      ],
      { onEdit, onDelete },
      { animate }
    );
    listEl.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const league = leagues.find((l) => l.id === btn.dataset.open);
        if (league) onOpenLeague(league);
      });
    });
    listEl.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const league = leagues.find((l) => l.id === btn.dataset.toggle);
        if (league) onToggleOpen(league);
      });
    });
  }

  searchField.addEventListener("input", () => renderList(false));

  // Same ordering data the public Leghe page needs — the latest associated
  // event date per league — fetched here too since Leagues.list() itself
  // just orders by creation date.
  async function refresh(animate = true) {
    try {
      const [allLeagues, events] = await Promise.all([Leagues.list(), Events.list()]);
      const latestEventDateByLeague = new Map();
      for (const ev of events) {
        if (!ev.league_id || !ev.event_date) continue;
        const current = latestEventDateByLeague.get(ev.league_id);
        if (!current || ev.event_date > current) latestEventDateByLeague.set(ev.league_id, ev.event_date);
      }
      leagues = allLeagues
        .map((l) => ({ ...l, latestEventDate: latestEventDateByLeague.get(l.id) ?? null }))
        .sort(compareLeagues);
      renderList(animate);
    } catch (err) {
      setMessage(msgEl, "Errore nel caricamento.", true);
    }
  }

  function onEdit(row) {
    idField.value = row.id;
    nameField.value = row.name;
    topdeckField.checked = !!row.is_topdeck;
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    setMessage(msgEl, "", false);
  }

  async function onToggleOpen(row) {
    try {
      // At most one league, and separately at most one Topdeck, is open at
      // a time — opening this one closes every other open row of the same
      // kind first (a league and a Topdeck can be open together).
      if (!row.is_open) await Leagues.closeOtherOpenOfType(row.is_topdeck, row.id);
      await Leagues.update(row.id, { is_open: !row.is_open });
      // Unconditional, not just on the "closing this row" branch — opening
      // one can itself close a *different* league as a side effect just
      // above (closeOtherOpenOfType), which is just as much a "a league
      // just closed" event for league_winner/league_rank badges as closing
      // this row directly. Fire-and-forget: see events-admin.js's own
      // onToggleOpen for why.
      syncAutoBadges().catch(console.error);
      // Just a status flip, not a changed row set — replaying the whole
      // list's entrance animation over it would be a distracting pop for
      // what should read as instant feedback.
      await refresh(false);
    } catch (err) {
      setMessage(msgEl, describeError(err, "Errore nell'aggiornamento dello stato."), true);
    }
  }

  async function onDelete(row) {
    if (!confirm(`Eliminare la lega "${row.name}"? Verranno rimossi anche i suoi eventi, iscritti e partite.`)) return;
    try {
      await Leagues.remove(row.id);
      await refresh();
    } catch (err) {
      setMessage(msgEl, "Errore nell'eliminazione.", true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { name: nameField.value.trim(), is_topdeck: topdeckField.checked };
    if (!payload.name) return;
    try {
      if (idField.value) {
        await Leagues.update(idField.value, payload);
      } else {
        // A new league/topdeck defaults to open, and only one of each kind
        // may be — close whatever else of that same kind was open *before*
        // inserting, or the insert itself would violate that uniqueness
        // the instant another row of that kind is still open.
        await Leagues.closeAllOpenOfType(payload.is_topdeck);
        await Leagues.create(payload);
      }
      resetForm();
      await refresh();
      setMessage(msgEl, "Salvato.", false);
    } catch (err) {
      setMessage(msgEl, describeError(err, "Errore nel salvataggio."), true);
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  refresh();
}
