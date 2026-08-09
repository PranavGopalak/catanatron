"use strict";

const styles = require("./immersive.css");
const {
  RESOURCE_ORDER,
  RESOURCE_UI,
  bindPlayersToNativeIdentities,
  count,
  integratedColumnWidth,
  knowledgeFor,
  normalizePlayerName,
  playerDigest,
} = require("./immersive-model");

const STYLE_ID = "catanatron-immersive-styles";
const PANEL_ID = "catanatron-native-intelligence";
const COMPACT_BUTTON_ID = "catanatron-intelligence-button";
const ROW_SELECTOR = '[class*="playerRow"][data-player-color]';

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
  const node = row.querySelector('[data-player-username], [class*="username"], [class*="playerName"], [class*="player-name"]');
  return node?.textContent?.trim() || "";
}

function nativePlayerRows() {
  const game = document.querySelector("#ui-game");
  if (!game) return [];
  const opponents = document.querySelector('[data-player-information-container="true"]');
  const rows = [];
  const seen = new Set();
  for (const row of opponents?.querySelectorAll(ROW_SELECTOR) || []) {
    seen.add(row);
    rows.push(row);
  }
  for (const row of game.querySelectorAll(ROW_SELECTOR)) {
    if (seen.has(row)) continue;
    seen.add(row);
    rows.push(row);
  }
  return rows;
}

function rangeMarkup(player) {
  return RESOURCE_ORDER.map((resource) => {
    const config = RESOURCE_UI[resource];
    const knowledge = knowledgeFor(player, resource);
    const value = knowledge.max === null
      ? knowledge.min > 0 ? `${knowledge.min}+` : "?"
      : knowledge.min === knowledge.max ? knowledge.min : `${knowledge.min}–${knowledge.max}`;
    const likelihood = knowledge.presencePct == null ? null : `${knowledge.presencePct}%`;
    const likelihoodDetail = likelihood == null
      ? knowledge.state === "unknown" ? "not calculated until the hand is observed" : "possible, but no defensible percentage yet"
      : `${likelihood} of feasible hands contain ${config.label.toLowerCase()}`;
    const title = knowledge.state === "impossible"
      ? `${config.label}: cannot have any`
      : knowledge.state === "unknown"
        ? `${config.label}: hand total not observed yet`
      : knowledge.state === "possible"
        ? `${config.label}: possible, none guaranteed`
        : `${config.label}: at least ${knowledge.min} guaranteed`;
    const fullTitle = `${title}; ${likelihoodDetail}`;
    return `<div class="catanatron-range-chip is-${knowledge.state}" title="${escapeHtml(fullTitle)}" aria-label="${escapeHtml(fullTitle)}"><strong>${value}</strong><span>${likelihood || (knowledge.state === "unknown" ? "pending" : "possible")}</span></div>`;
  }).join("");
}

function devDeckMarkup(devDeck) {
  const deck = devDeck || { bought: 0, playedTotal: 0, hiddenInHands: 0, rows: [] };
  return `
    <section class="catanatron-native-section">
      <div class="catanatron-section-title">Development cards <span>${count(deck.hiddenInHands)} unplayed</span></div>
      <div class="catanatron-dev-list">
        ${(deck.rows || []).map((row) => `<div class="catanatron-dev-row ${row.exhausted ? "is-exhausted" : ""}"><span>${escapeHtml(row.name)}</span><strong>${count(row.played)} / ${row.limit == null ? "?" : count(row.limit)} played</strong></div>`).join("")}
      </div>
    </section>`;
}

function playerIntelMarkup(players, winWatch) {
  const risks = winWatch || [];
  const observedPlayers = players.filter((player) => player.handTotal !== null && player.handTotal !== undefined);
  const guaranteedTotal = observedPlayers.reduce((sum, player) => sum + count(player.knownCards), 0);
  const cardTotal = observedPlayers.reduce((sum, player) => sum + count(player.handTotal), 0);
  return `
    <section class="catanatron-native-section catanatron-hands-section">
      <div class="catanatron-section-title">Resource knowledge <span>${guaranteedTotal} of ${cardTotal || "?"} guaranteed</span></div>
      <div class="catanatron-resource-note">Percent shows feasible hands containing each resource</div>
      <div class="catanatron-resource-legend" aria-hidden="true">${RESOURCE_ORDER.map((resource) => `<span>${RESOURCE_UI[resource].mark}</span>`).join("")}</div>
      <div class="catanatron-player-list">
      ${players.length ? players.map((player) => {
        const observed = player.handTotal !== null && player.handTotal !== undefined;
        const total = observed ? count(player.handTotal) : null;
        const known = count(player.knownCards);
        const unresolved = observed ? count(player.unresolvedCards ?? total - known) : null;
        const risk = risks.find((item) => Number(item.color) === Number(player.color))
          || risks.find((item) => normalizePlayerName(item.player) === normalizePlayerName(player.trackerName || player.name));
        const resourceReady = count(risk?.buildPoints);
        const actionableRisk = resourceReady > 0 || ["danger", "watch", "close"].includes(risk?.status);
        return `<article class="catanatron-intel-player${player.exactHand ? " is-exact" : ""}${player.identityPending ? " is-syncing" : ""}">
          <div class="catanatron-intel-head"><span class="catanatron-player-color color-${Number(player.color || 0)}"></span><span class="catanatron-intel-name">${escapeHtml(player.displayName || player.name || "Unknown player")}</span><span class="catanatron-intel-total">${observed ? `${total} card${total === 1 ? "" : "s"}` : "Hand pending"}</span></div>
          <div class="catanatron-range-grid">${rangeMarkup(player)}</div>
          <div class="catanatron-intel-meta"><span>${player.identityPending ? "Waiting for a verified tracker identity" : player.exactHand ? "Exact hand" : observed ? `<strong>${known}</strong> guaranteed · <strong>${unresolved}</strong> unresolved` : "Waiting for a hand snapshot"}</span>${player.estimateConflict ? `<span class="catanatron-range-conflict">Ranges widened</span>` : ""}${actionableRisk ? `<span class="catanatron-risk-pill catanatron-risk-${escapeHtml(risk.status)}">${resourceReady ? `${resourceReady} VP resource ready` : "Point race watch"}</span>` : ""}</div>
        </article>`;
      }).join("") : `<p class="catanatron-empty">Waiting for the first complete game state.</p>`}
      </div>
    </section>`;
}

function watchlistMarkup(tradeWatch, players) {
  if (!tradeWatch || tradeWatch.status === "stable") return "";
  let line = String(tradeWatch.line || "");
  for (const player of players || []) {
    if (!player.trackerName || !player.displayName || player.trackerName === player.displayName) continue;
    line = line.replaceAll(player.trackerName, player.displayName);
  }
  return `<section class="catanatron-native-section catanatron-watchlist">
    <div class="catanatron-section-title">Watchlist <span class="catanatron-risk-${escapeHtml(tradeWatch.status)}">${escapeHtml(tradeWatch.status)}</span></div>
    <div class="catanatron-watch-item">${escapeHtml(line)}</div>
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
    this.onResize = () => this.schedule();
    window.addEventListener("resize", this.onResize, { passive: true });
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
    const playerInformation = document.querySelector('[data-player-information-container="true"]');
    const playerCount = playerInformation?.querySelectorAll(ROW_SELECTOR).length || 0;
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
  }

  orderedPlayers() {
    const players = this.tracker.players || [];
    const identities = nativePlayerRows().map((row) => ({
      color: row.dataset.playerColor,
      name: playerNameFromRow(row),
    }));
    return bindPlayersToNativeIdentities(players, identities);
  }

  renderPanel(panel) {
    const capture = this.tracker.capture || {};
    const enabled = Boolean(this.state.trackingEnabled);
    const status = !enabled ? "Counting off" : capture.lastError ? "Capture error" : capture.attached ? "Live · local only" : "Connecting locally";
    const players = this.orderedPlayers();
    const digest = JSON.stringify({
      enabled,
      status,
      mode: this.surfaceMode,
      players: players.map(playerDigest),
      conflicts: players.map((player) => count(player.estimateConflict)),
      winWatch: this.tracker.winWatch,
      devDeck: this.tracker.devDeck,
      tradeWatch: this.tracker.tradeWatch,
    });
    if (panel.dataset.digest === digest) return;
    panel.dataset.digest = digest;
    panel.innerHTML = `
      <header class="catanatron-native-header">
        <span class="catanatron-native-mark">C</span>
        <div class="catanatron-native-title"><strong>Catanatron</strong><span>${escapeHtml(status)}</span></div>
        <span class="catanatron-live-dot ${!enabled ? "is-off" : capture.lastError ? "is-error" : ""}"></span>
        ${enabled ? `<button class="catanatron-header-action" type="button" data-catanatron-action="reset-tracker" title="Reset game ledger">Reset</button>` : ""}
        ${this.surfaceMode === "compact" ? `<button class="catanatron-native-close" type="button" data-catanatron-action="close-intelligence" aria-label="Close card intelligence">×</button>` : ""}
      </header>
      ${enabled ? "" : `<div class="catanatron-native-actions"><button class="catanatron-native-button" type="button" data-catanatron-action="toggle-tracking">Enable counting</button></div>`}
      ${playerIntelMarkup(players, this.tracker.winWatch)}
      ${watchlistMarkup(this.tracker.tradeWatch, players)}
      ${devDeckMarkup(this.tracker.devDeck)}
      `;
  }

  removeGameUI() {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(COMPACT_BUTTON_ID)?.remove();
    this.restoreAds();
    this.surfaceMode = null;
    this.popoverOpen = false;
  }

  destroy() {
    this.destroyed = true;
    this.observer.disconnect();
    window.removeEventListener("resize", this.onResize);
    clearInterval(this.interval);
    this.removeGameUI();
    this.setActive(false);
  }
}

module.exports = { ImmersiveGameUI, gameIsActive };
