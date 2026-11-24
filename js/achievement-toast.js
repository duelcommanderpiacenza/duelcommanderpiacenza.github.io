// "Obiettivo sbloccato": the bar that tells a signed-in account about an
// achievement it hasn't been shown yet (js/achievements.js) — on any page,
// once per account (the "seen" record is kept with the account, migration
// 047's achievements_seen, not per device). Xbox-style: the medal pops in
// at the top's centre with a pulse, the bar opens out of it (the medal
// sliding to its place on the left, the text coming in), stays, then
// closes back into the medal, which shrinks away (styles.css "Obiettivo
// sbloccato" — white in the light theme, dark wine in the dark one).
// Several new at once: ONE bar — the real medals stacked (the highest level
// in front, two behind it) with a count badge, "N obiettivi sbloccati" and
// the names (the first two and "e altri N" past three). A tap opens the
// profile's "Obiettivi". A plain fade under reduced motion.
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
    // Never in the way: e.g. migration 047 not run on this database yet.
    console.error(err);
  } finally {
    checking = false;
  }
}

function hide() {
  bar?.remove();
  bar = null;
}

// Two or three: every name ("A, B e C"); more: the first two and the rest
// counted. Each name, "e" and "e altri N" a text of its own, so the English
// version (js/i18n-en.js) can translate them one by one.
function namesHtml(list) {
  const names = list.map(({ a, level }) => `<span>${nameHtml(a, level, "ach-toast-tier")}</span>`);
  if (names.length > 3) return `${names.slice(0, 2).join(", ")} <span>e altri ${names.length - 2}</span>`;
  return `${names.slice(0, -1).join(", ")} <span>e</span> ${names.at(-1)}`;
}

// Several at once: the one with the highest level in front (the first on
// a tie), the next two behind it, the count on a badge.
function stackHtml(list) {
  const front = list.reduce((best, x) => (x.level > best.level ? x : best), list[0]);
  const [back1, back2] = list.filter((x) => x !== front);
  return `<span class="ach-medal-stack" aria-hidden="true">${medalHtml(front.a, front.level, "is-front")}${medalHtml(back1.a, back1.level, "is-back1")}${
    back2 ? medalHtml(back2.a, back2.level, "is-back2") : ""
  }<span class="ach-stack-count">${list.length}</span></span>`;
}

function show(list) {
  hide();
  const group = list.length > 1;
  const medal = group ? stackHtml(list) : medalHtml(list[0].a, list[0].level);
  const label = group ? `${list.length} obiettivi sbloccati` : "Obiettivo sbloccato";
  const names = group ? namesHtml(list) : nameHtml(list[0].a, list[0].level, "ach-toast-tier");
  bar = document.createElement("div");
  bar.className = `ach-toast${group ? " is-group" : ""}`;
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span class="ach-toast-pulse" aria-hidden="true"></span>
    <button type="button" class="ach-toast-bar">${medal}<span class="ach-toast-text"><small>${label}</small><b>${names}</b></span></button>`;
  bar.style.visibility = "hidden";
  document.body.append(bar);
  // The medal starts at the bar's centre, inside a pill just round it: its
  // whole drawn width measured (a stack's back discs and count badge reach
  // past its box), centred — --ach-mx its offset from its own place,
  // --ach-half the starting pill's half width.
  const button = bar.querySelector(".ach-toast-bar");
  const medalEl = button.firstElementChild;
  const box = button.getBoundingClientRect();
  const rects = [medalEl, ...medalEl.querySelectorAll("*")].map((el) => el.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left)) - box.left;
  const right = Math.max(...rects.map((r) => r.right)) - box.left;
  bar.style.setProperty("--ach-mx", `${box.width / 2 - (left + right) / 2}px`);
  bar.style.setProperty("--ach-half", `${Math.max(32, (right - left) / 2 + 12)}px`);
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
