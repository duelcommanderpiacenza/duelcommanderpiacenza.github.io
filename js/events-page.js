// The merged "Leghe & Eventi" tab: one collapsible section per league (plus
// a trailing one for standalone events), each listing that league's own
// published events as cards — replaces the old separate Leghe tab
// (js/leagues-page.js, now deleted) and the old flat events-by-league view
// this file used to render.

import { Leagues, Events } from "./db.js";
import { escapeHtml, formatDate, eventTitle, leagueStatusBadge, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

// Same ordering the old Leghe tab used: open leagues first (real leagues
// before Topdeck within that), then most-recently-active first, name as a
// final tiebreak — so a league with no events yet still sorts sensibly
// instead of always trailing at the very end.
function compareLeagues(a, b) {
  if (a.is_open !== b.is_open) return a.is_open ? -1 : 1;
  if (a.is_open && b.is_open && a.is_topdeck !== b.is_topdeck) return a.is_topdeck ? 1 : -1;
  const aDate = a.latestEventDate ?? "";
  const bDate = b.latestEventDate ?? "";
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;
  return a.name.localeCompare(b.name);
}

function renderEventGrid(evs) {
  return `<div class="entity-grid">
      ${evs
        .map(
          (ev) => `
        <a class="entity-card" href="event.html?id=${ev.id}">
          ${ev.name ? `<div class="entity-card-meta">${formatDate(ev.event_date)}</div>` : ""}
          <div class="entity-card-title">${escapeHtml(eventTitle(ev))}</div>
        </a>`
        )
        .join("")}
    </div>`;
}

// `link` is the href for the clickable name (a league) or null (the
// standalone section, which has no page of its own to link to).
function renderGroup({ id, name, link, badge, events }) {
  const count = events.length;
  const countLabel = `${count} event${count === 1 ? "o" : "i"}`;
  // The badge and event count sit outside the link on purpose — neither is
  // navigable, just labels, so they shouldn't read (or act) as part of the
  // clickable link the way they would nested inside the <a>. Only the name
  // itself is the actual link.
  const nameHtml = link
    ? `<a class="league-group-link" href="${link}"><span class="league-group-name">${escapeHtml(name)}</span></a>`
    : `<span class="league-group-link league-group-link-static"><span class="league-group-name">${escapeHtml(name)}</span></span>`;

  return `
    <section class="league-group is-collapsed" data-group-id="${id}" role="button" tabindex="0" aria-expanded="false">
      <div class="league-group-header">
        <div class="league-group-title-row">
          ${nameHtml}
          <div class="league-group-sub-row">
            ${badge}
            <span class="league-group-meta">${countLabel}</span>
          </div>
        </div>
        <span class="league-group-toggle-icon" aria-hidden="true"></span>
      </div>
      <div class="league-group-body">
        <div class="league-group-body-clip">
          ${count === 0 ? '<p class="page-empty">Nessun evento pubblicato ancora.</p>' : renderEventGrid(events)}
        </div>
      </div>
    </section>`;
}

async function init() {
  const listEl = document.getElementById("events-list");
  try {
    const [leagues, allEvents] = await Promise.all([Leagues.list(), Events.list()]);
    // A still-open (including future) event isn't published yet — it's
    // previewed elsewhere (the homepage's "Prossimi eventi"), not listed
    // here as if it had already happened.
    const events = allEvents.filter((ev) => !ev.is_open);

    const eventsByLeague = new Map();
    const standaloneEvents = [];
    for (const ev of events) {
      if (!ev.league_id) {
        standaloneEvents.push(ev);
        continue;
      }
      if (!eventsByLeague.has(ev.league_id)) eventsByLeague.set(ev.league_id, []);
      eventsByLeague.get(ev.league_id).push(ev);
    }

    if (leagues.length === 0 && events.length === 0) {
      listEl.innerHTML = '<p class="page-empty">Nessuna lega o evento inserito ancora.</p>';
      return;
    }

    const orderedLeagues = leagues
      .map((l) => {
        const leagueEvents = eventsByLeague.get(l.id) ?? [];
        return { ...l, events: leagueEvents, latestEventDate: leagueEvents[0]?.event_date ?? null };
      })
      .sort(compareLeagues);

    const leagueSections = orderedLeagues
      .map((l) =>
        renderGroup({
          id: l.id,
          name: l.name,
          link: `league.html?id=${l.id}`,
          badge: leagueStatusBadge(l.is_open),
          events: l.events,
        })
      )
      .join("");

    const standaloneSection =
      standaloneEvents.length === 0
        ? ""
        : renderGroup({ id: "standalone", name: "Eventi standalone", link: null, badge: "", events: standaloneEvents });

    listEl.innerHTML = leagueSections + standaloneSection;

    // The whole card toggles collapse/expand — except a click that
    // actually landed on .league-group-link, which navigates to the
    // league's own page instead (its own click is left alone, never
    // reaching this handler's toggle logic).
    function toggleGroup(group) {
      const collapsed = group.classList.toggle("is-collapsed");
      group.setAttribute("aria-expanded", String(!collapsed));
    }

    listEl.querySelectorAll(".league-group").forEach((group) => {
      group.addEventListener("click", (e) => {
        if (e.target.closest(".league-group-link")) return;
        toggleGroup(group);
      });
      group.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".league-group-link")) {
          e.preventDefault();
          toggleGroup(group);
        }
      });
    });
  } catch (err) {
    showError(listEl, err);
  } finally {
    hidePageLoading();
  }
}

init();
