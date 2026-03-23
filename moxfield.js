function buildDeckBadge(deck) {
  if (deck.name.startsWith("[PRIMER]")) {
    return "Primer";
  }

  return "Deck";
}

function buildPlaceholderLabel(deck) {
  const source = deck.commanderName || deck.name;
  const words = source
    .replace(/\[[^\]]+\]/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  return (words[0] || "Deck").slice(0, 2).toUpperCase();
}

function createDeckCard(deck) {
  const article = document.createElement("article");
  article.className = "deck";

  const badge = buildDeckBadge(deck);
  const commanderName = deck.commanderName || "Unknown commander";

  const media = deck.previewImageUrl
    ? `
      <div class="deck-visual deck-preview">
        <img src="${deck.previewImageUrl}" alt="Commander art for ${commanderName}" loading="lazy">
      </div>
    `
    : `
      <div class="deck-visual deck-placeholder" aria-hidden="true">
        <span class="deck-placeholder-mark">${buildPlaceholderLabel(deck)}</span>
        <span class="deck-placeholder-format">${badge}</span>
      </div>
    `;

  article.innerHTML = `
    ${media}
    <div class="deck-body">
      <div class="deck-topline">
        <span class="deck-badge">${badge}</span>
      </div>
      <div class="deck-title">${deck.name}</div>
      <div class="deck-commander">
        <span class="deck-commander-label">Commander</span>
        <span class="deck-commander-value">${commanderName}</span>
      </div>
      <a class="deck-link" href="${deck.url}" target="_blank" rel="noopener noreferrer">View deck on Moxfield</a>
    </div>
  `;

  return article;
}

function getFilteredDecks(decks, selectedFilter) {
  if (selectedFilter === "All") {
    return decks;
  }

  return decks.filter((deck) => buildDeckBadge(deck) === selectedFilter);
}

function renderDecks(container, decks, selectedFilter) {
  container.innerHTML = "";

  const filteredDecks = getFilteredDecks(decks, selectedFilter);

  if (filteredDecks.length === 0) {
    container.className = "";
    container.textContent = "No decks found for this filter.";
    return;
  }

  container.className = "decks-grid";
  filteredDecks.forEach((deck) => {
    container.appendChild(createDeckCard(deck));
  });
}

function renderFilters(container, decks) {
  const filterLabels = ["All", ...new Set(decks.map((deck) => buildDeckBadge(deck)))];
  const wrapper = document.createElement("div");
  wrapper.className = "deck-filters";

  let selectedFilter = "All";

  filterLabels.forEach((label, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deck-filter";
    if (index === 0) {
      button.classList.add("is-active");
    }

    button.dataset.filter = label;
    button.textContent = label;

    button.addEventListener("click", () => {
      selectedFilter = label;

      wrapper.querySelectorAll(".deck-filter").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });

      renderDecks(container, decks, selectedFilter);
    });

    wrapper.appendChild(button);
  });

  container.before(wrapper);
  renderDecks(container, decks, selectedFilter);
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

    if (!Array.isArray(decks) || decks.length === 0) {
      container.className = "";
      container.textContent = "No decks available yet.";
      return;
    }

    const previousFilters = container.previousElementSibling;
    if (previousFilters?.classList.contains("deck-filters")) {
      previousFilters.remove();
    }

    renderFilters(container, decks);
  } catch (e) {
    container.className = "";
    container.innerHTML = "Failed to load decks.";
    console.error(e);
  }
}

loadDecks();
