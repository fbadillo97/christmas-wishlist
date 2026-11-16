(() => {
  "use strict";

  const baseState = {
    turn: 3,
    activePlayer: 2,
    wrapped: 13,
    gifts: [
      { id: 1, name: "Cozy mystery box", owner: "Player 01", art: "🎁", color: "#f4e4d0", moves: 2, locked: false },
      { id: 2, name: "The very soft blanket", owner: "Player 07", art: "🧣", color: "#e7ece0", moves: 3, locked: false },
      { id: 3, name: "Snack attack", owner: "Player 02", art: "🍫", color: "#f0e4d9", moves: 1, locked: false },
      { id: 4, name: "Tiny desk garden", owner: "Player 05", art: "🪴", color: "#e5eee6", moves: 0, locked: false },
      { id: 5, name: "Mystery mug", owner: "Player 03", art: "☕", color: "#eee8de", moves: 3, locked: true }
    ]
  };

  const copyBaseState = () => ({ ...baseState, gifts: baseState.gifts.map((gift) => ({ ...gift })) });
  let state = copyBaseState();
  let countdownTimer = null;
  let countdownRemaining = 20;
  let photoObjectUrl = null;
  let lastFocusedElement = null;
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") === "tv" ? "tv" : "host";
  const layout = view === "tv" && params.get("layout") === "split" ? "split" : "stacked";
  document.body.dataset.view = view;
  document.body.dataset.layout = layout;

  const byId = (id) => document.getElementById(id);
  const giftGrid = byId("gift-grid");
  const overlay = byId("moment-overlay");
  const hostLink = byId("host-view-link");
  const tvLink = byId("tv-view-link");
  const tvSplitLink = byId("tv-split-link");

  hostLink.removeAttribute("aria-current");
  tvLink.removeAttribute("aria-current");
  tvSplitLink.removeAttribute("aria-current");
  if (view === "host") {
    hostLink.setAttribute("aria-current", "page");
  } else if (layout === "split") {
    tvSplitLink.setAttribute("aria-current", "page");
  } else {
    tvLink.setAttribute("aria-current", "page");
  }

  function renderGifts() {
    giftGrid.replaceChildren();
    state.gifts.forEach((gift) => {
      const card = document.createElement("article");
      card.className = `gift-card${gift.locked ? " is-locked" : ""}`;
      const art = document.createElement("div");
      art.className = "gift-art";
      art.style.setProperty("--art-bg", gift.color);
      art.setAttribute("aria-hidden", "true");
      art.textContent = gift.art;

      const info = document.createElement("div");
      info.className = "gift-info";
      const name = document.createElement("strong");
      name.className = "gift-name";
      name.textContent = `Gift ${String(gift.id).padStart(2, "0")} · ${gift.name}`;
      const owner = document.createElement("span");
      owner.className = "gift-owner";
      owner.textContent = `WITH ${gift.owner.toUpperCase()}`;
      const stat = document.createElement("div");
      stat.className = "gift-stat";
      const moves = document.createElement("span");
      moves.textContent = gift.moves === 1 ? "1 HAND CHANGE" : `${gift.moves} HAND CHANGES`;
      stat.append(moves);
      if (gift.locked) {
        const lock = document.createElement("span");
        lock.className = "lock-chip";
        lock.textContent = "🔒 LOCKED";
        stat.append(lock);
      }
      info.append(name, owner, stat);
      card.append(art, info);
      giftGrid.append(card);
    });
    byId("gift-count").textContent = String(state.gifts.length);
    byId("wrapped-number").textContent = `${state.wrapped} gifts`;
    const isScrollable = state.gifts.length > 6;
    giftGrid.classList.toggle("is-scrollable", isScrollable);
    if (!isScrollable) giftGrid.scrollTop = 0;
  }

  function renderPlayer() {
    const playerNo = String(state.activePlayer + 1).padStart(2, "0");
    byId("turn-number").textContent = String(state.turn).padStart(2, "0");
    byId("current-player").textContent = `Player ${playerNo}`;
    byId("player-token").textContent = `P${state.activePlayer + 1}`;
  }

  function showMoment({ kicker, title, detail, emoji = "🎁" }) {
    lastFocusedElement = document.activeElement;
    byId("moment-kicker").textContent = kicker;
    byId("moment-title").textContent = title;
    byId("moment-detail").textContent = detail;
    byId("moment-emoji").textContent = emoji;
    overlay.hidden = false;
    byId("close-moment").focus();
  }

  function closeMoment() {
    overlay.hidden = true;
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
  }

  function stopCountdown() {
    if (countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function startCountdown() {
    stopCountdown();
    countdownRemaining = 20;
    byId("countdown-label").textContent = "20 seconds · cancel";
    byId("countdown-help").textContent = "Just for fun · no penalty";
    countdownTimer = window.setInterval(() => {
      countdownRemaining -= 1;
      if (countdownRemaining <= 0) {
        stopCountdown();
        byId("countdown-label").textContent = "Start playful countdown";
        byId("countdown-help").textContent = "No penalty when time runs out";
        byId("photo-message").textContent = "Time's up! The game carries on.";
        window.setTimeout(() => { byId("photo-message").textContent = ""; }, 2400);
        return;
      }
      byId("countdown-label").textContent = `${countdownRemaining} seconds · cancel`;
    }, 1000);
  }

  byId("reveal-player").addEventListener("click", () => {
    state.activePlayer = (state.activePlayer + 1) % 18;
    state.turn = Math.min(state.turn + 1, 18);
    renderPlayer();
    showMoment({
      kicker: "THE NEXT PERSON TO PLAY",
      title: `Player ${String(state.activePlayer + 1).padStart(2, "0")}!`,
      detail: "A fresh turn begins. The rest of the order stays secret.",
      emoji: ["🎄", "🎁", "⭐", "🧦"][state.activePlayer % 4]
    });
  });

  byId("show-steal").addEventListener("click", () => {
    showMoment({
      kicker: "A GIFT CHANGED HANDS",
      title: "A bold move!",
      detail: "Player 07 took Gift 02 from Player 01. This is a visual sample only.",
      emoji: "🎁"
    });
  });

  byId("start-countdown").addEventListener("click", () => {
    if (countdownTimer !== null) {
      stopCountdown();
      byId("countdown-label").textContent = "Start playful countdown";
      byId("countdown-help").textContent = "No penalty when time runs out";
    } else {
      startCountdown();
    }
  });

  byId("gift-photo").addEventListener("change", (event) => {
    const file = event.currentTarget.files && event.currentTarget.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      byId("photo-message").textContent = "Choose an image file to preview.";
      return;
    }
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = URL.createObjectURL(file);
    const firstArt = giftGrid.querySelector(".gift-art");
    if (firstArt) {
      firstArt.textContent = "";
      const image = document.createElement("img");
      image.src = photoObjectUrl;
      image.alt = "Temporary gift photo preview";
      image.decoding = "async";
      firstArt.append(image);
    }
    byId("photo-message").textContent = "Temporary preview loaded. It is not uploaded and clears when you reset or leave.";
  });

  byId("show-awards").addEventListener("click", () => {
    byId("game-board").hidden = true;
    byId("awards-preview").hidden = false;
  });

  byId("back-to-board").addEventListener("click", () => {
    byId("awards-preview").hidden = true;
    byId("game-board").hidden = false;
    byId("show-awards").focus();
  });

  byId("close-moment").addEventListener("click", closeMoment);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMoment();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeMoment();
  });

  byId("reset-demo").addEventListener("click", () => {
    stopCountdown();
    countdownRemaining = 20;
    if (photoObjectUrl) {
      URL.revokeObjectURL(photoObjectUrl);
      photoObjectUrl = null;
    }
    byId("gift-photo").value = "";
    byId("photo-message").textContent = "";
    byId("countdown-label").textContent = "Start playful countdown";
    byId("countdown-help").textContent = "No penalty when time runs out";
    byId("awards-preview").hidden = true;
    byId("game-board").hidden = false;
    overlay.hidden = true;
    state = copyBaseState();
    renderPlayer();
    renderGifts();
  });

  renderPlayer();
  renderGifts();
})();
