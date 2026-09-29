// Keyboard-style emoji picker for the admin Badge form: one compact trigger
// button (the chosen emoji + "Scegli") opening a floating panel with
// category tabs over a scrollable grid, like a phone keyboard's picker.
// The value lives in a plain hidden <input> (the form reads it like any
// other field). A small text box at the bottom accepts any other emoji
// typed or pasted (e.g. Windows' Win + . panel), so nothing is out of
// reach even if it isn't in the grid — and a badge saved with an emoji
// outside the grid still shows as selected when edited.

// Space-separated rather than arrays, to keep the list compact. The first
// category is the curated set the old fixed swatch list offered.
const CATEGORIES = [
  { icon: "🏆", label: "Badge", emoji: "🏆 🥇 🥈 🥉 ⭐ 🔥 💀 🎯 🛡️ ⚔️ 🐉 🎲 👑 💎 🚀 🧠 💪 🍀 ⚡ 🦄 🐌 💍 🧪 🎁" },
  {
    icon: "😀",
    label: "Faccine",
    emoji:
      "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾",
  },
  {
    icon: "👍",
    label: "Persone e gesti",
    emoji:
      "👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🦵 🦶 👂 👃 🧠 👀 👁️ 👅 👄 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🧙 🧚 🧛 🧜 🧝 🧞 🧟 🦸 🦹 🥷 🤴 👸 🤵 👰 🎅 🤶 🕵️ 💂 👷 👮 🧑‍🚀 🧑‍🎤 🧑‍🍳 🧑‍🔬 🧑‍💻 🏃 🚶 💃 🕺 🧘 🏋️ 🤺",
  },
  {
    icon: "🐶",
    label: "Animali e natura",
    emoji:
      "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🦏 🐪 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦦 🦥 🐁 🐀 🐿️ 🦔 🐉 🐲 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🍄 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌙 🌎 🪐 💫 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ 🌩️ ❄️ ☃️ ⛄ 🌬️ 💨 💧 💦 🌊",
  },
  {
    icon: "🍕",
    label: "Cibo e bevande",
    emoji:
      "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥠 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊",
  },
  {
    icon: "⚽",
    label: "Attività",
    emoji:
      "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩 🃏 🀄 🎴",
  },
  {
    icon: "🚗",
    label: "Viaggi e luoghi",
    emoji:
      "🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🚜 🛵 🏍️ 🚲 🛴 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁",
  },
  {
    icon: "💡",
    label: "Oggetti",
    emoji:
      "⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🕹️ 💽 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🎙️ ⏰ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ ⚰️ 🏺 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🕳️ 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🧺 🧻 🛁 🧼 🧽 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 🎁 🎈 🎏 🎀 🎊 🎉 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📦 🏷️ 📜 📃 📄 📑 🧾 📊 📈 📉 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓",
  },
  {
    icon: "❤️",
    label: "Simboli",
    emoji:
      "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ☯️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⚛️ ☢️ ☣️ 🆚 💮 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🔱 ⚜️ 🔰 ♻️ ✅ 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🎦 📶 🔣 ℹ️ 🔤 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ 🔀 🔁 🔂 🔄 🎵 🎶 ➕ ➖ ➗ ✖️ ♾️ 💲 ™️ ©️ ®️ 〰️ ➰ ➿ 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🔔 🔕 📣 📢 💬 💭 🗯️ ♠️ ♣️ ♥️ ♦️",
  },
  { icon: "🏁", label: "Bandiere", emoji: "🏁 🚩 🎌 🏴 🏳️ 🏳️‍🌈 🏴‍☠️ 🇮🇹 🇪🇺 🇬🇧 🇺🇸 🇫🇷 🇩🇪 🇪🇸 🇯🇵" },
];

/**
 * @param {{ input: HTMLInputElement, trigger: HTMLButtonElement, panel: HTMLElement }} els
 *   input: the hidden field holding the value; trigger: the button opening
 *   the panel (its .emoji-picker-current child shows the chosen emoji);
 *   panel: the (initially hidden) container the picker is built into.
 * @returns {{ setValue(value: string): void }}
 */
export function initEmojiPicker({ input, trigger, panel }) {
  const current = trigger.querySelector(".emoji-picker-current");

  panel.innerHTML = `
    <div class="emoji-picker-tabs" role="tablist">
      ${CATEGORIES.map(
        (c, i) =>
          `<button type="button" class="emoji-picker-tab" data-section="${i}" title="${c.label}" aria-label="${c.label}">${c.icon}</button>`
      ).join("")}
    </div>
    <div class="emoji-picker-grid">
      ${CATEGORIES.map(
        (c, i) => `
        <div class="emoji-picker-section" data-section="${i}">
          <div class="emoji-picker-section-title">${c.label}</div>
          <div class="emoji-picker-cells">${c.emoji
            .split(/\s+/)
            .filter(Boolean)
            .map((e) => `<button type="button" class="emoji-picker-cell" data-emoji="${e}">${e}</button>`)
            .join("")}</div>
        </div>`
      ).join("")}
    </div>
    <input type="text" class="emoji-picker-custom" placeholder="Oppure incolla un emoji" aria-label="Emoji personalizzato" autocomplete="off">
  `;
  const grid = panel.querySelector(".emoji-picker-grid");
  const custom = panel.querySelector(".emoji-picker-custom");
  const tabs = Array.from(panel.querySelectorAll(".emoji-picker-tab"));
  const sections = Array.from(panel.querySelectorAll(".emoji-picker-section"));

  function setValue(value) {
    input.value = value ?? "";
    current.textContent = input.value || "—";
    panel.querySelectorAll(".emoji-picker-cell.is-selected").forEach((c) => c.classList.remove("is-selected"));
    if (input.value) {
      panel.querySelectorAll(`.emoji-picker-cell[data-emoji="${CSS.escape(input.value)}"]`).forEach((c) => c.classList.add("is-selected"));
    }
  }

  function setActiveTab(index) {
    tabs.forEach((t, i) => t.classList.toggle("is-active", i === index));
  }

  function open() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    custom.value = "";
    // Start on the chosen emoji's own section if it's in the grid, else on
    // the first (the curated badge set).
    const selected = grid.querySelector(".emoji-picker-cell.is-selected");
    // Scrolls the grid only (not the whole page, as scrollIntoView could).
    grid.scrollTop = selected ? selected.offsetTop - grid.clientHeight / 2 : 0;
    updateActiveTabFromScroll();
  }

  function close() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function updateActiveTabFromScroll() {
    const top = grid.scrollTop + 4;
    let index = 0;
    sections.forEach((s, i) => {
      if (s.offsetTop <= top) index = i; // offsetTop is relative to the grid (position: relative)
    });
    setActiveTab(index);
  }

  trigger.addEventListener("click", () => (panel.hidden ? open() : close()));

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      grid.scrollTop = sections[i].offsetTop;
      setActiveTab(i);
    });
  });
  grid.addEventListener("scroll", updateActiveTabFromScroll);

  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".emoji-picker-cell");
    if (!cell) return;
    setValue(cell.dataset.emoji);
    close();
    trigger.focus();
  });

  // Anything typed/pasted becomes the value right away; Enter confirms.
  custom.addEventListener("input", () => {
    const value = custom.value.trim();
    if (value) setValue(value);
  });
  custom.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      close();
      trigger.focus();
    }
  });

  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      close();
      trigger.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !trigger.contains(e.target)) close();
  });

  setValue(input.value);
  return { setValue };
}
