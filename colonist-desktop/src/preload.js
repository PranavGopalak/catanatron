"use strict";

const { ipcRenderer } = require("electron");
const styles = require("./hud.css");
const {
  bindPlayersToNativeIdentities,
  knowledgeFor,
} = require("./immersive-model");
const { platformUi } = require("./platform-ui");
const {
  DICE_ODDS,
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

function isShellPage() {
  return location.protocol === "file:" && location.pathname.endsWith("/shell.html");
}

function createMarkup() {
  return `
    <div class="hud-layer">
      <section class="hud-panel" role="complementary" aria-label="Catanatron game tools">
        <header class="hud-header">
          <div class="hud-mark" aria-hidden="true">C</div>
          <div class="hud-title-block">
            <span class="hud-title">Catanatron</span>
            <span class="hud-subtitle"><span class="hud-status-dot"></span><span data-tracker-subtitle>Counting off</span></span>
          </div>
          <div class="hud-header-actions">
            <button class="hud-icon-button" type="button" data-action="collapse" aria-label="Collapse Catanatron sidebar" title="Collapse Catanatron sidebar">‹</button>
          </div>
        </header>
        <nav class="hud-tabs" role="tablist" aria-label="Catanatron tools">
          <button class="hud-tab" type="button" role="tab" data-tab="cards">Cards</button>
          <button class="hud-tab" type="button" role="tab" data-tab="timer">Timer</button>
          <button class="hud-tab" type="button" role="tab" data-tab="odds">Odds</button>
          <button class="hud-tab" type="button" role="tab" data-tab="notes">Notes</button>
          <button class="hud-tab" type="button" role="tab" data-tab="settings">Setup</button>
        </nav>
        <main class="hud-content" role="tabpanel"></main>
        <footer class="hud-footer" data-tracker-footer>Authorized experiment. Counting is off and no game data is being read.</footer>
      </section>
      <div class="hud-toast" role="status" aria-live="polite"></div>
    </div>`;
}

function resourceGridMarkup(player) {
  return `<div class="tracker-resources">${Object.entries(RESOURCE_LABELS).map(([resource, [mark, label]]) => {
    const knowledge = knowledgeFor(player, resource);
    const value = knowledge.max === null
      ? knowledge.min > 0 ? `${knowledge.min}+` : "?"
      : knowledge.min === knowledge.max ? String(knowledge.min) : `${knowledge.min}–${knowledge.max}`;
    const likelihood = knowledge.presencePct == null
      ? knowledge.state === "unknown" ? "pending" : "possible"
      : `${knowledge.presencePct}%`;
    const title = knowledge.presencePct == null
      ? `${label}: ${value}; probability is not yet defensible`
      : `${label}: ${value}; ${likelihood} of feasible hands contain this resource`;
    return `<div class="tracker-resource tracker-${resource} is-${knowledge.state}" title="${escapeHtml(title)}"><span>${mark}</span><strong>${value}</strong><small>${likelihood}</small></div>`;
  }).join("")}</div>`;
}

function playerMarkup(player, localHand) {
  const trackerName = player.trackerName || player.name;
  const displayName = player.displayName || player.name;
  const isLocal = player.exactHand || (localHand?.player && localHand.player === trackerName);
  const total = Number(player.handTotal ?? player.knownCards ?? 0);
  const identified = Number(player.knownCards || 0);
  const unknown = Math.max(0, total - identified);
  const countCopy = isLocal
    ? "Your exact hand"
    : `${identified} guaranteed · ${unknown} unresolved`;
  return `
    <article class="tracker-player ${isLocal ? "is-local" : ""}">
      <div class="tracker-player-head">
        <div class="tracker-player-title">
          <span class="tracker-color color-${Number(player.color || 0)}" aria-hidden="true"></span>
          <div><strong>${escapeHtml(displayName || "Unknown player")}</strong><span>${escapeHtml(player.colorLabel || "Color unknown")} · ${countCopy}</span></div>
        </div>
        <span class="tracker-card-total" title="Observed hand total"><strong>${total}</strong> cards</span>
      </div>
      ${resourceGridMarkup(player)}
      ${player.estimateConflict ? `<div class="tracker-warning">Protocol ledger and hand total differ by ${Number(player.estimateConflict)}. Ranges were widened.</div>` : ""}
    </article>`;
}

function devDeckMarkup(devDeck) {
  if (!devDeck || !Array.isArray(devDeck.rows)) return "";
  const rows = devDeck.rows.map((row) => {
    const shortName = String(row.name || "").replace("victory point", "victory").replace("road building", "roads").replace("year of plenty", "plenty");
    return `<span title="${escapeHtml(row.name)}: ${Number(row.played || 0)} played of ${Number(row.limit || 0)} total"><strong>${escapeHtml(shortName)}</strong>${Number(row.played || 0)} / ${Number(row.limit || 0)}</span>`;
  }).join("");
  return `<section class="tracker-dev-watch"><div><span class="tracker-section-label">Development watch</span><strong>${Number(devDeck.hiddenInHands || 0)} unplayed purchases</strong></div><div class="tracker-dev-rows">${rows}</div></section>`;
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
  const players = bindPlayersToNativeIdentities(
    tracker.players || [],
    tracker.gameSurface?.identities || [],
  );
  const status = capture.lastError ? "Capture error" : capture.attached ? "Live" : "Starting";
  const events = (tracker.recentEvents || []).slice(0, 2);
  return `
    <div class="tracker-overview">
      <div><p class="hud-eyebrow">Card intelligence</p><h2 class="hud-heading">Game state</h2></div>
      <span class="tracker-live-pill ${capture.lastError ? "has-error" : ""}"><i></i>${status}</span>
      <button class="hud-button compact" type="button" data-action="reset-tracker">New game</button>
    </div>
    <p class="tracker-session">${players.length ? `${players.length} players matched · ` : ""}${Number(counts.frames || 0).toLocaleString()} frames analyzed locally</p>
    ${capture.lastError ? `<div class="tracker-warning">${escapeHtml(capture.lastError)}</div>` : ""}
    ${players.length ? `<div class="tracker-player-list">${players.map((player) => playerMarkup(player, tracker.hand)).join("")}</div>` : `
      <div class="tracker-empty waiting"><strong>Waiting for game state</strong><span>Join or start a game after counting is enabled. The first complete state frame will populate every player.</span></div>`}
    ${devDeckMarkup(tracker.devDeck)}
    ${tracker.tradeWatch?.line ? `<div class="tracker-signal"><span>Trade watch</span><strong>${escapeHtml(tracker.tradeWatch.line)}</strong></div>` : ""}
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
    <p class="hud-eyebrow">Browser preferences</p>
    <h2 class="hud-heading">Catanatron setup</h2>
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
      <div class="hud-setting-head"><span>Collapse or expand sidebar</span></div>
      <span class="hud-shortcut" title="${PLATFORM_UI.shortcutLabel}">${PLATFORM_UI.shortcutGlyphs}</span>
    </div>
    <div class="hud-setting">
      <div class="hud-setting-head"><span>Local Catanatron data</span></div>
      <p class="hud-description">Reset notes, counting consent, and sidebar preferences.</p>
      <button class="hud-button danger hud-button-full" type="button" data-action="reset-state">${awaitingReset ? "Confirm reset" : "Reset local data"}</button>
    </div>`;
}

async function mountBrowserShell() {
  if (!isShellPage() || document.getElementById(HOST_ID)) return;

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
    gameSurface: { active: false, identities: [] },
  };

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-catanatron-ui", "true");
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  shadow.adoptedStyleSheets = [sheet];
  shadow.innerHTML = createMarkup();
  document.body.appendChild(host);

  const panel = shadow.querySelector(".hud-panel");
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
  let effectiveCollapsed = state.collapsed;

  function currentElapsed() {
    return elapsedBeforeStart + (startedAt === null ? 0 : Date.now() - startedAt);
  }

  function paintShellState({ forced = false } = {}) {
    panel.classList.toggle("is-collapsed", effectiveCollapsed);
    panel.classList.toggle("is-forced-collapsed", forced);
    collapseButton.textContent = effectiveCollapsed ? "›" : "‹";
    const action = effectiveCollapsed ? "Expand" : "Collapse";
    const suffix = forced ? " (window is too narrow)" : "";
    collapseButton.setAttribute("aria-label", `${action} Catanatron sidebar${suffix}`);
    collapseButton.title = `${action} Catanatron sidebar${suffix}`;
  }

  function applyShellState() {
    effectiveCollapsed = state.collapsed;
    paintShellState();
    ipcRenderer.send("browser-shell:set-collapsed", state.collapsed);
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
    if (action === "timer-toggle") setTimerRunning(startedAt === null);
    if (action === "timer-new") resetTimer(true);
    if (action === "timer-reset") resetTimer(false);
    if (action === "toggle-tracking") await toggleTracking();
    if (action === "reset-tracker") await resetTracker();
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
      showToast("Local Catanatron data reset");
    }
  });

  shadow.addEventListener("input", (event) => {
    if (event.target.matches(".hud-notes")) {
      state.notes = event.target.value;
      const status = shadow.querySelector("[data-save-status]");
      if (status) status.textContent = "Saving…";
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

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.collapsed = !state.collapsed;
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
    }
  });
  ipcRenderer.on("browser-shell:layout", (_event, layout) => {
    effectiveCollapsed = layout?.collapsed === true;
    paintShellState({ forced: layout?.forced === true });
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

const GAME_ROW_SELECTOR = '[class*="playerRow"][data-player-color]';

function gamePlayerName(row) {
  const node = row.querySelector('[data-player-username], [class*="username"], [class*="playerName"], [class*="player-name"]');
  return node?.textContent?.trim() || "";
}

function gameSurfaceSnapshot() {
  const game = document.querySelector("#ui-game");
  const playerInformation = document.querySelector('[data-player-information-container="true"]');
  const rows = [];
  const seen = new Set();
  for (const row of playerInformation?.querySelectorAll(GAME_ROW_SELECTOR) || []) {
    seen.add(row);
    rows.push(row);
  }
  for (const row of game?.querySelectorAll(GAME_ROW_SELECTOR) || []) {
    if (seen.has(row)) continue;
    seen.add(row);
    rows.push(row);
  }
  return {
    active: Boolean(game && playerInformation && rows.length),
    identities: rows.map((row) => ({
      color: row.dataset.playerColor || "",
      name: gamePlayerName(row),
    })),
  };
}

function mountGameBridge() {
  if (!isColonistPage()) return;
  let lastDigest = "";
  let scheduled = false;
  const publish = () => {
    scheduled = false;
    const snapshot = gameSurfaceSnapshot();
    const digest = JSON.stringify(snapshot);
    if (digest === lastDigest) return;
    lastDigest = digest;
    ipcRenderer.send("game:surface-state", snapshot);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(publish);
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  window.addEventListener("resize", schedule, { passive: true });
  setInterval(schedule, 1000);
  schedule();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    if (isShellPage()) mountBrowserShell();
    else mountGameBridge();
  }, { once: true });
} else {
  if (isShellPage()) mountBrowserShell();
  else mountGameBridge();
}
