// The "☆ Segui" / "★ Seguito" button on player.html and commander.html, on its
// own line right below the name: a signed-in account follows that player or commander
// (js/db.js's Follows, supabase/migrations/010) — they then show in its
// "Seguiti" card on account.html. Nothing at all when signed out; nothing if
// the follows can't be read (e.g. migration 010 not run yet).
import { sb } from "./supabase-client.js";
import { Follows } from "./db.js";

// kind: "player" or "commander"; the button goes on a line of its own right
// after titleEl (the page's <h1>, inside .page-heading).
export async function initFollowButton(titleEl, kind, id) {
  if (!titleEl || !id) return;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return;
  const userId = session.user.id;
  // Not on one's own player page: following yourself makes no sense (the
  // database refuses it too).
  if (kind === "player") {
    const { data: player } = await sb.from("players").select("user_id").eq("id", id).maybeSingle();
    if (player?.user_id === userId) return;
  }
  let following;
  try {
    following = await Follows.isFollowing(userId, kind, id);
  } catch (err) {
    console.error(err);
    return;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "follow-btn";
  const followLabel = kind === "player" ? "Segui questo giocatore" : "Segui questo comandante";
  function render() {
    btn.classList.toggle("is-following", following);
    btn.setAttribute("aria-pressed", String(following));
    btn.title = following ? "Non seguire più" : followLabel;
    btn.innerHTML = `<span class="follow-btn-star" aria-hidden="true">${following ? "★" : "☆"}</span>${
      following ? "Seguito" : "Segui"
    }`;
  }
  render();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      if (following) await Follows.unfollow(userId, kind, id);
      else await Follows.follow(userId, kind, id);
      following = !following;
      render();
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
  const row = document.createElement("div");
  row.className = "follow-btn-row";
  row.appendChild(btn);
  titleEl.insertAdjacentElement("afterend", row);
  // The heading just got taller: what's measured from it — the commander
  // image's / player card's height, the back button's alignment on phones —
  // is redone by the pages' own resize handlers.
  window.dispatchEvent(new Event("resize"));
}
