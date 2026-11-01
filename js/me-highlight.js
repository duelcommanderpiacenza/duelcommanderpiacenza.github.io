// "Tu": for a signed-in account linked to a player, that player is marked
// wherever it appears — every link to its page (player.html?id=…, which is
// how js/ui.js's playerLabel and the lists write a player's name) gets a
// small "Tu" pill after it, and a table row holding one is tinted
// (styles.css .me-pill, .is-me-row). Works on any page without the pages
// knowing: the linked player's id (only when signed in), then a watch on the
// page, so tables drawn or paged later are marked too. Imported by
// js/layout.js.
//
// The id is kept in the browser per account (localStorage "mePlayer:<user
// id>"), read from the database only when not known yet — an account's
// player only changes when the admin approves (or removes) a link, and
// account.html, which loads the link anyway, keeps it up to date
// (rememberMyPlayer). "Not linked yet" is kept only for NOT_LINKED_FOR, so
// an approval shows here before the next visit to the Profilo too.
import { sb } from "./supabase-client.js";

// Not marked: the site search's results (a list of matches, not "you"), and
// buttons that happen to lead to the player page (account.html's "Pagina
// giocatore →"). A badge holder (badges.html) is marked but gets no pill —
// it's a pill already.
const SKIP = ".site-search, .btn-primary, .btn-secondary";
const NO_PILL = ".badge-holder";

const NOT_LINKED_FOR = 60 * 60 * 1000;
const storeKey = (userId) => `mePlayer:${userId}`;

// The account's linked player (an id, or null for none) remembered.
export function rememberMyPlayer(userId, playerId) {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify({ id: playerId ?? null, at: Date.now() }));
  } catch {
    // Storage off: asked again next time.
  }
}

function rememberedPlayer(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(userId)) ?? "null");
    if (!saved || typeof saved !== "object") return undefined;
    if (saved.id) return saved.id;
    return Date.now() - (saved.at ?? 0) < NOT_LINKED_FOR ? null : undefined;
  } catch {
    return undefined;
  }
}

async function myPlayerId() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return null;
  const known = rememberedPlayer(session.user.id);
  if (known !== undefined) return known;
  const { data, error } = await sb.from("players").select("id").eq("user_id", session.user.id).maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  rememberMyPlayer(session.user.id, data?.id ?? null);
  return data?.id ?? null;
}

function markLinks(root, playerId) {
  for (const link of root.querySelectorAll(`a[href="player.html?id=${playerId}"]`)) {
    if (link.classList.contains("is-me") || link.closest(SKIP)) continue;
    link.classList.add("is-me");
    // A list sub-card that is itself the link (js/history-list.js): the pill
    // inside it, after the name, and the whole card tinted.
    if (link.matches(".history-item")) {
      link.querySelector(".history-name")?.insertAdjacentHTML("afterend", ' <span class="me-pill">Tu</span>');
      link.classList.add("is-me-row");
      continue;
    }
    if (!link.matches(NO_PILL)) link.insertAdjacentHTML("afterend", ' <span class="me-pill">Tu</span>');
    link.closest("tr")?.classList.add("is-me-row");
  }
}

// Signed out: no account's player kept in the browser.
function forgetAllPlayers() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("mePlayer:")) localStorage.removeItem(key);
  } catch {
    // Storage off: nothing kept.
  }
}

export async function initMeHighlight() {
  sb.auth.onAuthStateChange((_event, session) => {
    if (!session) forgetAllPlayers();
  });
  const playerId = await myPlayerId();
  if (!playerId) return;
  markLinks(document.body, playerId);
  // Content drawn later (loaded tables, pagination, filters): marked on the
  // next frame after it changes, once per frame at most.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      markLinks(document.body, playerId);
    });
  }).observe(document.body, { childList: true, subtree: true });
}
