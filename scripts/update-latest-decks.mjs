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
  for (const commander of Object.values(deckDetails?.commanders ?? {})) {
    if (commander?.card?.scryfall_id) {
      return commander.card.scryfall_id;
    }

    if (commander?.card?.scryfallId) {
      return commander.card.scryfallId;
    }
  }

  return null;
}

function findCommanderName(deckDetails) {
  for (const commander of Object.values(deckDetails?.commanders ?? {})) {
    if (commander?.card?.name) {
      return commander.card.name;
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

function buildDeckUrl(deck) {
  if (!deck?.publicUrl) {
    return null;
  }

  if (deck.name?.startsWith("[PRIMER]")) {
    return `${deck.publicUrl.replace(/\/$/, "")}/primer`;
  }

  return deck.publicUrl;
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
  let commanderName = null;

  try {
    const deckDetails = await fetchJson(
      `https://api.moxfield.com/v2/decks/all/${deck.publicId}`
    );
    const commanderScryfallId = findCommanderCardId(deckDetails);
    commanderName = findCommanderName(deckDetails);
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
    url: buildDeckUrl(deck),
    commanderName,
    updatedAtUtc: toIsoDate(deck.lastUpdatedAtUtc || deck.createdAtUtc),
    createdAtUtc: toIsoDate(deck.createdAtUtc),
    format: deck.format ?? null,
    previewImageUrl,
  });
}

await writeFile(outputPath, `${JSON.stringify(outputDecks, null, 2)}\n`, "utf8");

console.log(`Saved ${outputDecks.length} deck(s) to decks.json`);
