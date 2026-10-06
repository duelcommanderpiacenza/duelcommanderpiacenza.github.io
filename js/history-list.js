// The "Storico partite" lists of player.html and commander.html (and
// commander.html's "Giocatori"): a card (.history-panel) holding sub-cards
// (.history-item) that scrolls inside instead of paginating, its top/bottom
// edge fading while there's more that way. Matches are grouped one sub-card
// per event (per event + pilot on commander.html), its rounds as rows. Looks:
// styles.css .history-*.
import { escapeHtml, eventTitle, playerLabel, commanderPairLabel } from "./ui.js";

// The list's frame; `itemsHtml` its sub-cards.
export function historyPanelHtml(itemsHtml) {
  return `<div class="history-panel"><div class="history-scroll">${itemsHtml}</div></div>`;
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
  new ResizeObserver(update).observe(scrollEl);
  update();
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
  new ResizeObserver(apply).observe(scrollEl);
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
  new ResizeObserver(apply).observe(sourceScrollEl);
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
