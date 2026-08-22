"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

test("browser shell and remote game surface retain Electron security boundaries", () => {
  const requiredSettings = [
    "nodeIntegration: false",
    "nodeIntegrationInWorker: false",
    "contextIsolation: true",
    "sandbox: true",
    "webSecurity: true",
    "allowRunningInsecureContent: false",
    "webviewTag: false",
    "navigateOnDragDrop: false",
  ];
  for (const setting of requiredSettings) assert(mainSource.includes(setting), setting);
  assert(mainSource.includes("app.enableSandbox()"), "global Electron sandbox should be enabled");
  assert(mainSource.includes("new WebContentsView"), "Colonist should run in a separate secured page surface");
  assert(mainSource.includes("mainWindow.contentView.addChildView(gameView)"), "the app should own the browser layout");
});

test("session permissions, downloads, popups, and navigation are guarded", () => {
  const requiredGuards = [
    "setPermissionCheckHandler",
    "setPermissionRequestHandler",
    "will-download",
    "will-navigate",
    "will-redirect",
    "will-attach-webview",
    "setWindowOpenHandler",
    "isTrustedShellSender",
    "isTrustedGameSender",
    "tracker:set-enabled",
  ];
  for (const guard of requiredGuards) assert(mainSource.includes(guard), guard);
  assert.match(
    mainSource,
    /setWindowOpenHandler[\s\S]*noteNavigationStarted\(url\)[\s\S]*loadURL\(url\)/,
    "self-targeted authentication windows must activate policy before programmatic navigation"
  );
  assert(!mainSource.includes("contextBridge.exposeInMainWorld"), "remote page must not receive an Electron API bridge");
  assert(mainSource.includes("guardShellNavigation"), "local browser chrome navigation should fail closed");
});

test("loads the first Colonist page before restoring persisted capture", () => {
  const startBlock = mainSource.match(/const start = async \(\) => \{([\s\S]*?)\n  \};/);
  assert(startBlock, "startup block should exist");
  assert(
    startBlock[1].indexOf("loadURL(COLONIST_HOME)") < startBlock[1].indexOf("webSocketCapture.enable()"),
    "debugger capture must not stall the initial renderer startup"
  );
});

test("uses a stable native identity and icon on Windows", () => {
  assert(mainSource.includes('WINDOWS_APP_ID = "dev.pranavg.catanatron.colonist"'));
  assert(mainSource.includes('process.platform === "win32" ? WINDOWS_ICON_PATH : undefined'));
  assert(mainSource.includes('process.platform === "win32") app.setAppUserModelId(WINDOWS_APP_ID)'));
});
