"use strict";

const { ipcRenderer } = require("electron");
const styles = require("./hud.css");
const {
  DICE_ODDS,
  clamp,
  formatDuration,
  sanitizeHudState,
} = require("./hud-state");

const HOST_ID = "catanatron-colonist-hud";
const SAVE_DELAY_MS = 250;

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
            <span class="hud-subtitle"><span class="hud-status-dot"></span>Local utility layer</span>
          </div>
          <div class="hud-header-actions">
            <button class="hud-icon-button" type="button" data-action="collapse" aria-label="Collapse HUD" title="Collapse HUD">−</button>
            <button class="hud-icon-button" type="button" data-action="hide" aria-label="Hide HUD" title="Hide HUD">×</button>
          </div>
        </header>
        <nav class="hud-tabs" role="tablist" aria-label="HUD tools">
          <button class="hud-tab" type="button" role="tab" data-tab="timer">Timer</button>
          <button class="hud-tab" type="button" role="tab" data-tab="odds">Odds</button>
          <button class="hud-tab" type="button" role="tab" data-tab="notes">Notes</button>
          <button class="hud-tab" type="button" role="tab" data-tab="settings">Setup</button>
        </nav>
        <main class="hud-content" role="tabpanel"></main>
        <footer class="hud-footer">Manual tools only. This HUD does not read game data or perform game actions.</footer>
      </section>
      <button class="hud-launcher" type="button" data-action="show" aria-label="Show Catanatron HUD">
        <span class="hud-launcher-mark" aria-hidden="true">C</span> Show HUD
      </button>
      <div class="hud-toast" role="status" aria-live="polite"></div>
    </div>`;
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
    <p class="hud-description">Keep reminders in this app profile. Notes never leave your Mac.</p>
    <textarea class="hud-notes" maxlength="12000" placeholder="Example: Watch the ore port, remember the 8 grain block…" aria-label="Game notes"></textarea>
    <div class="hud-save-status" data-save-status>${notes ? "Saved locally" : "Ready"}</div>`;
}

function settingsMarkup(opacity, awaitingReset) {
  return `
    <p class="hud-eyebrow">HUD preferences</p>
    <h2 class="hud-heading">Display setup</h2>
    <div class="hud-setting">
      <div class="hud-setting-head"><span>Panel opacity</span><span class="hud-setting-value" data-opacity-value>${Math.round(opacity * 100)}%</span></div>
      <input class="hud-range" type="range" min="55" max="100" step="1" value="${Math.round(opacity * 100)}" data-setting="opacity" aria-label="Panel opacity">
    </div>
    <div class="hud-setting">
      <div class="hud-setting-head"><span>Show or hide shortcut</span></div>
      <span class="hud-shortcut">⌘ ⇧ H</span>
    </div>
    <div class="hud-setting">
      <div class="hud-setting-head"><span>Local HUD data</span></div>
      <p class="hud-description">Reset notes, position, visibility, and display preferences.</p>
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

  let saveTimer = null;
  let toastTimer = null;
  let resetConfirmTimer = null;
  let awaitingReset = false;
  let elapsedBeforeStart = 0;
  let startedAt = null;
  let timerInterval = null;
  let dragState = null;

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

  function renderContent() {
    shadow.querySelectorAll(".hud-tab").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === state.activeTab));
    });
    if (state.activeTab === "timer") content.innerHTML = timerMarkup(currentElapsed(), startedAt !== null);
    if (state.activeTab === "odds") content.innerHTML = oddsMarkup();
    if (state.activeTab === "notes") {
      content.innerHTML = notesMarkup(state.notes);
      content.querySelector(".hud-notes").value = state.notes;
    }
    if (state.activeTab === "settings") content.innerHTML = settingsMarkup(state.opacity, awaitingReset);
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
    showToast(`Blocked navigation to ${details?.host || "an external site"}. This app only opens Colonist.`);
  });

  const attachmentObserver = new MutationObserver(() => {
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
  });
  attachmentObserver.observe(document.documentElement, { childList: true });

  applyShellState();
  renderContent();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", mountHud, { once: true });
} else {
  mountHud();
}
