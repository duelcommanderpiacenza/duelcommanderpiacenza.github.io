import { Leagues, Events } from "./db.js";
import { escapeHtml, leagueStatusBadge, showError } from "./ui.js";

// Closed leagues first (left), open ones last (right); within each group,
// whichever has the most recently dated associated event comes first
// (left) and older ones trail further right. When both a league and a
// Topdeck are open at once, the real league goes before the Topdeck
// regardless of dates.
function compareLeagues(a, b) {
  if (a.is_open !== b.is_open) return a.is_open ? 1 : -1;
  if (a.is_open && b.is_open && a.is_topdeck !== b.is_topdeck) return a.is_topdeck ? 1 : -1;
  const aDate = a.latestEventDate ?? "";
  const bDate = b.latestEventDate ?? "";
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;
  return a.name.localeCompare(b.name);
}

async function init() {
  const listEl = document.getElementById("leagues-list");
  try {
    const [leagues, events] = await Promise.all([Leagues.list(), Events.list()]);

    const eventCountByLeague = new Map();
    const latestEventDateByLeague = new Map();
    for (const ev of events) {
      if (!ev.league_id) continue;
      eventCountByLeague.set(ev.league_id, (eventCountByLeague.get(ev.league_id) ?? 0) + 1);
      if (ev.event_date) {
        const current = latestEventDateByLeague.get(ev.league_id);
        if (!current || ev.event_date > current) latestEventDateByLeague.set(ev.league_id, ev.event_date);
      }
    }

    const orderedLeagues = leagues
      .map((l) => ({ ...l, latestEventDate: latestEventDateByLeague.get(l.id) ?? null }))
      .sort(compareLeagues);

    listEl.innerHTML =
      orderedLeagues.length === 0
        ? '<p class="page-empty">Nessuna lega inserita ancora.</p>'
        : orderedLeagues
            .map((l) => {
              const count = eventCountByLeague.get(l.id) ?? 0;
              return `
        <a class="entity-card" href="league.html?id=${l.id}">
          <div class="entity-card-title">${escapeHtml(l.name)}</div>
          <div class="entity-card-meta">${count} event${count === 1 ? "o" : "i"}</div>
          ${leagueStatusBadge(l.is_open)}
        </a>`;
            })
            .join("");
  } catch (err) {
    showError(listEl, err);
  }
}

init();
