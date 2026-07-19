#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function usage() {
  console.error("Usage: node scripts/popup-smoke-test.cjs <colonist-export.json>");
  process.exit(2);
}

function createElement(id) {
  const listeners = {};
  return {
    id,
    listeners,
    value: id === "filter" ? "all" : "",
    textContent: "",
    innerHTML: "",
    dataset: {},
    className: "",
    children: [],
    append(...items) {
      this.children.push(...items);
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    click() {
      if (listeners.click) listeners.click({ target: this });
    },
    setAttribute() {},
  };
}

function runPopup(payload) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    createElement(tag) {
      const element = createElement(tag);
      element.tagName = tag.toUpperCase();
      return element;
    },
  };

  let lastStorageSet = null;
  const storageState = {
    colonistAllRawLogs: payload.allRawLogs || [],
    colonistEvents: payload.parsedEvents || [],
    colonistRawLogs: payload.rawLogs || [],
    colonistWebSocketFrames: payload.webSocketFrames || [],
    colonistWatcherSessionId: payload.session?.sessionId || "test-session",
    colonistWatcherSequence: payload.session?.sequence || 0,
    colonistWatcherAllSequence: payload.session?.allSequence || 0,
    colonistWatcherWebSocketSequence: payload.session?.webSocketSequence || 0,
    colonistWatcherLocalPlayerName: payload.localPlayerName || "KabaliKhan",
    colonistWatcherResourceMap: payload.resourceMap || {
      card_1: "lumber",
      card_2: "brick",
      card_3: "wool",
      card_4: "grain",
      card_5: "ore",
    },
  };

  const chrome = {
    storage: {
      local: {
        get(defaults, callback) {
          callback({ ...defaults, ...storageState });
        },
        set(value, callback) {
          lastStorageSet = value;
          Object.assign(storageState, value);
          if (callback) callback();
        },
      },
      onChanged: { addListener() {} },
    },
    tabs: { created: [], query: async () => [], sendMessage() {}, create: async (tab) => { chrome.tabs.created.push(tab); return { id: 99, ...tab }; } },
    runtime: { getURL: (path) => "moz-extension://test/" + path, getManifest: () => ({ version: "0.1.8" }) },
    downloads: { download() {} },
  };

  const context = vm.createContext({
    console,
    document,
    chrome,
    navigator: { clipboard: { writeText: async () => {} } },
    window: { setTimeout() {} },
    setTimeout() {},
    Blob,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    TextDecoder,
    Uint8Array,
    DataView,
    Array,
    Object,
    Number,
    String,
    Math,
    Date,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
  });

  const root = path.resolve(__dirname, "..");
  vm.runInContext(fs.readFileSync(path.join(root, "src/core.js"), "utf8"), context, { filename: "core.js" });
  vm.runInContext(fs.readFileSync(path.join(root, "src/ws-core.js"), "utf8"), context, { filename: "ws-core.js" });
  vm.runInContext(fs.readFileSync(path.join(root, "src/popup.js"), "utf8"), context, { filename: "popup.js" });

  return { elements, getLastStorageSet: () => lastStorageSet, getStorageState: () => storageState, getCreatedTabs: () => chrome.tabs.created };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) usage();

  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  const popupJsSource = fs.readFileSync(path.resolve(__dirname, "..", "src", "popup.js"), "utf8");
  assert(popupJsSource.includes('chrome.runtime.getURL("dashboard/index.html")'), "popup should open packaged dashboard");
  const popup = runPopup(payload);
  const { elements } = popup;

  const status = elements.get("status").textContent;
  const trackerStatus = elements.get("trackerStatus").textContent;
  const resourceMapSuggestion = elements.get("resourceMapSuggestion").textContent;
  const applyResourceMapSuggestionDisabled = elements.get("applyResourceMapSuggestion").disabled;
  assert.strictEqual(applyResourceMapSuggestionDisabled, true);
  const calibrationStatus = elements.get("calibrationStatus").textContent;
  const calibrationDeltaStatus = elements.get("calibrationDeltaStatus").textContent;
  const renderedEventRows = elements.get("events").children.length;
  const renderedTrackerRows = elements.get("trackerPlayers").children.length;
  const calibrationChips = elements.get("calibrationHand").children.map((chip) => chip.innerHTML);
  const calibrationDeltaChips = elements.get("calibrationDelta").children.map((chip) => chip.innerHTML);

  assert.strictEqual(elements.get("popupVersion").textContent, "v0.1.8");
  assert.match(status, /ws frames/);
  assert.match(status, /parsed events/);
  assert.match(trackerStatus, /WebSocket:/);
  assert.match(resourceMapSuggestion, /Verified/);
  assert.strictEqual(popupJsSource.includes('card_1: "lumber"'), true, "popup must use the verified resource mapping");
  assert(renderedEventRows > 0, "expected rendered parsed event rows");
  assert(renderedTrackerRows > 0, "expected rendered tracker rows");
  assert.match(calibrationStatus, /KabaliKhan|color_/);
  assert(calibrationChips.length > 0, "expected calibration hand chips");
  assert.match(calibrationDeltaStatus, /Tracker check/);

  const openDashboard = elements.get("openDashboard");
  assert(openDashboard, "expected Open Dashboard button");
  openDashboard.click();
  assert.strictEqual(popup.getCreatedTabs()[0]?.url, "moz-extension://test/dashboard/index.html");
  assert.strictEqual(popup.getCreatedTabs()[0]?.active, true);

  assert.strictEqual(elements.get("resourceMapCard1").value, "lumber");
  assert.strictEqual(elements.get("resourceMapCard2").value, "brick");
  assert.strictEqual(elements.get("resourceMapCard3").value, "wool");
  assert.strictEqual(elements.get("resourceMapCard4").value, "grain");
  assert.strictEqual(elements.get("resourceMapCard5").value, "ore");

  console.log("popup smoke test ok");
  console.log(JSON.stringify({ status, trackerStatus, resourceMapSuggestion, applyResourceMapSuggestionDisabled, calibrationStatus, calibrationDeltaStatus, renderedEventRows, renderedTrackerRows, calibrationChips, calibrationDeltaChips }, null, 2));
}

main();
