import { writeFile } from "node:fs/promises";

const apiUrl =
  "https://api.moxfield.com/v2/users/Duel_Commander_Piacenza/decks?pageSize=100";
const outputPath = new URL("../decks.json", import.meta.url);
const userAgent = process.env.MOXFIELD_USER_AGENT;

if (!userAgent) {
  throw new Error(
    "Missing MOXFIELD_USER_AGENT. Configure it in your environment or GitHub Actions secrets."
  );
}

function toIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildImageUrl(deck) {
  if (typeof deck.previewImageUrl === "string" && deck.previewImageUrl) {
    return deck.previewImageUrl;
  }

  if (typeof deck.imageUrl === "string" && deck.imageUrl) {
    return deck.imageUrl;
  }

  return null;
}

const response = await fetch(apiUrl, {
  headers: {
    "User-Agent": userAgent,
    Accept: "application/json",
  },
});

if (!response.ok) {
  throw new Error(`Moxfield request failed with HTTP ${response.status}`);
}

const payload = await response.json();
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
  .slice(0, 10)
  .map((deck) => ({
    id: deck.id ?? null,
    publicId: deck.publicId ?? null,
    name: deck.name,
    url: deck.publicUrl,
    updatedAtUtc: toIsoDate(deck.lastUpdatedAtUtc || deck.createdAtUtc),
    createdAtUtc: toIsoDate(deck.createdAtUtc),
    format: deck.format ?? null,
    previewImageUrl: buildImageUrl(deck),
  }));

await writeFile(outputPath, `${JSON.stringify(latestDecks, null, 2)}\n`, "utf8");

console.log(`Saved ${latestDecks.length} deck(s) to decks.json`);
