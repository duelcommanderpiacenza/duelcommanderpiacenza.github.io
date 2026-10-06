// The site's lists of sub-cards — player.html's and commander.html's
// "Storico partite", commander.html's "Giocatori", the Comandanti and
// Giocatori pages' lists, and account.html's "Seguiti" (its numbers only,
// historyStatsHtml): a card (.history-panel) holding sub-cards
// (.history-item) that scrolls inside instead of paginating, its top/bottom
// edge fading while there's more that way. Matches are grouped one sub-card
// per event (per event + pilot on commander.html), its rounds as rows. Looks:
// styles.css .history-*.
import { escapeHtml, eventTitle, playerLabel, commanderPairLabel } from "./ui.js";

// The list's frame; `itemsHtml` its sub-cards. `animate: false` for a list
// redrawn on every keystroke (a search box), so its entrance doesn't replay;
// `scroll: false` for one as tall as its content, never scrolling (the
// Comandanti and Giocatori pages' lists).
export function historyPanelHtml(itemsHtml, { animate = true, scroll = true } = {}) {
  const classes = ["history-panel", animate ? "" : "no-entrance-anim", scroll ? "" : "no-scroll"].filter(Boolean).join(" ");
  return `<div class="${classes}"><div class="history-scroll">${itemsHtml}</div></div>`;
}

// A ResizeObserver on `target` calling `fn`, dropped once `target` leaves the
// page (a list redrawn by its filters), so redraws don't pile observers up.
function observeSize(target, fn) {
  const observer = new ResizeObserver(() => {
    if (!target.isConnected) {
      observer.disconnect();
      return;
    }
    fn();
  });
  observer.observe(target);
}

// The edge fades (.can-scroll-up/-down) of the list drawn into `el`, kept in
// step with its scrolling and size.
export function initScrollFade(el) {
  const scrollEl = el.querySelector(".history-scroll");
  if (!scrollEl) return;
  const update = () => {
    scrollEl.classList.toggle("can-scroll-up", scrollEl.scrollTop > 1);
    scrollEl.classList.toggle("can-scroll-down", scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 1);
  };
  scrollEl.addEventListener("scroll", update, { passive: true });
  observeSize(scrollEl, update);
  update();
}

// The numbers on the right of a ranked list's sub-card (Comandanti,
// Giocatori): one labelled value each, in fixed-width columns so they line up
// down the list like a table's. `stats`: [{ label, value, main, title }] —
// `main` (the winrate) in brand red, `title` an optional hover text.
export function historyStatsHtml(stats) {
  return `<div class="history-stats" style="--stat-count:${stats.length}">${stats
    .map(
      (s) => `<div class="history-stat${s.main ? " is-main" : ""}"${s.title ? ` title="${escapeHtml(s.title)}"` : ""}>
          <span class="history-stat-value">${s.value}</span>
          <span class="history-stat-label">${s.label}</span>
        </div>`
    )
    .join("")}</div>`;
}

// Caps the list drawn into `el` at its first `count` elements matching
// `selector` (e.g. 8 rounds): taller than that, it scrolls. Re-measured when
// its size changes (a narrower page wraps the rows taller); the measurement
// doesn't depend on the cap itself, so setting it settles at once.
export function capScrollToItems(el, selector, count) {
  const scrollEl = el.querySelector(".history-scroll");
  if (!scrollEl) return;
  const apply = () => {
    const items = scrollEl.querySelectorAll(selector);
    if (items.length <= count) {
      scrollEl.style.maxHeight = "";
      return;
    }
    const last = items[count - 1].getBoundingClientRect();
    const top = scrollEl.getBoundingClientRect().top - scrollEl.scrollTop;
    // A little past the last one, so the fade falls on the next one instead.
    scrollEl.style.maxHeight = `${Math.ceil(last.bottom - top + 14)}px`;
  };
  observeSize(scrollEl, apply);
  apply();
}

// Caps the list drawn into `el` at the height of the one drawn into
// `sourceEl` (its own natural height when shorter, never taller), kept in
// step as that one's size changes. A floor keeps it usable beside a very
// short source list.
export function capScrollToHeightOf(el, sourceEl, minHeight = 200) {
  const scrollEl = el.querySelector(".history-scroll");
  const sourceScrollEl = sourceEl.querySelector(".history-scroll");
  if (!scrollEl || !sourceScrollEl) return;
  const apply = () => {
    scrollEl.style.maxHeight = `${Math.max(minHeight, sourceScrollEl.offsetHeight)}px`;
  };
  observeSize(sourceScrollEl, apply);
  apply();
}

// The count chip after a section's title (styles.css .history-count; empty
// hides it).
export function setHistoryCount(id, count) {
  document.getElementById(id).textContent = count ? String(count) : "";
}

// An event's linked title and, on a small muted line below, its league (no
// date: the list's order already says when; an unnamed event's title is its
// date anyway).
function historyEventHeadHtml(event) {
  return `<a class="history-title" href="event.html?id=${event.id}">${escapeHtml(eventTitle(event))}</a>${
    event.league ? `<span class="history-meta">${escapeHtml(event.league.name)}</span>` : ""
  }`;
}

// The final position in an event, as a round red chip ("—" when unknown).
function historyPosHtml(position) {
  return `<span class="history-pos${position === 1 ? " is-first" : ""}" title="Posizione finale">${
    position == null ? "—" : `${position}°`
  }</span>`;
}

const OUTCOME_LABEL = { win: "Vittoria", loss: "Sconfitta", draw: "Pareggio" };

// One row per round: opponent (+ their deck), then the game score coloured
// by the outcome (a bye: "Bye" as a win; a drop: "Drop", neutral). `r`:
// { round, opponent, oppCommander, oppPartner, isBye, isDrop, outcome
// ("win"|"loss"|"draw"), scoreLabel }.
function matchRoundHtml(r) {
  const [cls, score, label] = r.isBye
    ? ["is-win", "Bye", "Bye"]
    : r.isDrop
      ? ["is-drop", "Drop", "Drop"]
      : [`is-${r.outcome}`, r.scoreLabel, OUTCOME_LABEL[r.outcome]];
  const opponent = r.isBye
    ? '<span class="history-muted">Nessun avversario</span>'
    : r.isDrop
      ? '<span class="history-muted">Ritirato</span>'
      : `<span class="history-opp-name">${playerLabel(r.opponent)}</span>${
          r.oppCommander ? `<span class="history-deck">${commanderPairLabel(r.oppCommander, r.oppPartner)}</span>` : ""
        }`;
  return `
        <li class="history-round">
          <span class="history-round-no">T${r.round ?? "?"}</span>
          <div class="history-main">${opponent}</div>
          <span class="history-score ${cls}" title="${label}">${score}</span>
        </li>`;
}

// The matches as one sub-card per group, in the order given: on top the
// event, a second line (`subline`: markup — the deck played, or the pilot)
// and the final position; the rounds in order below. `groups`: [{ event,
// subline, position, rounds }].
export function matchGroupsHtml(groups) {
  if (!groups.length) return '<p class="page-empty">Nessuna partita registrata.</p>';
  return historyPanelHtml(
    groups
      .map((g) => {
        const rounds = [...g.rounds].sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
        return `
      <article class="history-item history-match-event">
        <div class="history-match-head">
          <div class="history-main">
            ${g.event ? historyEventHeadHtml(g.event) : '<span class="history-title">—</span>'}
            ${g.subline ? `<span class="history-deck">${g.subline}</span>` : ""}
          </div>
          ${historyPosHtml(g.position)}
        </div>
        <ol class="history-rounds">${rounds.map(matchRoundHtml).join("")}</ol>
      </article>`;
      })
      .join("")
  );
}
