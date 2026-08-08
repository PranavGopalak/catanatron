"use strict";

const path = require("node:path");
const {
  app,
  BrowserWindow,
  ipcMain,
  session,
} = require("electron");
const { COLONIST_HOME, displayHost, isAllowedColonistUrl } = require("./security");
const { HudStateStore } = require("./state-store");

const APP_PARTITION = "persist:catanatron-colonist";
const PRELOAD_PATH = path.join(__dirname, "..", "dist", "preload.cjs");

let mainWindow = null;
let stateStore = null;

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

function configureSession(targetSession) {
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  targetSession.on("will-download", (event) => event.preventDefault());
}

function guardNavigation(webContents) {
  const blockUnlessColonist = (event, url) => {
    if (isAllowedColonistUrl(url)) return;
    event.preventDefault();
    notifyBlockedNavigation(url);
  };

  webContents.on("will-navigate", blockUnlessColonist);
  webContents.on("will-redirect", blockUnlessColonist);
  webContents.on("will-attach-webview", (event) => event.preventDefault());
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedColonistUrl(url)) webContents.loadURL(url);
    else notifyBlockedNavigation(url);
    return { action: "deny" };
  });
}

function createWindow() {
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

  guardNavigation(mainWindow.webContents);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const devtoolsShortcut = input.key === "F12" || ((input.meta || input.control) && input.alt && input.key.toLowerCase() === "i");
    if (app.isPackaged && devtoolsShortcut) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(COLONIST_HOME);
}

function registerIpc() {
  ipcMain.handle("hud:load", (event) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted HUD state request");
    return stateStore.read();
  });
  ipcMain.handle("hud:save", (event, candidate) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted HUD state request");
    return stateStore.write(candidate);
  });
  ipcMain.handle("hud:reset", (event) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted HUD state request");
    return stateStore.reset();
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
