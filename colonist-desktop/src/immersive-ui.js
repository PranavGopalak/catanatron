"use strict";

const styles = require("./immersive.css");
const {
  RESOURCE_ORDER,
  RESOURCE_UI,
  buildHandGroups,
  count,
  integratedColumnWidth,
  knowledgeFor,
  matchPlayer,
  normalizePlayerName,
  playerDigest,
} = require("./immersive-model");

const STYLE_ID = "catanatron-immersive-styles";
const PANEL_ID = "catanatron-native-intelligence";
const COMPACT_BUTTON_ID = "catanatron-intelligence-button";
const ROW_SELECTOR = '[class*="playerRow"][data-player-color]';
const RESOURCE_CARD_SELECTOR = '[data-resource-card="true"]';

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function gameIsActive() {
  const game = document.querySelector("#ui-game");
  return Boolean(game && document.querySelector('[data-player-information-container="true"]') && document.querySelector(ROW_SELECTOR));
}

function playerNameFromRow(row) {
  const node = row.querySelector('[class*="username"]');
  return node?.textContent?.trim() || "";
}

function cardImageSource(resource) {
  const cardEnum = RESOURCE_UI[resource]?.enum;
  if (!cardEnum) return "";
  return document.querySelector(`[data-card-enum="${cardEnum}"] img`)?.src || "";
}

function cardBackSource(original) {
  return Array.from(original?.querySelectorAll("img") || [])
    .find((image) => !image.closest(".catanatron-hand-strip"))?.src || "";
}

function handGroupMarkup(group, resourceImages, backImage) {
  if (group.kind === "unknown") {
    return `<span class="catanatron-hand-card is-unknown" title="${group.count} unresolved resource ${group.count === 1 ? "card" : "cards"}">${backImage ? `<img src="${escapeHtml(backImage)}" alt="">` : "?"}<strong class="catanatron-card-count">${group.count}</strong></span>`;
  }
  const config = RESOURCE_UI[group.resource];
  const image = resourceImages[group.resource];
  return `<span class="catanatron-hand-card is-resource is-${group.resource}" data-mark="${config.mark}" title="${group.count} guaranteed ${config.label} ${group.count === 1 ? "card" : "cards"}">${image ? `<img src="${escapeHtml(image)}" alt="">` : config.mark}<strong class="catanatron-card-count">${group.count}</strong></span>`;
}

function rangeMarkup(player) {
  return RESOURCE_ORDER.map((resource) => {
    const config = RESOURCE_UI[resource];
    const knowledge = knowledgeFor(player, resource);
    const value = knowledge.min === knowledge.max ? knowledge.min : `${knowledge.min}…${knowledge.max}`;
    const title = knowledge.state === "impossible"
      ? `${config.label}: cannot have any`
      : knowledge.state === "possible"
        ? `${config.label}: possible, none guaranteed`
        : `${config.label}: at least ${knowledge.min} guaranteed`;
    return `<div class="catanatron-range-chip is-${knowledge.state}" title="${escapeHtml(title)}"><span>${config.mark}</span><strong>${value}</strong></div>`;
  }).join("");
}

function devDeckMarkup(devDeck) {
  const deck = devDeck || { bought: 0, playedTotal: 0, hiddenInHands: 0, rows: [] };
  return `
    <section class="catanatron-native-section">
      <div class="catanatron-section-title">Development deck <span>${count(deck.hiddenInHands)} hidden</span></div>
      <div class="catanatron-dev-summary">
        <div><strong>${count(deck.bought)}</strong><span>bought</span></div>
        <div><strong>${count(deck.playedTotal)}</strong><span>played</span></div>
        <div><strong>${count(deck.hiddenInHands)}</strong><span>held</span></div>
      </div>
      ${(deck.rows || []).map((row) => `<div class="catanatron-dev-row ${row.exhausted ? "is-exhausted" : ""}"><span>${escapeHtml(row.name)}</span><strong>${count(row.played)} / ${row.limit == null ? "?" : count(row.limit)}</strong></div>`).join("")}
    </section>`;
}

function playerIntelMarkup(players, winWatch) {
  const riskByPlayer = new Map((winWatch || []).map((item) => [`${Number(item.color)}:${normalizePlayerName(item.player)}`, item]));
  return `
    <section class="catanatron-native-section">
      <div class="catanatron-section-title">Hands at a glance <span>${players.length} players</span></div>
      ${players.length ? players.map((player) => {
        const total = count(player.handTotal ?? player.knownCards);
        const known = count(player.knownCards);
        const unresolved = count(player.unresolvedCards ?? total - known);
        const dev = count(player.developmentCards?.total ?? player.devCardsBought);
        const points = count(player.score?.visiblePoints);
        const risk = riskByPlayer.get(`${Number(player.color)}:${normalizePlayerName(player.name)}`);
        const impossible = RESOURCE_ORDER.filter((resource) => knowledgeFor(player, resource).max === 0).map((resource) => RESOURCE_UI[resource].mark);
        return `<article class="catanatron-intel-player">
          <div class="catanatron-intel-head"><span class="catanatron-player-color color-${Number(player.color || 0)}"></span><span class="catanatron-intel-name">${escapeHtml(player.name || "Unknown player")}</span><span class="catanatron-intel-total">${total} cards</span></div>
          <div class="catanatron-range-grid">${rangeMarkup(player)}</div>
          <div class="catanatron-intel-meta"><strong>${known}</strong> guaranteed, <strong>${unresolved}</strong> unresolved, <strong>${dev}</strong> dev, <strong>${points}</strong> VP${impossible.length ? `<br>Cannot have: <strong>${impossible.join(", ")}</strong>` : ""}${risk ? `<br><span class="catanatron-risk-${escapeHtml(risk.status)}">${escapeHtml(risk.status)}: ${count(risk.buildPoints)} build point${count(risk.buildPoints) === 1 ? "" : "s"} available</span>` : ""}</div>
        </article>`;
      }).join("") : `<p class="catanatron-empty">Waiting for the first complete game state. Colonist’s own card backs remain visible until player data arrives.</p>`}
    </section>`;
}

function eventsMarkup(events, tradeWatch) {
  return `
    ${tradeWatch ? `<section class="catanatron-native-section"><div class="catanatron-section-title">Trade risk <span class="catanatron-risk-${escapeHtml(tradeWatch.status)}">${escapeHtml(tradeWatch.status)}</span></div><div class="catanatron-event">${escapeHtml(tradeWatch.line)}</div></section>` : ""}
    <section class="catanatron-native-section">
      <div class="catanatron-section-title">Recent deductions</div>
      ${(events || []).length ? events.slice(0, 4).map((event) => `<div class="catanatron-event">${escapeHtml(event.line || event.type || "Game update")}</div>`).join("") : `<p class="catanatron-empty">Live deductions will appear here as public game events are decoded.</p>`}
    </section>`;
}

class ImmersiveGameUI {
  constructor({ onToggleTracking, onResetTracker, onActiveChange } = {}) {
    this.tracker = { players: [], counts: {}, capture: {} };
    this.state = { trackingEnabled: false };
    this.onToggleTracking = onToggleTracking;
    this.onResetTracker = onResetTracker;
    this.onActiveChange = onActiveChange;
    this.active = false;
    this.surfaceMode = null;
    this.popoverOpen = false;
    this.trimmedNodes = new Map();
    this.scheduled = false;
    this.destroyed = false;
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    this.interval = setInterval(() => this.schedule(), 750);
    this.schedule();
  }

  update(tracker, state) {
    this.tracker = tracker || this.tracker;
    this.state = state || this.state;
    this.schedule();
  }

  schedule() {
    if (this.destroyed || this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.render();
    });
  }

  ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = styles;
    document.head.appendChild(style);
  }

  rememberAndSetDisplay(node, value) {
    if (!node) return;
    if (!this.trimmedNodes.has(node)) {
      this.trimmedNodes.set(node, {
        value: node.style.getPropertyValue("display"),
        priority: node.style.getPropertyPriority("display"),
        ariaHidden: node.getAttribute("aria-hidden"),
      });
    }
    node.style.setProperty("display", value, "important");
    node.setAttribute("aria-hidden", "true");
  }

  ensurePanelElement() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = PANEL_ID;
      panel.setAttribute("role", "complementary");
      panel.setAttribute("aria-label", "Catanatron live game intelligence");
      panel.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-catanatron-action]");
        if (!button) return;
        button.disabled = true;
        try {
          if (button.dataset.catanatronAction === "close-intelligence") {
            this.popoverOpen = false;
            panel.hidden = true;
          }
          if (button.dataset.catanatronAction === "toggle-tracking") await this.onToggleTracking?.();
          if (button.dataset.catanatronAction === "reset-tracker") await this.onResetTracker?.();
        } finally {
          button.disabled = false;
        }
      });
    }
    return panel;
  }

  switchSurfaceMode(mode) {
    if (this.surfaceMode === mode) return;
    this.restoreAds();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(COMPACT_BUTTON_ID)?.remove();
    this.popoverOpen = false;
    this.surfaceMode = mode;
  }

  ensureCompactButton(game, panel) {
    let button = document.getElementById(COMPACT_BUTTON_ID);
    const settingsImage = game.querySelector('img[src*="icon_settings"]');
    const settingsControl = settingsImage?.closest('button, [role="button"]') || settingsImage;
    if (!button) {
      button = document.createElement("button");
      button.id = COMPACT_BUTTON_ID;
      button.type = "button";
      button.textContent = "C";
      button.title = "Open card intelligence";
      button.setAttribute("aria-label", "Open Catanatron card intelligence");
      button.addEventListener("click", () => {
        this.popoverOpen = !this.popoverOpen;
        panel.hidden = !this.popoverOpen;
        button.setAttribute("aria-expanded", String(this.popoverOpen));
      });
    }
    if (button.parentElement !== document.body) document.body.appendChild(button);
    button.setAttribute("aria-expanded", String(this.popoverOpen));
    const settingsRect = settingsControl?.getBoundingClientRect();
    const buttonLeft = Math.max(8, (settingsRect?.right || 40) + 7);
    const buttonTop = Math.max(8, settingsRect?.top || 38);
    button.style.left = `${Math.min(buttonLeft, window.innerWidth - 39)}px`;
    button.style.top = `${Math.min(buttonTop, window.innerHeight - 39)}px`;
    const anchorRect = button.getBoundingClientRect();
    panel.style.setProperty("--cat-popover-left", `${Math.min(Math.max(8, anchorRect.right + 8), Math.max(8, window.innerWidth - 308))}px`);
    panel.style.setProperty("--cat-popover-top", `${Math.min(Math.max(8, anchorRect.top), Math.max(8, window.innerHeight - 520))}px`);
  }

  ensureIntelligenceSurface() {
    const game = document.querySelector("#ui-game");
    if (!game) return null;
    const playerCount = document.querySelectorAll(ROW_SELECTOR).length;
    const columnWidth = integratedColumnWidth(window.innerWidth, playerCount);
    const mode = columnWidth ? "integrated" : "compact";
    this.switchSurfaceMode(mode);
    document.documentElement.classList.add("catanatron-game-immersive");
    const panel = this.ensurePanelElement();
    panel.className = mode === "integrated" ? "is-integrated" : "is-popover";
    if (mode === "integrated") {
      document.documentElement.classList.add("catanatron-game-integrated");
      document.documentElement.style.setProperty("--cat-integrated-width", `${columnWidth}px`);
      this.rememberAndSetDisplay(document.getElementById("in_game_ad_left"), "none");
      this.rememberAndSetDisplay(document.getElementById("in_game_ad_right"), "none");
      if (panel.parentElement !== document.body) document.body.appendChild(panel);
      panel.hidden = false;
      document.getElementById(COMPACT_BUTTON_ID)?.remove();
    } else {
      if (panel.parentElement !== document.body) document.body.appendChild(panel);
      panel.hidden = !this.popoverOpen;
      this.ensureCompactButton(game, panel);
    }
    const nativeReference = document.querySelector('[data-player-information-container="true"]');
    if (nativeReference) {
      const computed = getComputedStyle(nativeReference);
      panel.style.setProperty("--cat-native-font", computed.fontFamily || "inherit");
    }
    return panel;
  }

  restoreAds() {
    for (const [node, original] of this.trimmedNodes) {
      if (original.value) node.style.setProperty("display", original.value, original.priority);
      else node.style.removeProperty("display");
      if (original.ariaHidden == null) node.removeAttribute("aria-hidden");
      else node.setAttribute("aria-hidden", original.ariaHidden);
    }
    this.trimmedNodes.clear();
    document.documentElement.classList.remove("catanatron-game-immersive");
    document.documentElement.classList.remove("catanatron-game-integrated");
    document.documentElement.style.removeProperty("--cat-integrated-width");
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    document.getElementById("catanatron-colonist-hud")?.setAttribute("data-immersive-active", String(active));
    this.onActiveChange?.(active);
  }

  render() {
    const active = gameIsActive();
    this.setActive(active);
    if (!active) {
      this.removeGameUI();
      return;
    }
    this.ensureStyles();
    const panel = this.ensureIntelligenceSurface();
    if (!panel) return;
    this.renderPanel(panel);
    this.renderHands();
  }

  renderPanel(panel) {
    const capture = this.tracker.capture || {};
    const enabled = Boolean(this.state.trackingEnabled);
    const status = !enabled ? "Counting off" : capture.lastError ? "Capture error" : capture.attached ? `${count(this.tracker.counts?.frames)} frames` : "Starting capture";
    const digest = JSON.stringify({ enabled, status, mode: this.surfaceMode, tracker: this.tracker });
    if (panel.dataset.digest === digest) return;
    panel.dataset.digest = digest;
    panel.innerHTML = `
      <header class="catanatron-native-header">
        <span class="catanatron-native-mark">C</span>
        <div class="catanatron-native-title"><strong>Card tracker</strong><span>${escapeHtml(status)} · local only</span></div>
        <span class="catanatron-live-dot ${!enabled ? "is-off" : capture.lastError ? "is-error" : ""}"></span>
        ${this.surfaceMode === "compact" ? `<button class="catanatron-native-close" type="button" data-catanatron-action="close-intelligence" aria-label="Close card intelligence">×</button>` : ""}
      </header>
      <div class="catanatron-native-actions">
        ${enabled ? `<button class="catanatron-native-button secondary" type="button" data-catanatron-action="reset-tracker">New game</button>` : `<button class="catanatron-native-button" type="button" data-catanatron-action="toggle-tracking">Enable counting</button>`}
      </div>
      ${playerIntelMarkup(this.tracker.players || [], this.tracker.winWatch)}
      ${devDeckMarkup(this.tracker.devDeck)}
      ${eventsMarkup(this.tracker.recentEvents, this.tracker.tradeWatch)}`;
  }

  renderHands() {
    const players = this.tracker.players || [];
    const resourceImages = Object.fromEntries(RESOURCE_ORDER.map((resource) => [resource, cardImageSource(resource)]));
    const liveRows = new Set(document.querySelectorAll(ROW_SELECTOR));
    for (const strip of document.querySelectorAll(".catanatron-hand-strip")) {
      if (!liveRows.has(strip.closest(ROW_SELECTOR))) strip.remove();
    }
    for (const row of liveRows) {
      const original = row.querySelector(RESOURCE_CARD_SELECTOR);
      if (!original) continue;
      const player = matchPlayer(players, row.dataset.playerColor, playerNameFromRow(row));
      let strip = row.querySelector(":scope .catanatron-hand-strip");
      if (!player) {
        original.classList.remove("catanatron-original-resource-card");
        strip?.remove();
        continue;
      }
      const backImage = cardBackSource(original);
      original.classList.add("catanatron-original-resource-card");
      if (!strip) {
        strip = document.createElement("div");
        strip.className = "catanatron-hand-strip";
        strip.setAttribute("aria-label", `${player.name || "Player"} guaranteed resource cards`);
        original.appendChild(strip);
      }
      const digest = `${playerDigest(player)}:${Object.values(resourceImages).join("|")}:${backImage}`;
      if (strip.dataset.digest === digest) continue;
      strip.dataset.digest = digest;
      const groups = buildHandGroups(player);
      strip.innerHTML = groups.length
        ? groups.map((group) => handGroupMarkup(group, resourceImages, backImage)).join("")
        : `<span class="catanatron-hand-zero">0 cards</span>`;
    }
  }

  removeGameUI() {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(COMPACT_BUTTON_ID)?.remove();
    for (const original of document.querySelectorAll(".catanatron-original-resource-card")) original.classList.remove("catanatron-original-resource-card");
    for (const strip of document.querySelectorAll(".catanatron-hand-strip")) strip.remove();
    this.restoreAds();
    this.surfaceMode = null;
    this.popoverOpen = false;
  }

  destroy() {
    this.destroyed = true;
    this.observer.disconnect();
    clearInterval(this.interval);
    this.removeGameUI();
    this.setActive(false);
  }
}

module.exports = { ImmersiveGameUI, gameIsActive };
