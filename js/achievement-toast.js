// "Obiettivo sbloccato": the bar that tells a signed-in account about an
// achievement it hasn't been shown yet (js/achievements.js) — on any page,
// once per account (the "seen" record is kept with the account, migration
// 028's achievements_seen, not per device). Xbox-style: the medal pops in
// at the top's centre with a gold pulse, the bar opens out of it (the
// medal sliding to its place on the left, the text coming in), stays, then
// closes back into the medal, which shrinks away (styles.css "Obiettivo
// sbloccato"). Several new at once: ONE bar — a stack of medals with the
// count, "N obiettivi sbloccati" and the names (the first two and "e altri
// N" past three). A tap opens the profile's "Obiettivi". A plain fade under
// reduced motion.
//
// Checked once the page is loaded (its splash gone), then again on an
// in-app navigation at most every RECHECK_MS: my_achievements() records any
// site achievement just earned and returns the rest; the ones shown are
// marked seen at once.

import { sb } from "./supabase-client.js";
import { Achievements } from "./db.js";
import { achievementState, BY_KEY, medalHtml, nameHtml } from "./achievements.js";
import { haptic } from "./haptics.js";
import { navigate } from "./router.js";

const RECHECK_MS = 5 * 60 * 1000;
const AFTER_LOAD_MS = 700;

let userId = null;
let lastCheck = 0;
let checking = false;
let bar = null;

// Once the page's content is in (body.is-loading gone), a beat later.
function whenPageShown(fn) {
  const run = () => setTimeout(fn, AFTER_LOAD_MS);
  if (!document.body.classList.contains("is-loading")) return run();
  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("is-loading")) return;
    observer.disconnect();
    run();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

async function check() {
  if (checking || !userId || document.visibilityState === "hidden") return;
  checking = true;
  lastCheck = Date.now();
  const forUser = userId;
  try {
    const rows = await Achievements.mine();
    if (forUser !== userId) return;
    const of = (kind) => rows.filter((r) => r.kind === kind);
    const seen = new Set(of("seen").map((r) => `${r.key}:${r.level}`));
    const fresh = [...achievementState(of("player"), of("site"))]
      .filter(([key, st]) => BY_KEY.has(key) && !seen.has(`${key}:${st.level}`))
      .map(([key, st]) => ({ a: BY_KEY.get(key), level: st.level }));
    if (!fresh.length) return;
    show(fresh);
    await Achievements.markSeen(forUser, fresh.map(({ a, level }) => ({ key: a.key, level })));
  } catch (err) {
    // Never in the way: e.g. migration 028 not run on this database yet.
    console.error(err);
  } finally {
    checking = false;
  }
}

function hide() {
  bar?.remove();
  bar = null;
}

// Two or three: every name ("A, B e C"); more: the first two and the rest counted.
function namesHtml(list) {
  const names = list.map(({ a, level }) => nameHtml(a, level, "ach-toast-tier"));
  if (names.length > 3) return `${names.slice(0, 2).join(", ")} e altri ${names.length - 2}`;
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

function show(list) {
  hide();
  const group = list.length > 1;
  const medal = group
    ? `<span class="ach-medal is-stack" aria-hidden="true"><span class="ach-stack-count">${list.length}</span></span>`
    : medalHtml(list[0].a, list[0].level);
  const label = group ? `${list.length} obiettivi sbloccati` : "Obiettivo sbloccato";
  const names = group ? namesHtml(list) : nameHtml(list[0].a, list[0].level, "ach-toast-tier");
  bar = document.createElement("div");
  bar.className = `ach-toast${group ? " is-group" : ""}`;
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span class="ach-toast-pulse" aria-hidden="true"></span>
    <button type="button" class="ach-toast-bar">${medal}<span class="ach-toast-text"><small>${label}</small><b>${names}</b></span></button>`;
  bar.style.visibility = "hidden";
  document.body.append(bar);
  // The medal starts at the bar's centre: its offset from its own place
  // (a stack's discs widen it to the right).
  const button = bar.querySelector(".ach-toast-bar");
  const medalEl = bar.querySelector(".ach-medal");
  const shift = button.offsetWidth / 2 - (medalEl.offsetLeft + medalEl.offsetWidth / 2) - (group ? 6 : 0);
  bar.style.setProperty("--ach-mx", `${shift}px`);
  bar.style.visibility = "";
  bar.classList.add("is-on");
  haptic("confirm");
  const shown = bar;
  shown.addEventListener("animationend", (e) => {
    if (e.target === shown && bar === shown) hide();
  });
  button.addEventListener("click", () => {
    hide();
    navigate("account.html#obiettivi");
  });
}

sb.auth.onAuthStateChange((_event, session) => {
  // Deferred: a Supabase call inside supabase-js' own auth callback stalls it.
  setTimeout(() => {
    const id = session?.user?.id ?? null;
    if (id === userId) return;
    userId = id;
    lastCheck = 0;
    if (!id) return hide();
    whenPageShown(check);
  }, 0);
});

document.addEventListener("app:navigate", () => {
  hide();
  if (userId && Date.now() - lastCheck > RECHECK_MS) whenPageShown(check);
});
