import { writeFile } from "node:fs/promises";

const apiUrl =
  "https://api.moxfield.com/v2/users/Duel_Commander_Piacenza/decks?pageSize=100";
const outputPath = new URL("../decks.json", import.meta.url);
const userAgent = process.env.MOXFIELD_USER_AGENT;
const minDelayBetweenRequestsMs = 2000;

if (!userAgent) {
  throw new Error(
    "Missing MOXFIELD_USER_AGENT. Configure it in your environment or GitHub Actions secrets."
  );
}

function toIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} with HTTP ${response.status}`);
  }

  return response.json();
}

function findCommanderCardId(deckDetails) {
  const boards = [deckDetails?.boards?.commanders, deckDetails?.boards?.signatureSpells];

  for (const board of boards) {
    if (!board || typeof board !== "object") {
      continue;
    }

    for (const card of Object.values(board)) {
      if (card?.card?.scryfall_id) {
        return card.card.scryfall_id;
      }

      if (card?.card?.scryfallId) {
        return card.card.scryfallId;
      }
    }
  }

  for (const card of Object.values(deckDetails?.mainboard ?? {})) {
    if (card?.card?.scryfall_id && card?.quantity === 1) {
      return card.card.scryfall_id;
    }

    if (card?.card?.scryfallId && card?.quantity === 1) {
      return card.card.scryfallId;
    }
  }

  return null;
}

function buildScryfallImageUrl(scryfallId) {
  if (!scryfallId) {
    return null;
  }

  return `https://api.scryfall.com/cards/${scryfallId}?format=image&version=art_crop`;
}

const payload = await fetchJson(apiUrl);
const decks = Array.isArray(payload.data) ? payload.data : [];

const latestDecks = decks
  .filter((deck) => deck?.publicUrl && deck?.name)
  .sort((left, right) => {
    const leftTime = new Date(
      left.lastUpdatedAtUtc || left.createdAtUtc || 0
    ).getTime();
    const rightTime = new Date(
      right.lastUpdatedAtUtc || right.createdAtUtc || 0
    ).getTime();

    return rightTime - leftTime;
  })
  .slice(0, 10);

const outputDecks = [];

for (const [index, deck] of latestDecks.entries()) {
  if (index > 0) {
    await sleep(minDelayBetweenRequestsMs);
  }

  let previewImageUrl = null;

  try {
    const deckDetails = await fetchJson(
      `https://api.moxfield.com/v2/decks/all/${deck.publicId}`
    );
    const commanderScryfallId = findCommanderCardId(deckDetails);
    previewImageUrl = buildScryfallImageUrl(commanderScryfallId);
  } catch (error) {
    console.warn(
      `Could not enrich deck ${deck.publicId} with commander art: ${error.message}`
    );
  }

  outputDecks.push({
    id: deck.id ?? null,
    publicId: deck.publicId ?? null,
    name: deck.name,
    url: deck.publicUrl,
    updatedAtUtc: toIsoDate(deck.lastUpdatedAtUtc || deck.createdAtUtc),
    createdAtUtc: toIsoDate(deck.createdAtUtc),
    format: deck.format ?? null,
    previewImageUrl,
  });
}

await writeFile(outputPath, `${JSON.stringify(outputDecks, null, 2)}\n`, "utf8");

console.log(`Saved ${outputDecks.length} deck(s) to decks.json`);
