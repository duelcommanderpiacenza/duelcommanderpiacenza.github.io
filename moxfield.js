function buildDeckBadge(deck) {
  if (deck.name.startsWith("[PRIMER]")) {
    return "Primer";
  }

  return "Deck";
}

function buildVideoBadge(video) {
  return video.category || "Others";
}

function buildPlaceholderLabel(deck) {
  const source = deck.commanderName || deck.name;
  const words = source
    .replace(/\[[^\]]+\]/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  return (words[0] || "Deck").slice(0, 2).toUpperCase();
}

function formatVideoDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function createExpandButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "expand-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createSectionLink(label, url) {
  const link = document.createElement("a");
  link.className = "section-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function createDeckCard(deck) {
  const article = document.createElement("article");
  article.className = "deck";

  const badge = buildDeckBadge(deck);
  const commanderName = deck.commanderName || "Unknown commander";

  const media = deck.previewImageUrl
    ? `
      <a class="deck-visual deck-preview" href="${deck.url}" target="_blank" rel="noopener noreferrer">
        <img src="${deck.previewImageUrl}" alt="Commander art for ${commanderName}" loading="lazy">
      </a>
    `
    : `
      <a class="deck-visual deck-placeholder" href="${deck.url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${deck.name} on Moxfield">
        <span class="deck-placeholder-mark">${buildPlaceholderLabel(deck)}</span>
        <span class="deck-placeholder-format">${badge}</span>
      </a>
    `;

  article.innerHTML = `
    ${media}
    <div class="deck-body">
      <div class="deck-topline">
        <span class="deck-badge">${badge}</span>
      </div>
      <a class="deck-title" href="${deck.url}" target="_blank" rel="noopener noreferrer">${deck.name}</a>
      <div class="deck-commander">
        <span class="deck-commander-label">Commander</span>
        <span class="deck-commander-value">${commanderName}</span>
      </div>
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
  const previewCount = 2;
  let isExpanded = false;

  if (filteredDecks.length === 0) {
    container.className = "";
    container.textContent = "No decks found for this filter.";
    return;
  }

  const list = document.createElement("div");
  list.className = "decks-grid";
  container.className = "";
  container.appendChild(list);

  function paint() {
    list.innerHTML = "";

    const visibleDecks = isExpanded
      ? filteredDecks
      : filteredDecks.slice(0, previewCount);

    visibleDecks.forEach((deck) => {
      list.appendChild(createDeckCard(deck));
    });
  }

  paint();

  const actions = document.createElement("div");
  actions.className = "section-actions";

  if (filteredDecks.length > previewCount) {
    const toggleButton = createExpandButton("Show more", () => {
      isExpanded = !isExpanded;
      toggleButton.textContent = isExpanded ? "Show less" : "Show more";
      paint();
    });

    actions.appendChild(toggleButton);
  }

  actions.appendChild(
    createSectionLink(
      "Open Moxfield",
      "https://moxfield.com/users/Duel_Commander_Piacenza"
    )
  );

  container.appendChild(actions);
}

function renderFilters(container, decks) {
  const filterLabels = ["All", ...new Set(decks.map((deck) => buildDeckBadge(deck)))];
  const filtersSlot = document.getElementById("deck-filters-slot");
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

  if (filtersSlot) {
    filtersSlot.innerHTML = "";
    filtersSlot.appendChild(wrapper);
  } else {
    container.before(wrapper);
  }

  renderDecks(container, decks, selectedFilter);
}

function getFilteredVideos(videos, selectedFilter) {
  if (selectedFilter === "All") {
    return videos;
  }

  return videos.filter((video) => buildVideoBadge(video) === selectedFilter);
}

function createVideoCard(video) {
  const article = document.createElement("article");
  article.className = "video-card";
  const badge = buildVideoBadge(video);

  article.innerHTML = `
    <a class="video-thumb" href="${video.url}" target="_blank" rel="noopener noreferrer">
      <img src="${video.thumbnailUrl}" alt="Thumbnail for ${video.title}" loading="lazy">
    </a>
    <div class="video-body">
      <div class="video-topline">
        <span class="video-badge">${badge}</span>
      </div>
      <div class="video-date">${formatVideoDate(video.publishedAtUtc)}</div>
      <div class="video-title">${video.title}</div>
    </div>
  `;

  return article;
}

function renderVideos(container, videos) {
  container.innerHTML = "";

  if (!Array.isArray(videos) || videos.length === 0) {
    container.className = "";
    container.textContent = "No videos available yet.";
    return;
  }

  renderVideoFilters(container, videos);
}

function renderVideoList(container, videos, selectedFilter) {
  container.innerHTML = "";
  const previewCount = 2;
  let isExpanded = false;

  const filteredVideos = getFilteredVideos(videos, selectedFilter);

  if (filteredVideos.length === 0) {
    container.className = "";
    container.textContent = "No videos found for this filter.";
    return;
  }

  const list = document.createElement("div");
  list.className = "videos-grid";
  container.className = "";
  container.appendChild(list);

  function paint() {
    list.innerHTML = "";

    const visibleVideos = isExpanded
      ? filteredVideos
      : filteredVideos.slice(0, previewCount);
    visibleVideos.forEach((video) => {
      list.appendChild(createVideoCard(video));
    });
  }

  paint();

  const actions = document.createElement("div");
  actions.className = "section-actions";

  if (filteredVideos.length > previewCount) {
    const toggleButton = createExpandButton("Show more", () => {
      isExpanded = !isExpanded;
      toggleButton.textContent = isExpanded ? "Show less" : "Show more";
      paint();
    });

    actions.appendChild(toggleButton);
  }

  actions.appendChild(
    createSectionLink(
      "Open YouTube",
      "https://www.youtube.com/@DuelCommanderPiacenza"
    )
  );

  container.appendChild(actions);
}

function renderVideoFilters(container, videos) {
  const filterLabels = ["All", ...new Set(videos.map((video) => buildVideoBadge(video)))];
  const filtersSlot = document.getElementById("video-filters-slot");
  const wrapper = document.createElement("div");
  wrapper.className = "video-filters";

  let selectedFilter = "All";

  filterLabels.forEach((label, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "video-filter";
    if (index === 0) {
      button.classList.add("is-active");
    }

    button.dataset.filter = label;
    button.textContent = label;

    button.addEventListener("click", () => {
      selectedFilter = label;

      wrapper.querySelectorAll(".video-filter").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });

      renderVideoList(container, videos, selectedFilter);
    });

    wrapper.appendChild(button);
  });

  if (filtersSlot) {
    filtersSlot.innerHTML = "";
    filtersSlot.appendChild(wrapper);
  }

  renderVideoList(container, videos, selectedFilter);
}

async function loadDecks() {
  const container = document.getElementById("decks");

  try {
    const res = await fetch("decks.json");
    const decks = await res.json();

    if (!Array.isArray(decks) || decks.length === 0) {
      container.className = "";
      container.textContent = "No decks available yet.";
      return;
    }

    const filtersSlot = document.getElementById("deck-filters-slot");
    if (filtersSlot) {
      filtersSlot.innerHTML = "";
    }

    renderFilters(container, decks);
  } catch (e) {
    container.className = "";
    container.innerHTML = "Failed to load decks.";
    console.error(e);
  }
}

async function loadVideos() {
  const container = document.getElementById("videos");

  try {
    const res = await fetch("videos.json");
    const videos = await res.json();
    const filtersSlot = document.getElementById("video-filters-slot");
    if (filtersSlot) {
      filtersSlot.innerHTML = "";
    }

    renderVideos(container, videos);
  } catch (e) {
    container.className = "";
    container.innerHTML = "Failed to load videos.";
    console.error(e);
  }
}

if (window.location.protocol === "file:") {
  const decksContainer = document.getElementById("decks");
  const videosContainer = document.getElementById("videos");

  if (decksContainer) {
    decksContainer.innerHTML = `
      Local preview cannot load <code>decks.json</code> from <code>file://</code>.
      Open this site through a small local web server instead.
    `;
  }

  if (videosContainer) {
    videosContainer.innerHTML = `
      Local preview cannot load <code>videos.json</code> from <code>file://</code>.
      Open this site through a small local web server instead.
    `;
  }
} else {
  loadDecks();
  loadVideos();
}
