import { writeFile } from "node:fs/promises";

const BASE_URL       = "https://api.moxfield.com/v2";
const USERNAME       = "michele__f";
const OUTPUT_PATH    = new URL("../deckdiff/decks-data.json", import.meta.url);
const MIN_INTERVAL   = 1000; // ms between requests — max 1 req/sec
const userAgent      = process.env.MOXFIELD_USER_AGENT;

if (!userAgent) {
  throw new Error("Missing MOXFIELD_USER_AGENT environment variable.");
}

let lastRequestAt = 0;

async function fetchJson(url) {
  const wait = MIN_INTERVAL - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const res = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function extractCards(details) {
  const cards = {};
  for (const section of ["commanders", "mainboard", "sideboard", "companions", "attractions"]) {
    for (const entry of Object.values(details[section] || {})) {
      const name = entry?.card?.name || entry?.name;
      const qty  = entry?.quantity ?? 1;
      if (name) cards[name] = (cards[name] || 0) + qty;
    }
  }
  return cards;
}

const payload = await fetchJson(`${BASE_URL}/users/${USERNAME}/decks?pageSize=100`);
const decks   = (payload.data || []).filter((d) => d.publicId && d.name);

console.log(`Found ${decks.length} deck(s) for ${USERNAME}.`);

const result = [];

for (const [i, deck] of decks.entries()) {
  console.log(`[${i + 1}/${decks.length}] ${deck.name}`);

  try {
    const details   = await fetchJson(`${BASE_URL}/decks/all/${deck.publicId}`);
    const cards     = extractCards(details);
    const cardCount = Object.values(cards).reduce((s, q) => s + q, 0);

    result.push({
      publicId: deck.publicId,
      name:     deck.name,
      format:   deck.format ?? null,
      cardCount,
      cards,
    });
  } catch (e) {
    console.warn(`  Skipped: ${e.message}`);
  }
}

await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Saved ${result.length} deck(s) to deckdiff/decks-data.json`);
