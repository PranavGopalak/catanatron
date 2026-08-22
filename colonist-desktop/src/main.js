"use strict";

const path = require("node:path");
const { fileURLToPath } = require("node:url");
const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  WebContentsView,
} = require("electron");
const {
  COLONIST_HOME,
  createNavigationPolicy,
  displayHost,
  isAllowedColonistUrl,
} = require("./security");
const { HudStateStore } = require("./state-store");
const {
  SHELL_AUTO_COLLAPSE_WIDTH,
  SHELL_COLLAPSED_WIDTH,
  sanitizeGameSurface,
  shellWidthFor,
} = require("./browser-shell-layout");
const { TrackerEngine } = require("./tracker-engine");
const { createDemoTrackerSnapshot } = require("./tracker-demo");
const { emptyCounterState } = require("./tracker-state");
const { ColonistWebSocketCapture } = require("./websocket-capture");

const APP_PARTITION = "persist:catanatron-colonist";
const WINDOWS_APP_ID = "dev.pranavg.catanatron.colonist";
const WINDOWS_ICON_PATH = path.join(__dirname, "..", "assets", "icon.png");
const PRELOAD_PATH = path.join(__dirname, "..", "dist", "preload.cjs");
const SHELL_PATH = path.join(__dirname, "shell.html");
const DEMO_MODE = !app.isPackaged && process.env.CATANATRON_TRACKER_DEMO === "1";

let mainWindow = null;
let gameView = null;
let stateStore = null;
let trackerEngine = null;
let webSocketCapture = null;
let captureStatus = { enabled: false, attached: false, framesCaptured: 0, droppedFrames: 0, lastError: null };
let gameSurfaceState = { active: false, identities: [] };
let shellCollapsed = false;

app.enableSandbox();

function isTrustedGameSender(event) {
  return Boolean(
    gameView &&
    !gameView.webContents.isDestroyed() &&
    event.sender === gameView.webContents &&
    isAllowedColonistUrl(event.senderFrame?.url || event.sender.getURL())
  );
}

function isShellUrl(candidate) {
  try {
    return new URL(candidate).protocol === "file:" && path.normalize(fileURLToPath(candidate)) === path.normalize(SHELL_PATH);
  } catch (_error) {
    return false;
  }
}

function isTrustedShellSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
  return isShellUrl(event.senderFrame?.url || event.sender.getURL());
}

function notifyBlockedNavigation(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("browser:navigation-blocked", {
    host: displayHost(url),
  });
}

function trackerPayload() {
  if (DEMO_MODE) return createDemoTrackerSnapshot();
  return {
    ...(trackerEngine?.snapshot || emptyCounterState()),
    enabled: captureStatus.enabled,
    capture: { ...captureStatus },
  };
}

function sendTrackerUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const tracker = trackerPayload();
  const surface = DEMO_MODE
    ? {
        active: true,
        identities: (tracker.players || []).map((player) => ({
          color: String(player.color || ""),
          name: String(player.name || ""),
        })),
      }
    : gameSurfaceState;
  mainWindow.webContents.send("tracker:update", {
    ...tracker,
    gameSurface: surface,
  });
}

function configureSession(targetSession) {
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  targetSession.on("will-download", (event) => event.preventDefault());
}

function guardNavigation(webContents) {
  const navigationPolicy = createNavigationPolicy();
  const blockUnlessAllowed = (event, url) => {
    navigationPolicy.noteNavigationStarted(url);
    if (navigationPolicy.isAllowed(url)) return;
    event.preventDefault();
    notifyBlockedNavigation(url);
  };

  webContents.on("will-navigate", blockUnlessAllowed);
  webContents.on("will-redirect", blockUnlessAllowed);
  webContents.on("did-start-navigation", (_event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame) navigationPolicy.noteNavigationStarted(url);
  });
  webContents.on("did-finish-load", () => navigationPolicy.noteNavigationFinished(webContents.getURL()));
  webContents.on("will-attach-webview", (event) => event.preventDefault());
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedColonistUrl(url)) {
      navigationPolicy.noteNavigationStarted(url);
      webContents.loadURL(url);
    }
    else notifyBlockedNavigation(url);
    return { action: "deny" };
  });
}

function guardShellNavigation(webContents) {
  webContents.on("will-navigate", (event, url) => {
    if (isShellUrl(url)) return;
    event.preventDefault();
  });
  webContents.on("will-attach-webview", (event) => event.preventDefault());
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

function layoutViews(collapsed = shellCollapsed) {
  if (!mainWindow || mainWindow.isDestroyed() || !gameView) return;
  shellCollapsed = collapsed === true;
  const bounds = mainWindow.getContentBounds();
  const shellWidth = shellWidthFor(bounds.width, shellCollapsed);
  gameView.setBounds({
    x: shellWidth,
    y: 0,
    width: Math.max(1, bounds.width - shellWidth),
    height: Math.max(1, bounds.height),
  });
  mainWindow.webContents.send("browser-shell:layout", {
    collapsed: shellWidth === SHELL_COLLAPSED_WIDTH,
    forced: !shellCollapsed && bounds.width < SHELL_AUTO_COLLAPSE_WIDTH,
    width: shellWidth,
  });
}

function createWindow() {
  const storedState = stateStore.read();
  const persistedState = DEMO_MODE ? { ...storedState, activeTab: "cards", trackingEnabled: true } : storedState;
  shellCollapsed = persistedState.collapsed === true;
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 900,
    minHeight: 620,
    title: "Catanatron Colonist",
    backgroundColor: "#07111f",
    icon: process.platform === "win32" ? WINDOWS_ICON_PATH : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: true,
    },
  });

  gameView = new WebContentsView({
    webPreferences: {
      preload: PRELOAD_PATH,
      partition: APP_PARTITION,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: true,
    },
  });
  mainWindow.contentView.addChildView(gameView);

  trackerEngine = new TrackerEngine({ onUpdate: sendTrackerUpdate });
  trackerEngine.setLocalPlayerName(persistedState.localPlayerName);
  webSocketCapture = new ColonistWebSocketCapture(gameView.webContents, {
    onFrame: (frame) => trackerEngine?.addFrame(frame),
    onStatus: (status) => {
      captureStatus = status;
      sendTrackerUpdate();
    },
  });

  guardShellNavigation(mainWindow.webContents);
  guardNavigation(gameView.webContents);
  gameView.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) trackerEngine?.reset("navigation");
  });
  gameView.webContents.on("did-finish-load", sendTrackerUpdate);
  for (const contents of [mainWindow.webContents, gameView.webContents]) contents.on("before-input-event", (event, input) => {
    const devtoolsShortcut = input.key === "F12" || ((input.meta || input.control) && input.alt && input.key.toLowerCase() === "i");
    if (app.isPackaged && devtoolsShortcut) event.preventDefault();
  });
  mainWindow.on("resize", () => layoutViews());
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    webSocketCapture?.disable().catch(() => undefined);
    trackerEngine?.dispose();
    if (gameView && !gameView.webContents.isDestroyed()) gameView.webContents.close();
    gameView = null;
    webSocketCapture = null;
    trackerEngine = null;
    mainWindow = null;
  });
  const start = async () => {
    await mainWindow?.loadFile(SHELL_PATH);
    layoutViews(persistedState.collapsed);
    await gameView?.webContents.loadURL(COLONIST_HOME);
    if (persistedState.trackingEnabled && !DEMO_MODE) await webSocketCapture.enable();
    sendTrackerUpdate();
  };
  start();
}

function registerIpc() {
  ipcMain.handle("hud:load", (event) => {
    if (!isTrustedShellSender(event)) throw new Error("Untrusted HUD state request");
    const current = stateStore.read();
    return DEMO_MODE ? { ...current, activeTab: "cards", trackingEnabled: true } : current;
  });
  ipcMain.handle("hud:save", (event, candidate) => {
    if (!isTrustedShellSender(event)) throw new Error("Untrusted HUD state request");
    return stateStore.write(candidate);
  });
  ipcMain.handle("hud:reset", async (event) => {
    if (!isTrustedShellSender(event)) throw new Error("Untrusted HUD state request");
    await webSocketCapture?.disable();
    trackerEngine?.reset("hud-reset");
    return stateStore.reset();
  });
  ipcMain.handle("tracker:set-enabled", async (event, candidate = {}) => {
    if (!isTrustedShellSender(event)) throw new Error("Untrusted tracker request");
    if (DEMO_MODE) return trackerPayload();
    const enabled = candidate.enabled === true;
    const localPlayerName = String(candidate.localPlayerName || "").trim().slice(0, 32);
    trackerEngine?.setLocalPlayerName(localPlayerName);
    const current = stateStore.read();
    await stateStore.write({ ...current, trackingEnabled: enabled, localPlayerName });
    if (enabled) await webSocketCapture?.enable();
    else {
      await webSocketCapture?.disable();
      trackerEngine?.reset("disabled");
    }
    sendTrackerUpdate();
    return trackerPayload();
  });
  ipcMain.handle("tracker:reset", (event) => {
    if (!isTrustedShellSender(event)) throw new Error("Untrusted tracker request");
    trackerEngine?.reset("manual");
    return trackerPayload();
  });
  ipcMain.on("browser-shell:set-collapsed", (event, collapsed) => {
    if (!isTrustedShellSender(event)) return;
    layoutViews(collapsed === true);
  });
  ipcMain.on("game:surface-state", (event, candidate) => {
    if (!isTrustedGameSender(event)) return;
    gameSurfaceState = sanitizeGameSurface(candidate);
    sendTrackerUpdate();
  });
}

app.whenReady().then(() => {
  app.setName("Catanatron Colonist");
  if (process.platform === "win32") app.setAppUserModelId(WINDOWS_APP_ID);
  stateStore = new HudStateStore(app.getPath("userData"));
  configureSession(session.fromPartition(APP_PARTITION));
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
