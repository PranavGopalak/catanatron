"use strict";

const styles = require("./immersive.css");
const {
  RESOURCE_ORDER,
  RESOURCE_UI,
  buildHandGroups,
  count,
  knowledgeFor,
  matchPlayer,
  normalizePlayerName,
  playerDigest,
} = require("./immersive-model");

const STYLE_ID = "catanatron-immersive-styles";
const RAIL_ID = "catanatron-intelligence-rail";
const ROW_SELECTOR = '[class*="playerRow"][data-player-color]';
const RESOURCE_CARD_SELECTOR = '[data-resource-card="true"]';
const FALLBACK_DOCK_ID = "catanatron-intelligence-dock";

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
  return original?.querySelector("img")?.src || "";
}

function handGroupMarkup(group, resourceImages, backImage) {
  if (group.kind === "unknown") {
    return `<span class="catanatron-hand-card is-unknown" title="${group.count} unresolved resource ${group.count === 1 ? "card" : "cards"}">${backImage ? `<img src="${escapeHtml(backImage)}" alt="">` : "?"}<strong class="catanatron-card-count">${group.count}</strong></span>`;
  }
  const config = RESOURCE_UI[group.resource];
  const image = resourceImages[group.resource];
  return `<span class="catanatron-hand-card is-resource is-${group.resource}" data-mark="${config.mark}" title="${group.count} guaranteed ${config.label}">${image ? `<img src="${escapeHtml(image)}" alt="">` : config.mark}<strong class="catanatron-card-count">${group.count}</strong></span>`;
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
    <section class="catanatron-rail-section">
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
    <section class="catanatron-rail-section">
      <div class="catanatron-section-title">Player intelligence <span>${players.length} players</span></div>
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
    ${tradeWatch ? `<section class="catanatron-rail-section"><div class="catanatron-section-title">Trade risk <span class="catanatron-risk-${escapeHtml(tradeWatch.status)}">${escapeHtml(tradeWatch.status)}</span></div><div class="catanatron-event">${escapeHtml(tradeWatch.line)}</div></section>` : ""}
    <section class="catanatron-rail-section">
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

  ensureDock() {
    document.documentElement.classList.add("catanatron-game-immersive");
    let dock = document.getElementById("in_game_ad_left");
    if (!dock) {
      dock = document.getElementById(FALLBACK_DOCK_ID);
      if (!dock) {
        dock = document.createElement("div");
        dock.id = FALLBACK_DOCK_ID;
        document.querySelector("#ui-game")?.appendChild(dock);
      }
    }
    dock.classList.add("catanatron-intelligence-dock");
    const stageLeft = document.querySelector("#ui-game")?.getBoundingClientRect().left || 0;
    const dockWidth = stageLeft >= 120 ? Math.round(stageLeft) : Math.min(165, Math.round(window.innerWidth * 0.2));
    dock.style.setProperty("--cat-dock-width", `${dockWidth}px`);
    this.rememberAndSetDisplay(dock, "block");
    for (const child of dock.children) {
      if (child.id !== RAIL_ID) this.rememberAndSetDisplay(child, "none");
    }
    this.rememberAndSetDisplay(document.getElementById("in_game_ad_right"), "none");
    this.rememberAndSetDisplay(document.getElementById("in_game_ad_bottom"), "none");
    this.rememberAndSetDisplay(document.getElementById("in_game_ad_bottom_small"), "none");
    return dock;
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
    const dock = document.querySelector(".catanatron-intelligence-dock");
    dock?.classList.remove("catanatron-intelligence-dock");
    dock?.style.removeProperty("--cat-dock-width");
    document.getElementById(FALLBACK_DOCK_ID)?.remove();
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
    const dock = this.ensureDock();
    this.renderRail(dock);
    this.renderHands();
  }

  renderRail(dock) {
    let rail = document.getElementById(RAIL_ID);
    if (!rail) {
      rail = document.createElement("aside");
      rail.id = RAIL_ID;
      rail.setAttribute("role", "complementary");
      rail.setAttribute("aria-label", "Catanatron live game intelligence");
      rail.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-catanatron-action]");
        if (!button) return;
        button.disabled = true;
        try {
          if (button.dataset.catanatronAction === "toggle-tracking") await this.onToggleTracking?.();
          if (button.dataset.catanatronAction === "reset-tracker") await this.onResetTracker?.();
        } finally {
          button.disabled = false;
        }
      });
      dock.appendChild(rail);
    }
    if (rail.parentElement !== dock) dock.appendChild(rail);
    const capture = this.tracker.capture || {};
    const enabled = Boolean(this.state.trackingEnabled);
    const status = !enabled ? "Counting off" : capture.lastError ? "Capture error" : capture.attached ? `${count(this.tracker.counts?.frames)} frames` : "Starting capture";
    const digest = JSON.stringify({ enabled, status, tracker: this.tracker });
    if (rail.dataset.digest === digest) return;
    rail.dataset.digest = digest;
    rail.innerHTML = `
      <header class="catanatron-rail-header">
        <span class="catanatron-rail-mark">C</span>
        <div class="catanatron-rail-title"><strong>Game Intelligence</strong><span>${escapeHtml(status)} · local only</span></div>
        <span class="catanatron-live-dot ${!enabled ? "is-off" : capture.lastError ? "is-error" : ""}"></span>
      </header>
      <div class="catanatron-rail-actions">
        ${enabled ? `<button class="catanatron-rail-button secondary" type="button" data-catanatron-action="reset-tracker">New game</button>` : `<button class="catanatron-rail-button" type="button" data-catanatron-action="toggle-tracking">Enable counting</button>`}
      </div>
      ${devDeckMarkup(this.tracker.devDeck)}
      ${playerIntelMarkup(this.tracker.players || [], this.tracker.winWatch)}
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
      const parent = original.parentElement;
      if (!parent) continue;
      original.classList.add("catanatron-original-resource-card");
      if (!strip) {
        strip = document.createElement("div");
        strip.className = "catanatron-hand-strip";
        strip.setAttribute("aria-label", `${player.name || "Player"} guaranteed resource cards`);
        parent.insertBefore(strip, original);
      }
      const digest = `${playerDigest(player)}:${Object.values(resourceImages).join("|")}:${cardBackSource(original)}`;
      if (strip.dataset.digest === digest) continue;
      strip.dataset.digest = digest;
      const groups = buildHandGroups(player);
      strip.innerHTML = groups.length
        ? groups.map((group) => handGroupMarkup(group, resourceImages, cardBackSource(original))).join("")
        : `<span class="catanatron-hand-zero">0 cards</span>`;
    }
  }

  removeGameUI() {
    document.getElementById(RAIL_ID)?.remove();
    for (const original of document.querySelectorAll(".catanatron-original-resource-card")) original.classList.remove("catanatron-original-resource-card");
    for (const strip of document.querySelectorAll(".catanatron-hand-strip")) strip.remove();
    this.restoreAds();
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
