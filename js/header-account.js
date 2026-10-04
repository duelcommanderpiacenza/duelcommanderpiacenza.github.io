// The round account button in every public page's header (#site-account,
// linking to account.html): a person icon when signed out, the Google
// profile picture once signed in (falling back to the icon if there's no
// picture, or it fails to load). Static markup like the rest of the header
// (see js/layout.js); this only follows the login state.
import { sb } from "./supabase-client.js";

const link = document.getElementById("site-account");

function render(session) {
  if (!link) return;
  link.querySelector(".site-account-avatar")?.remove();
  link.classList.toggle("is-signed-in", Boolean(session));
  const label = session ? `Il tuo profilo (${session.user.email})` : "Accedi";
  link.setAttribute("aria-label", label);
  link.title = label;

  const avatarUrl = session?.user?.user_metadata?.avatar_url;
  if (!avatarUrl) return;
  const img = document.createElement("img");
  img.className = "site-account-avatar";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.src = avatarUrl;
  img.addEventListener("error", () => img.remove());
  link.appendChild(img);
}

sb.auth.onAuthStateChange((_event, session) => render(session));
