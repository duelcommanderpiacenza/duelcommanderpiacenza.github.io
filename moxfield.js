async function loadDecks() {
  const container = document.getElementById("decks");

  try {
    const res = await fetch("decks.json");
    const decks = await res.json();

    container.innerHTML = "";

    decks.forEach(deck => {
      const div = document.createElement("div");
      div.className = "deck";

      div.innerHTML = `
        <div><strong>${deck.name}</strong></div>
        <div>Commander: ${deck.commander}</div>
        <a href="${deck.url}" target="_blank">View on Moxfield</a>
      `;

      container.appendChild(div);
    });

  } catch (e) {
    container.innerHTML = "Failed to load decks.";
    console.error(e);
  }
}

loadDecks();