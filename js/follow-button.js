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
  // The star and the text are built once and only updated: the star is
  // never removed and put back (a new one, starting its animation from
  // nothing, read as the star blinking out and in).
  btn.innerHTML = '<span class="follow-btn-star" aria-hidden="true"></span><span class="follow-btn-text"></span>';
  const starEl = btn.querySelector(".follow-btn-star");
  const textEl = btn.querySelector(".follow-btn-text");
  function render() {
    btn.classList.toggle("is-following", following);
    btn.setAttribute("aria-pressed", String(following));
    btn.title = following ? "Non seguire più" : followLabel;
    // Its name said in full (the visible text can be hidden — the detail
    // pages' heroes show the star alone, styles.css .detail-hero-wrap).
    btn.setAttribute("aria-label", following ? "Seguito: non seguire più" : followLabel);
    starEl.textContent = following ? "★" : "☆";
    textEl.textContent = following ? "Seguito" : "Segui";
  }
  render();

  // A click's change: the star spins — following one way, unfollowing the
  // other — shrinking a little, the new state (star, colours) drawn halfway
  // round (at 144°: a five-pointed star looks the same every 72°, so the
  // swap doesn't show), then the rest of the turn with a little bounce.
  // Never gone, never redrawn from nothing. Reduced motion: just the new
  // state.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  async function spinTo() {
    if (reducedMotion.matches || !starEl.animate) {
      render();
      return;
    }
    const dir = following ? 1 : -1;
    await starEl
      .animate([{ transform: "rotate(0deg) scale(1)" }, { transform: `rotate(${144 * dir}deg) scale(0.75)` }], {
        duration: 160,
        easing: "ease-in",
      })
      .finished.catch(() => {});
    render();
    starEl.animate(
      [
        { transform: `rotate(${144 * dir}deg) scale(0.75)` },
        { transform: `rotate(${330 * dir}deg) scale(1.25)`, offset: 0.7 },
        { transform: `rotate(${360 * dir}deg) scale(1)` },
      ],
      { duration: 340, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.2)" }
    );
  }

  // While its request runs: busy (aria-busy — a second click ignored, a
  // "working" cursor), not disabled — a disabled button dims, and its
  // un-dimming right as the star changes read as a glitch.
  let busy = false;
  btn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    btn.setAttribute("aria-busy", "true");
    try {
      if (following) await Follows.unfollow(userId, kind, id);
      else await Follows.follow(userId, kind, id);
      following = !following;
      await spinTo();
    } catch (err) {
      console.error(err);
    } finally {
      busy = false;
      btn.removeAttribute("aria-busy");
    }
  });
  const row = document.createElement("div");
  row.className = "follow-btn-row";
  row.appendChild(btn);
  // The detail pages' hero: beside it, in its wrap (like the back pill —
  // the hero clips what's inside it, and the star sits on its edge on
  // desktop, styles.css .detail-hero-wrap); else right after the title.
  const heroWrap = titleEl.closest(".detail-hero-wrap");
  if (heroWrap) heroWrap.append(row);
  else titleEl.insertAdjacentElement("afterend", row);
  // The heading just got taller: what's measured from it — the commander
  // image's / player card's height, the back button's alignment on phones —
  // is redone by the pages' own resize handlers.
  window.dispatchEvent(new Event("resize"));
}
