// Whether a player's page will show a player card — for its loading
// placeholder (js/player-detail.js: the hero's sketch makes room for the
// card, so the page doesn't move when it arrives). The sure answer comes
// from public_player_card(), a function call: never cached, up to a second
// or more. Meanwhile, from this browser's localStorage:
//   * what this player's page showed last time ("playerCard:<id>");
//   * else whether the player is linked to an account ("linkedPlayers", the
//     ids, kept up to date by every Players.list() — the Giocatori list,
//     the search, the standings' badges): a linked account gets a card
//     (migration 028's default one), so linked means a card, near enough.
// Public data only (the same the pages show).

const LINKED_KEY = "linkedPlayers";
const cardKey = (id) => `playerCard:${id}`;

// Called with Players.list()'s rows (js/db.js).
export function rememberLinkedPlayers(players) {
  try {
    localStorage.setItem(LINKED_KEY, JSON.stringify(players.filter((p) => p.user_id).map((p) => p.id)));
  } catch {
    // No storage: no hint, the placeholder waits for the answer.
  }
}

// true / false, or null when there's nothing to go by.
export function cardHint(id) {
  try {
    const seen = localStorage.getItem(cardKey(id));
    if (seen !== null) return seen === "1";
    const linked = JSON.parse(localStorage.getItem(LINKED_KEY) ?? "null");
    if (Array.isArray(linked)) return linked.includes(id);
  } catch {
    // No storage, or something unreadable in it: no hint.
  }
  return null;
}

// The hint applied to player.html's loading placeholder (the hero's sketch
// making room for the card), from its very first frame: on a full load as
// soon as this runs, on an in-app navigation the moment the router swaps the
// page in (app:main-swapped — before the transition's picture of it, which
// player-detail.js's mount would come too late for). player-detail.js
// corrects it once the card request answers.
export function applyCardPlaceholder(on) {
  const sk = document.querySelector("#page-loading-overlay .sk-hero");
  sk?.classList.toggle("has-card", on);
  sk?.classList.toggle("has-player-card", on);
}

function applyHint() {
  if (!/(^|\/)player\.html$/.test(location.pathname)) return;
  const id = new URLSearchParams(location.search).get("id");
  const hint = id ? cardHint(id) : null;
  if (hint !== null) applyCardPlaceholder(hint);
}

applyHint();
document.addEventListener("app:main-swapped", applyHint);

// The sure answer, for next time.
export function rememberCard(id, hasCard) {
  try {
    localStorage.setItem(cardKey(id), hasCard ? "1" : "0");
  } catch {
    // No storage: guessed again next time.
  }
}
