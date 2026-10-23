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
// Comandanti and Giocatori pages' lists); `className` for a layout of its
// own (event.html's match grid).
export function historyPanelHtml(itemsHtml, { animate = true, scroll = true, className = "" } = {}) {
  const classes = ["history-panel", animate ? "" : "no-entrance-anim", scroll ? "" : "no-scroll", className]
    .filter(Boolean)
    .join(" ");
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
// down the list like a table's. `stats`: [{ label, value, main, trend, title }] —
// `main` (the winrate) in brand red, `trend` a stat that can carry a
// winrateTrendHtml arrow (its room kept on phones even when it has none, so
// every row's columns match), `title` an optional hover text.
export function historyStatsHtml(stats) {
  return `<div class="history-stats" style="--stat-count:${stats.length}">${stats
    .map(
      (s) => `<div class="history-stat${s.main ? " is-main" : ""}${s.trend ? " has-trend" : ""}"${s.title ? ` title="${escapeHtml(s.title)}"` : ""}>
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

// An event's title and, on a small muted line below, its league (no date:
// the list's order already says when; an unnamed event's title is its date
// anyway). Plain text: the whole sub-card is the link to the event.
function historyEventHeadHtml(event) {
  return `<span class="history-title">${escapeHtml(eventTitle(event))}</span>${
    event.league ? `<span class="history-meta">${escapeHtml(event.league.name)}</span>` : ""
  }`;
}

// The final position in an event, as a round red chip ("—" when unknown,
// filled red for the 1st) — also event.html's standings.
export function historyPosHtml(position) {
  return `<span class="history-pos${position === 1 ? " is-first" : ""}" title="Posizione finale">${
    position == null ? "—" : `${position}°`
  }</span>`;
}

// A league position with its change since the league's latest event —
// league.html's Classifica and the Bacheca's, while the league is open;
// `before` from js/leaderboard.js's previousLeaguePositions: the usual
// position chip with a small badge on its bottom-right corner, like a
// notification count, with the trend arrows' icons (winrateTrendHtml's): ↗ N
// up, ↘ N down, → the same, + for a first result in that event. Just
// historyPosHtml's chip when there's nothing to compare with (`before` null).
export function leaguePosHtml(position, before, playerId) {
  if (!before) return historyPosHtml(position);
  const was = before.get(playerId);
  const diff = was === undefined ? null : was - position;
  const n = Math.abs(diff ?? 0);
  const kind = diff === null ? "new" : diff > 0 ? "up" : diff < 0 ? "down" : "same";
  const label = {
    new: "Nuovo in classifica dall'ultimo evento",
    same: "Stessa posizione dell'ultimo evento",
    up: `Su di ${n} ${n === 1 ? "posizione" : "posizioni"} dall'ultimo evento`,
    down: `Giù di ${n} ${n === 1 ? "posizione" : "posizioni"} dall'ultimo evento`,
  }[kind];
  const icon = kind === "new" ? TREND_ICON('<path d="M12 6v12"/><path d="M6 12h12"/>') : TREND_SYMBOLS[kind];
  return `<span class="pos-with-change"><span class="history-pos has-change${position === 1 ? " is-first" : ""}">${position}°</span><span class="pos-badge is-${kind}" role="img" aria-label="${label}" title="${label}">${icon}${
    kind === "up" || kind === "down" ? n : ""
  }</span></span>`;
}

// The same change as a pill of its own, beside a big position number
// (player.html's league recap): ↗ N green, ↘ N red, → grey the same, +
// grey a newcomer, in a tint of its colour. "" with nothing to compare
// with (`before` null).
export function positionMoveHtml(position, before, playerId) {
  if (!before) return "";
  const was = before.get(playerId);
  const diff = was === undefined ? null : was - position;
  const n = Math.abs(diff ?? 0);
  const kind = diff === null ? "new" : diff > 0 ? "up" : diff < 0 ? "down" : "same";
  const label = {
    new: "Nuovo in classifica dall'ultimo evento",
    same: "Stessa posizione dell'ultimo evento",
    up: `Su di ${n} ${n === 1 ? "posizione" : "posizioni"} dall'ultimo evento`,
    down: `Giù di ${n} ${n === 1 ? "posizione" : "posizioni"} dall'ultimo evento`,
  }[kind];
  const icon = kind === "new" ? TREND_ICON('<path d="M12 6v12"/><path d="M6 12h12"/>') : TREND_SYMBOLS[kind];
  return `<span class="pos-move is-${kind}" role="img" aria-label="${label}" title="${label}">${icon}${
    kind === "up" || kind === "down" ? n : ""
  }</span>`;
}

const OUTCOME_LABEL = { win: "Vittoria", loss: "Sconfitta", draw: "Pareggio" };
const NO_LINK = { link: false };

// One row per round: opponent (+ their deck), then the game score coloured
// by the outcome (a bye: "Bye" as a win; a drop: "Drop", neutral). `r`:
// { round, opponent, oppCommander, oppPartner, isBye, isDrop, outcome
// ("win"|"loss"|"draw"), scoreLabel }. Names unlinked, like the rest of the
// sub-card. `deckFirst` (commander.html): the opponent's deck on top, big,
// their name under it, small — the other way round (the default, player.html)
// the name first; an opponent with no deck recorded: the name alone.
function matchRoundHtml(r, { deckFirst = false } = {}) {
  const [cls, score, label] = r.isBye
    ? ["is-win", "Bye", "Bye"]
    : r.isDrop
      ? ["is-drop", "Drop", "Drop"]
      : [`is-${r.outcome}`, r.scoreLabel, OUTCOME_LABEL[r.outcome]];
  const opponent = r.isBye
    ? '<span class="history-muted">Nessun avversario</span>'
    : r.isDrop
      ? '<span class="history-muted">Ritirato</span>'
      : deckFirst && r.oppCommander
        ? `<span class="history-opp-name">${commanderPairLabel(r.oppCommander, r.oppPartner, NO_LINK)}</span><span class="history-deck">${playerLabel(r.opponent, NO_LINK)}</span>`
        : `<span class="history-opp-name">${playerLabel(r.opponent, NO_LINK)}</span>${
            r.oppCommander ? `<span class="history-deck">${commanderPairLabel(r.oppCommander, r.oppPartner, NO_LINK)}</span>` : ""
          }`;
  return `
        <li class="history-round">
          <span class="history-round-no">T${r.round ?? "?"}</span>
          <div class="history-main">${opponent}</div>
          <span class="history-score ${cls}" title="${label}">${score}</span>
        </li>`;
}

// The matches as one sub-card per group, in the order given — each one link
// to its event's page (styles.css a.history-item): on top the event, a
// second line (`subline`: markup without links — the deck played, or the
// pilot) and the final position; the rounds in order below. `groups`:
// [{ event, subline, position, rounds }]. `options`: matchRoundHtml's
// (`deckFirst`).
export function matchGroupsHtml(groups, options = {}) {
  if (!groups.length) return '<p class="page-empty">Nessuna partita registrata.</p>';
  return historyPanelHtml(
    groups
      .map((g) => {
        const rounds = [...g.rounds].sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
        const [open, close] = g.event
          ? [`<a class="history-item history-match-event" href="event.html?id=${g.event.id}">`, "</a>"]
          : ['<article class="history-item history-match-event">', "</article>"];
        return `
      ${open}
        <div class="history-match-head">
          <div class="history-main">
            ${g.event ? historyEventHeadHtml(g.event) : '<span class="history-title">—</span>'}
            ${g.subline ? `<span class="history-deck">${g.subline}</span>` : ""}
          </div>
          ${historyPosHtml(g.position)}
        </div>
        <ol class="history-rounds">${rounds.map((r) => matchRoundHtml(r, options)).join("")}</ol>
      ${close}`;
      })
      .join("")
  );
}

// A number's trend — the winrate (Comandanti, Giocatori: since the
// commander's / player's own latest event in scope, latestPresence), the
// metashare (Comandanti: since the latest event in scope, whoever played):
// a trend arrow in a small tinted disc, ↗ up, ↘ down, → unchanged — also
// with nothing before to compare with (`before` null). Compared as shown
// (one decimal). Nothing for a value of "—".
const TREND_ICON = (path) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const TREND_SYMBOLS = {
  up: TREND_ICON('<path d="M7 17L17 7"/><path d="M8 7h9v9"/>'),
  down: TREND_ICON('<path d="M7 7l10 10"/><path d="M17 8v9H8"/>'),
  same: TREND_ICON('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'),
};

export function winrateTrendHtml(now, before, inLatest) {
  if (now === null) return "";
  const r = (x) => Math.round(x * 10);
  let kind = "same";
  if (inLatest && before !== null && r(now) !== r(before)) kind = r(now) > r(before) ? "up" : "down";
  const symbol = TREND_SYMBOLS[kind];
  const label = { up: "In crescita dall'ultimo evento", down: "In calo dall'ultimo evento", same: "Invariato dall'ultimo evento" }[kind];
  return `<span class="wr-trend is-${kind}" role="img" aria-label="${label}" title="${label}">${symbol}</span>`;
}

// The trend arrows' "before": for each player / commander pair, the latest
// event (by date; a tie: the later one listed) among `eventIds` — the
// filters' scope, nothing outside it — that it was in, as an index into
// `eventsData` (one item per id, same order — js/db.js fetchEventsResults).
// Its numbers without that one event are what they were before it (results
// add up event by event, so callers subtract that event's own). `keysOf(data)`:
// the keys present in one event's data. A key in no event isn't in the map.
export function latestPresence(eventIds, eventsData, eventDateById, keysOf) {
  const latest = new Map(); // key -> event index
  const dateOf = (i) => eventDateById.get(eventIds[i]) ?? "";
  eventsData.forEach((data, i) => {
    for (const key of keysOf(data)) {
      const seen = latest.get(key);
      if (seen === undefined || dateOf(i) >= dateOf(seen)) latest.set(key, i);
    }
  });
  return latest;
}
