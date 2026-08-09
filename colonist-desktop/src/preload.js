"use strict";

const { ipcRenderer } = require("electron");
const styles = require("./hud.css");
const { ImmersiveGameUI } = require("./immersive-ui");
const { platformUi } = require("./platform-ui");
const {
  DICE_ODDS,
  clamp,
  formatDuration,
  sanitizeHudState,
} = require("./hud-state");

const HOST_ID = "catanatron-colonist-hud";
const SAVE_DELAY_MS = 250;
const PLATFORM_UI = platformUi();
const RESOURCE_LABELS = {
  brick: ["BR", "Brick"],
  lumber: ["LU", "Lumber"],
  ore: ["OR", "Ore"],
  grain: ["GR", "Grain"],
  wool: ["WO", "Wool"],
};

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isColonistPage() {
  const host = location.hostname.toLowerCase();
  return location.protocol === "https:" && (host === "colonist.io" || host.endsWith(".colonist.io"));
}

function createMarkup() {
  return `
    <div class="hud-layer">
      <section class="hud-panel" role="complementary" aria-label="Catanatron game tools">
        <header class="hud-header" data-drag-handle>
          <div class="hud-mark" aria-hidden="true">C</div>
          <div class="hud-title-block">
            <span class="hud-title">Catanatron HUD</span>
            <span class="hud-subtitle"><span class="hud-status-dot"></span><span data-tracker-subtitle>Counting off</span></span>
          </div>
          <div class="hud-header-actions">
            <button class="hud-icon-button" type="button" data-action="collapse" aria-label="Collapse HUD" title="Collapse HUD">−</button>
            <button class="hud-icon-button" type="button" data-action="hide" aria-label="Hide HUD" title="Hide HUD">×</button>
          </div>
        </header>
        <nav class="hud-tabs" role="tablist" aria-label="HUD tools">
          <button class="hud-tab" type="button" role="tab" data-tab="cards">Cards</button>
          <button class="hud-tab" type="button" role="tab" data-tab="timer">Timer</button>
          <button class="hud-tab" type="button" role="tab" data-tab="odds">Odds</button>
          <button class="hud-tab" type="button" role="tab" data-tab="notes">Notes</button>
          <button class="hud-tab" type="button" role="tab" data-tab="settings">Setup</button>
        </nav>
        <main class="hud-content" role="tabpanel"></main>
        <footer class="hud-footer" data-tracker-footer>Authorized experiment. Counting is off and no game data is being read.</footer>
      </section>
      <button class="hud-launcher" type="button" data-action="show" aria-label="Show Catanatron HUD">
        <span class="hud-launcher-mark" aria-hidden="true">C</span> Show HUD
      </button>
      <div class="hud-toast" role="status" aria-live="polite"></div>
    </div>`;
}

function resourceGridMarkup(player) {
  return `<div class="tracker-resources">${Object.entries(RESOURCE_LABELS).map(([resource, [mark, label]]) => {
    const range = player.cardRanges?.[resource];
    const minimum = Number(range?.min ?? player.cards?.[resource] ?? 0);
    const maximum = Number(range?.max ?? minimum);
    const value = minimum === maximum ? String(minimum) : `${minimum} to ${maximum}`;
    return `<div class="tracker-resource tracker-${resource}" title="${label}"><span>${mark}</span><strong>${value}</strong></div>`;
  }).join("")}</div>`;
}

function playerMarkup(player, localHand) {
  const isLocal = player.exactHand || (localHand?.player && localHand.player === player.name);
  const visiblePoints = Number(player.score?.visiblePoints || 0);
  const hiddenPoints = Number(player.score?.hiddenVictoryPoints || 0);
  const hiddenRisk = Number(player.score?.hiddenVpRisk ?? hiddenPoints);
  const vp = hiddenRisk > hiddenPoints ? `${visiblePoints}+${hiddenPoints} to ${hiddenRisk}` : `${visiblePoints + hiddenPoints}`;
  const total = Number(player.handTotal ?? player.knownCards ?? 0);
  const identified = Number(player.knownCards || 0);
  const unknown = Math.max(0, total - identified);
  const devTotal = Number(player.developmentCards?.total || player.devCardsBought || 0);
  const countCopy = isLocal
    ? `${total} cards, exact hand`
    : `${identified} guaranteed, ${unknown} unresolved, ${total} total`;
  return `
    <article class="tracker-player ${isLocal ? "is-local" : ""}">
      <div class="tracker-player-head">
        <div class="tracker-player-title">
          <span class="tracker-color color-${Number(player.color || 0)}" aria-hidden="true"></span>
          <div><strong>${escapeHtml(player.name || "Unknown player")}</strong><span>${escapeHtml(player.colorLabel || "Color unknown")} · ${countCopy}</span></div>
        </div>
        <div class="tracker-player-metrics"><span><strong>${vp}</strong> VP</span><span><strong>${devTotal}</strong> DEV</span></div>
      </div>
      ${resourceGridMarkup(player)}
      ${player.estimateConflict ? `<div class="tracker-warning">Protocol ledger and hand total differ by ${Number(player.estimateConflict)}. Ranges were widened.</div>` : ""}
    </article>`;
}

function cardsMarkup(tracker, state) {
  if (!state.trackingEnabled) {
    return `
      <p class="hud-eyebrow">Authorized experiment</p>
      <h2 class="hud-heading">Live card counting</h2>
      <p class="hud-description">Use the existing Catanatron decoder to track exact hand totals, your exact cards, and bounded opponent card ranges.</p>
      <div class="tracker-empty">
        <strong>Counting is off</strong>
        <span>No WebSocket frames are being captured.</span>
        <button class="hud-button primary" type="button" data-action="toggle-tracking">Enable counting</button>
      </div>`;
  }

  const capture = tracker.capture || {};
  const counts = tracker.counts || {};
  const players = tracker.players || [];
  const status = capture.lastError ? "Capture error" : capture.attached ? "Listening" : "Starting";
  const events = (tracker.recentEvents || []).slice(0, 5);
  return `
    <div class="tracker-overview">
      <div><p class="hud-eyebrow">Live game ledger</p><h2 class="hud-heading">${status}</h2></div>
      <button class="hud-button compact" type="button" data-action="reset-tracker">New game</button>
    </div>
    <div class="tracker-stream ${capture.lastError ? "has-error" : ""}">
      <span><strong>${Number(counts.frames || 0)}</strong> frames</span>
      <span><strong>${Number(counts.decoded || 0)}</strong> decoded</span>
      <span><strong>${Number(counts.events || 0)}</strong> events</span>
      <span><strong>${Number(counts.uncertain || 0)}</strong> unknown</span>
    </div>
    ${capture.lastError ? `<div class="tracker-warning">${escapeHtml(capture.lastError)}</div>` : ""}
    ${players.length ? `<div class="tracker-player-list">${players.map((player) => playerMarkup(player, tracker.hand)).join("")}</div>` : `
      <div class="tracker-empty waiting"><strong>Waiting for game state</strong><span>Join or start a game after counting is enabled. The first complete state frame will populate every player.</span></div>`}
    ${events.length ? `<div class="tracker-events"><span class="tracker-section-label">Recent game events</span>${events.map((event) => `<div><span>${escapeHtml(event.type || "update")}</span><p>${escapeHtml(event.line)}</p></div>`).join("")}</div>` : ""}`;
}

function timerMarkup(elapsed, running) {
  return `
    <p class="hud-eyebrow">Turn awareness</p>
    <h2 class="hud-heading">Manual turn timer</h2>
    <p class="hud-description">Start this when a turn begins. Nothing is read from or sent to the game.</p>
    <div class="hud-timer">
      <div class="hud-timer-value" data-timer-value>${formatDuration(elapsed)}</div>
      <div class="hud-timer-label">Elapsed time</div>
      <div class="hud-button-row three">
        <button class="hud-button primary" type="button" data-action="timer-toggle">${running ? "Pause" : "Start"}</button>
        <button class="hud-button" type="button" data-action="timer-new">New turn</button>
        <button class="hud-button" type="button" data-action="timer-reset">Reset</button>
      </div>
    </div>
    <div class="hud-callout">Tip: use New turn after each player finishes to restart the clock immediately.</div>`;
}

function oddsMarkup() {
  const rows = DICE_ODDS.map(({ total, combinations, probability }) => `
    <div class="hud-odds-row ${total === 7 ? "hud-seven" : ""}">
      <span class="hud-die-total">${total}</span>
      <span class="hud-probability-track" title="${combinations} of 36 combinations">
        <span class="hud-probability-fill" style="width:${(combinations / 6) * 100}%"></span>
      </span>
      <span class="hud-probability">${probability.toFixed(1)}%</span>
    </div>`).join("");
  return `
    <p class="hud-eyebrow">Two six-sided dice</p>
    <h2 class="hud-heading">Roll probabilities</h2>
    <p class="hud-description">A quick reference for evaluating production without inspecting the page.</p>
    <div class="hud-odds-list">${rows}</div>`;
}

function notesMarkup(notes) {
  return `
    <p class="hud-eyebrow">Private and local</p>
    <h2 class="hud-heading">Game notes</h2>
    <p class="hud-description">Keep reminders in this app profile. Notes never leave your ${PLATFORM_UI.deviceNoun}.</p>
    <textarea class="hud-notes" maxlength="12000" placeholder="Example: Watch the ore port, remember the 8 grain block…" aria-label="Game notes"></textarea>
    <div class="hud-save-status" data-save-status>${notes ? "Saved locally" : "Ready"}</div>`;
}

function settingsMarkup(state, tracker, awaitingReset) {
  const capture = tracker.capture || {};
  return `
    <p class="hud-eyebrow">HUD preferences</p>
    <h2 class="hud-heading">Display setup</h2>
    <div class="hud-setting tracker-consent">
      <div class="hud-setting-head"><span>Authorized card counting</span><span class="hud-setting-value">${state.trackingEnabled ? capture.attached ? "LIVE" : "STARTING" : "OFF"}</span></div>
      <p class="hud-description">Captures Colonist binary WebSocket frames locally and converts them into card totals and uncertainty ranges. It never performs game actions.</p>
      <label class="hud-field-label" for="catanatron-player-name">Your Colonist name</label>
      <input id="catanatron-player-name" class="hud-text-input" type="text" maxlength="32" data-setting="player-name" placeholder="Optional, improves local-player matching" value="${escapeHtml(state.localPlayerName)}">
      <div class="hud-button-row">
        <button class="hud-button ${state.trackingEnabled ? "danger" : "primary"}" type="button" data-action="toggle-tracking">${state.trackingEnabled ? "Disable counting" : "Enable counting"}</button>
        <button class="hud-button" type="button" data-action="reset-tracker" ${state.trackingEnabled ? "" : "disabled"}>New game</button>
      </div>
    </div>
    <div class="hud-setting">
      <div class="hud-setting-head"><span>Panel opacity</span><span class="hud-setting-value" data-opacity-value>${Math.round(state.opacity * 100)}%</span></div>
      <input class="hud-range" type="range" min="55" max="100" step="1" value="${Math.round(state.opacity * 100)}" data-setting="opacity" aria-label="Panel opacity">
    </div>
    <div class="hud-setting">
      <div class="hud-setting-head"><span>Show or hide shortcut</span></div>
      <span class="hud-shortcut" title="${PLATFORM_UI.shortcutLabel}">${PLATFORM_UI.shortcutGlyphs}</span>
    </div>
    <div class="hud-setting">
      <div class="hud-setting-head"><span>Local HUD data</span></div>
      <p class="hud-description">Reset notes, counting consent, position, visibility, and display preferences.</p>
      <div class="hud-button-row">
        <button class="hud-button danger" type="button" data-action="reset-state">${awaitingReset ? "Confirm reset" : "Reset HUD data"}</button>
        <button class="hud-button" type="button" data-action="center-panel">Center panel</button>
      </div>
    </div>`;
}

async function mountHud() {
  if (!isColonistPage() || document.getElementById(HOST_ID)) return;

  let state;
  try {
    state = sanitizeHudState(await ipcRenderer.invoke("hud:load"));
  } catch (_error) {
    state = sanitizeHudState(null);
  }
  let tracker = {
    enabled: state.trackingEnabled,
    capture: { enabled: state.trackingEnabled, attached: false, framesCaptured: 0, droppedFrames: 0, lastError: null },
    players: [],
    hand: null,
    recentEvents: [],
    counts: {},
  };

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-catanatron-ui", "true");
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  shadow.adoptedStyleSheets = [sheet];
  shadow.innerHTML = createMarkup();
  document.documentElement.appendChild(host);

  const panel = shadow.querySelector(".hud-panel");
  const launcher = shadow.querySelector(".hud-launcher");
  const content = shadow.querySelector(".hud-content");
  const toast = shadow.querySelector(".hud-toast");
  const collapseButton = shadow.querySelector('[data-action="collapse"]');
  const trackerSubtitle = shadow.querySelector("[data-tracker-subtitle]");
  const trackerFooter = shadow.querySelector("[data-tracker-footer]");
  const trackerStatusDot = shadow.querySelector(".hud-status-dot");

  let saveTimer = null;
  let toastTimer = null;
  let resetConfirmTimer = null;
  let awaitingReset = false;
  let elapsedBeforeStart = 0;
  let startedAt = null;
  let timerInterval = null;
  let dragState = null;
  let immersive = null;

  function syncImmersive() {
    immersive?.update(tracker, state);
  }

  function currentElapsed() {
    return elapsedBeforeStart + (startedAt === null ? 0 : Date.now() - startedAt);
  }

  function applyPosition() {
    const rect = panel.getBoundingClientRect();
    const fallbackX = Math.max(12, window.innerWidth - rect.width - 18);
    const x = clamp(state.position.x ?? fallbackX, 8, Math.max(8, window.innerWidth - rect.width - 8));
    const y = clamp(state.position.y, 8, Math.max(8, window.innerHeight - rect.height - 8));
    state.position = { x, y };
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  }

  function applyShellState() {
    panel.classList.toggle("is-collapsed", state.collapsed);
    panel.classList.toggle("is-hidden", state.hidden);
    launcher.classList.toggle("is-visible", state.hidden);
    panel.style.opacity = String(state.opacity);
    collapseButton.textContent = state.collapsed ? "+" : "−";
    collapseButton.setAttribute("aria-label", state.collapsed ? "Expand HUD" : "Collapse HUD");
    collapseButton.title = state.collapsed ? "Expand HUD" : "Collapse HUD";
    requestAnimationFrame(applyPosition);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        state = sanitizeHudState(await ipcRenderer.invoke("hud:save", state));
        const saveStatus = shadow.querySelector("[data-save-status]");
        if (saveStatus) saveStatus.textContent = "Saved locally";
      } catch (_error) {
        const saveStatus = shadow.querySelector("[data-save-status]");
        if (saveStatus) saveStatus.textContent = "Could not save";
      }
    }, SAVE_DELAY_MS);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  function applyTrackerChrome() {
    const capture = tracker.capture || {};
    trackerStatusDot.classList.toggle("is-off", !state.trackingEnabled);
    trackerStatusDot.classList.toggle("is-error", Boolean(capture.lastError));
    if (!state.trackingEnabled) trackerSubtitle.textContent = "Counting off";
    else if (capture.lastError) trackerSubtitle.textContent = "Capture error";
    else if (capture.attached) trackerSubtitle.textContent = `${Number(tracker.counts?.frames || 0)} frames captured`;
    else trackerSubtitle.textContent = "Starting capture";
    trackerFooter.textContent = state.trackingEnabled
      ? "Authorized experiment. Local counting only. No automated game actions."
      : "Authorized experiment. Counting is off and no game data is being read.";
  }

  function renderContent() {
    shadow.querySelectorAll(".hud-tab").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === state.activeTab));
    });
    if (state.activeTab === "cards") content.innerHTML = cardsMarkup(tracker, state);
    if (state.activeTab === "timer") content.innerHTML = timerMarkup(currentElapsed(), startedAt !== null);
    if (state.activeTab === "odds") content.innerHTML = oddsMarkup();
    if (state.activeTab === "notes") {
      content.innerHTML = notesMarkup(state.notes);
      content.querySelector(".hud-notes").value = state.notes;
    }
    if (state.activeTab === "settings") content.innerHTML = settingsMarkup(state, tracker, awaitingReset);
    applyTrackerChrome();
    syncImmersive();
  }

  async function toggleTracking() {
    state.trackingEnabled = !state.trackingEnabled;
    renderContent();
    scheduleSave();
    try {
      tracker = await ipcRenderer.invoke("tracker:set-enabled", {
        enabled: state.trackingEnabled,
        localPlayerName: state.localPlayerName,
      });
      renderContent();
      showToast(state.trackingEnabled ? "Card counting enabled" : "Card counting disabled and cleared");
    } catch (_error) {
      state.trackingEnabled = false;
      renderContent();
      showToast("Card counting could not be started");
    }
  }

  async function resetTracker() {
    tracker = await ipcRenderer.invoke("tracker:reset");
    renderContent();
    showToast("Card counts reset for a new game");
  }

  function updateTimerDisplay() {
    const value = shadow.querySelector("[data-timer-value]");
    if (value) value.textContent = formatDuration(currentElapsed());
  }

  function setTimerRunning(running) {
    if (running && startedAt === null) startedAt = Date.now();
    if (!running && startedAt !== null) {
      elapsedBeforeStart += Date.now() - startedAt;
      startedAt = null;
    }
    clearInterval(timerInterval);
    timerInterval = startedAt === null ? null : setInterval(updateTimerDisplay, 250);
    renderContent();
  }

  function resetTimer(startImmediately) {
    elapsedBeforeStart = 0;
    startedAt = startImmediately ? Date.now() : null;
    clearInterval(timerInterval);
    timerInterval = startedAt === null ? null : setInterval(updateTimerDisplay, 250);
    renderContent();
  }

  shadow.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const tab = target.dataset.tab;
    const action = target.dataset.action;

    if (tab) {
      state.activeTab = tab;
      awaitingReset = false;
      renderContent();
      scheduleSave();
      return;
    }
    if (action === "collapse") {
      state.collapsed = !state.collapsed;
      applyShellState();
      scheduleSave();
    }
    if (action === "hide") {
      state.hidden = true;
      applyShellState();
      scheduleSave();
    }
    if (action === "show") {
      state.hidden = false;
      applyShellState();
      scheduleSave();
    }
    if (action === "timer-toggle") setTimerRunning(startedAt === null);
    if (action === "timer-new") resetTimer(true);
    if (action === "timer-reset") resetTimer(false);
    if (action === "toggle-tracking") await toggleTracking();
    if (action === "reset-tracker") await resetTracker();
    if (action === "center-panel") {
      const rect = panel.getBoundingClientRect();
      state.position = {
        x: Math.max(8, (window.innerWidth - rect.width) / 2),
        y: Math.max(8, (window.innerHeight - rect.height) / 2),
      };
      applyPosition();
      scheduleSave();
    }
    if (action === "reset-state") {
      if (!awaitingReset) {
        awaitingReset = true;
        clearTimeout(resetConfirmTimer);
        resetConfirmTimer = setTimeout(() => {
          awaitingReset = false;
          if (state.activeTab === "settings") renderContent();
        }, 4000);
        renderContent();
        return;
      }
      state = sanitizeHudState(await ipcRenderer.invoke("hud:reset"));
      tracker = {
        enabled: false,
        capture: { enabled: false, attached: false, framesCaptured: 0, droppedFrames: 0, lastError: null },
        players: [],
        hand: null,
        recentEvents: [],
        counts: {},
      };
      awaitingReset = false;
      applyShellState();
      renderContent();
      showToast("HUD data reset");
    }
  });

  shadow.addEventListener("input", (event) => {
    if (event.target.matches(".hud-notes")) {
      state.notes = event.target.value;
      const status = shadow.querySelector("[data-save-status]");
      if (status) status.textContent = "Saving…";
      scheduleSave();
    }
    if (event.target.matches('[data-setting="opacity"]')) {
      state.opacity = clamp(Number(event.target.value) / 100, 0.55, 1);
      panel.style.opacity = String(state.opacity);
      const value = shadow.querySelector("[data-opacity-value]");
      if (value) value.textContent = `${Math.round(state.opacity * 100)}%`;
      scheduleSave();
    }
    if (event.target.matches('[data-setting="player-name"]')) {
      state.localPlayerName = event.target.value.trim().slice(0, 32);
      scheduleSave();
    }
  });

  shadow.addEventListener("change", async (event) => {
    if (!event.target.matches('[data-setting="player-name"]')) return;
    try {
      tracker = await ipcRenderer.invoke("tracker:set-enabled", {
        enabled: state.trackingEnabled,
        localPlayerName: state.localPlayerName,
      });
      renderContent();
    } catch (_error) {
      showToast("Player name could not be updated");
    }
  });

  const dragHandle = shadow.querySelector("[data-drag-handle]");
  dragHandle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    dragState = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    panel.classList.add("is-dragging");
    dragHandle.setPointerCapture(event.pointerId);
  });
  dragHandle.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const rect = panel.getBoundingClientRect();
    state.position = {
      x: clamp(event.clientX - dragState.offsetX, 8, Math.max(8, window.innerWidth - rect.width - 8)),
      y: clamp(event.clientY - dragState.offsetY, 8, Math.max(8, window.innerHeight - rect.height - 8)),
    };
    applyPosition();
  });
  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    panel.classList.remove("is-dragging");
    scheduleSave();
  };
  dragHandle.addEventListener("pointerup", finishDrag);
  dragHandle.addEventListener("pointercancel", finishDrag);

  window.addEventListener("resize", () => {
    applyPosition();
    scheduleSave();
  });
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.hidden = !state.hidden;
      applyShellState();
      scheduleSave();
    }
  }, true);

  ipcRenderer.on("browser:navigation-blocked", (_event, details) => {
    showToast(`Blocked navigation to ${details?.host || "an external site"}. This app only opens Colonist and approved sign in pages.`);
  });
  ipcRenderer.on("tracker:update", (_event, snapshot) => {
    tracker = snapshot || tracker;
    if (state.activeTab === "cards" || state.activeTab === "settings") renderContent();
    else {
      applyTrackerChrome();
      syncImmersive();
    }
  });

  const attachmentObserver = new MutationObserver(() => {
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
  });
  attachmentObserver.observe(document.documentElement, { childList: true });

  immersive = new ImmersiveGameUI({
    onToggleTracking: toggleTracking,
    onResetTracker: resetTracker,
    onActiveChange(active) {
      panel.classList.toggle("is-game-suppressed", active);
      launcher.classList.toggle("is-game-suppressed", active);
    },
  });
  applyShellState();
  renderContent();
  try {
    tracker = await ipcRenderer.invoke("tracker:set-enabled", {
      enabled: state.trackingEnabled,
      localPlayerName: state.localPlayerName,
    });
    renderContent();
  } catch (_error) {
    showToast("Card counter initialization failed");
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", mountHud, { once: true });
} else {
  mountHud();
}
