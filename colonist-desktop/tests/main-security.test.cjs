"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

test("remote renderer retains Electron security boundaries", () => {
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
    "isTrustedSender",
    "tracker:set-enabled",
  ];
  for (const guard of requiredGuards) assert(mainSource.includes(guard), guard);
  assert(!mainSource.includes("contextBridge.exposeInMainWorld"), "remote page must not receive an Electron API bridge");
});
