"use strict";

const path = require("node:path");
const {
  app,
  BrowserWindow,
  ipcMain,
  session,
} = require("electron");
const {
  COLONIST_HOME,
  createNavigationPolicy,
  displayHost,
  isAllowedColonistUrl,
} = require("./security");
const { HudStateStore } = require("./state-store");
const { TrackerEngine } = require("./tracker-engine");
const { createDemoTrackerSnapshot } = require("./tracker-demo");
const { emptyCounterState } = require("./tracker-state");
const { ColonistWebSocketCapture } = require("./websocket-capture");

const APP_PARTITION = "persist:catanatron-colonist";
const PRELOAD_PATH = path.join(__dirname, "..", "dist", "preload.cjs");
const DEMO_MODE = !app.isPackaged && process.env.CATANATRON_TRACKER_DEMO === "1";

let mainWindow = null;
let stateStore = null;
let trackerEngine = null;
let webSocketCapture = null;
let captureStatus = { enabled: false, attached: false, framesCaptured: 0, droppedFrames: 0, lastError: null };

app.enableSandbox();

function isTrustedSender(event) {
  return Boolean(
    mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    isAllowedColonistUrl(event.senderFrame?.url || event.sender.getURL())
  );
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
  mainWindow.webContents.send("tracker:update", trackerPayload());
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

function createWindow() {
  const storedState = stateStore.read();
  const persistedState = DEMO_MODE ? { ...storedState, activeTab: "cards", trackingEnabled: true } : storedState;
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 900,
    minHeight: 620,
    title: "Catanatron Colonist",
    backgroundColor: "#07111f",
    autoHideMenuBar: true,
    show: false,
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

  trackerEngine = new TrackerEngine({ onUpdate: sendTrackerUpdate });
  trackerEngine.setLocalPlayerName(persistedState.localPlayerName);
  webSocketCapture = new ColonistWebSocketCapture(mainWindow.webContents, {
    onFrame: (frame) => trackerEngine?.addFrame(frame),
    onStatus: (status) => {
      captureStatus = status;
      sendTrackerUpdate();
    },
  });

  guardNavigation(mainWindow.webContents);
  mainWindow.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) trackerEngine?.reset("navigation");
  });
  mainWindow.webContents.on("did-finish-load", sendTrackerUpdate);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const devtoolsShortcut = input.key === "F12" || ((input.meta || input.control) && input.alt && input.key.toLowerCase() === "i");
    if (app.isPackaged && devtoolsShortcut) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    webSocketCapture?.disable().catch(() => undefined);
    trackerEngine?.dispose();
    webSocketCapture = null;
    trackerEngine = null;
    mainWindow = null;
  });
  const start = async () => {
    await mainWindow?.loadURL(COLONIST_HOME);
    if (persistedState.trackingEnabled && !DEMO_MODE) await webSocketCapture.enable();
  };
  start();
}

function registerIpc() {
  ipcMain.handle("hud:load", (event) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted HUD state request");
    const current = stateStore.read();
    return DEMO_MODE ? { ...current, activeTab: "cards", trackingEnabled: true } : current;
  });
  ipcMain.handle("hud:save", (event, candidate) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted HUD state request");
    return stateStore.write(candidate);
  });
  ipcMain.handle("hud:reset", async (event) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted HUD state request");
    await webSocketCapture?.disable();
    trackerEngine?.reset("hud-reset");
    return stateStore.reset();
  });
  ipcMain.handle("tracker:set-enabled", async (event, candidate = {}) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted tracker request");
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
    if (!isTrustedSender(event)) throw new Error("Untrusted tracker request");
    trackerEngine?.reset("manual");
    return trackerPayload();
  });
}

app.whenReady().then(() => {
  app.setName("Catanatron Colonist");
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
