function formatTimestamp(value) {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function buildDeckBadge(deck) {
  if (deck.name.startsWith("[PRIMER]")) {
    return "Primer";
  }

  if (deck.format === "duelCommander") {
    return "Duel Commander";
  }

  return deck.format || "Deck";
}

function buildPlaceholderLabel(deck) {
  const words = deck.name
    .replace(/\[[^\]]+\]/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  return (words[0] || "Deck").slice(0, 2).toUpperCase();
}

function createDeckCard(deck, index) {
  const article = document.createElement("article");
  article.className = "deck";

  const badge = buildDeckBadge(deck);
  const updatedAt = formatTimestamp(deck.updatedAtUtc);
  const createdAt = formatTimestamp(deck.createdAtUtc);

  const media = deck.previewImageUrl
    ? `
      <a class="deck-visual deck-preview" href="${deck.url}" target="_blank" rel="noopener noreferrer">
        <img src="${deck.previewImageUrl}" alt="Preview for ${deck.name}" loading="lazy">
      </a>
    `
    : `
      <a class="deck-visual deck-placeholder" href="${deck.url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${deck.name} on Moxfield">
        <span class="deck-placeholder-rank">#${index + 1}</span>
        <span class="deck-placeholder-mark">${buildPlaceholderLabel(deck)}</span>
        <span class="deck-placeholder-format">${badge}</span>
      </a>
    `;

  article.innerHTML = `
    ${media}
    <div class="deck-body">
      <div class="deck-topline">
        <span class="deck-badge">${badge}</span>
        <span class="deck-rank">Latest #${index + 1}</span>
      </div>
      <a class="deck-title" href="${deck.url}" target="_blank" rel="noopener noreferrer">${deck.name}</a>
      <div class="deck-meta-row">
        <span class="deck-meta-label">Updated</span>
        <span class="deck-meta-value">${updatedAt}</span>
      </div>
      <div class="deck-meta-row">
        <span class="deck-meta-label">Created</span>
        <span class="deck-meta-value">${createdAt}</span>
      </div>
      <a class="deck-link" href="${deck.url}" target="_blank" rel="noopener noreferrer">View deck on Moxfield</a>
    </div>
  `;

  return article;
}

async function loadDecks() {
  const container = document.getElementById("decks");

  if (window.location.protocol === "file:") {
    container.innerHTML = `
      Local preview cannot load <code>decks.json</code> from <code>file://</code>.
      Open this site through a small local web server instead.
    `;
    return;
  }

  try {
    const res = await fetch("decks.json");
    const decks = await res.json();

    container.innerHTML = "";
    container.className = "decks-grid";

    if (!Array.isArray(decks) || decks.length === 0) {
      container.className = "";
      container.textContent = "No decks available yet.";
      return;
    }

    decks.forEach((deck, index) => {
      container.appendChild(createDeckCard(deck, index));
    });
  } catch (e) {
    container.className = "";
    container.innerHTML = "Failed to load decks.";
    console.error(e);
  }
}

loadDecks();
