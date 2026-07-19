#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const backgroundSource = fs.readFileSync(path.join(root, "src", "background.js"), "utf8");
  const storage = {};
  const tabs = [];
  const createdTabs = [];
  const removedTabs = [];
  const timers = [];
  let nextTabId = 100;

  const listeners = {
    runtimeMessage: [],
    startup: [],
    installed: [],
    removed: [],
    updated: [],
  };

  function event(list) {
    return { addListener(handler) { list.push(handler); } };
  }

  const chrome = {
    runtime: {
      getURL(filePath) { return "moz-extension://test/" + filePath; },
      onMessage: event(listeners.runtimeMessage),
      onStartup: event(listeners.startup),
      onInstalled: event(listeners.installed),
    },
    storage: {
      local: {
        get(defaults, callback) {
          const value = { ...(defaults || {}), ...storage };
          if (callback) callback(value);
          return Promise.resolve(value);
        },
        set(value, callback) {
          Object.assign(storage, value || {});
          if (callback) callback();
          return Promise.resolve();
        },
      },
    },
    tabs: {
      query() { return Promise.resolve(tabs.slice()); },
      create(options) {
        const tab = { id: nextTabId++, url: options.url, active: Boolean(options.active) };
        tabs.push(tab);
        createdTabs.push(tab);
        return Promise.resolve(tab);
      },
      remove(tabId) {
        const index = tabs.findIndex((tab) => tab.id === tabId);
        if (index >= 0) tabs.splice(index, 1);
        removedTabs.push(tabId);
        return Promise.resolve();
      },
      onRemoved: event(listeners.removed),
      onUpdated: event(listeners.updated),
    },
  };

  const context = vm.createContext({
    chrome,
    URL,
    Date,
    Number,
    String,
    console,
    setTimeout(handler, delay) {
      const token = { handler, delay, canceled: false };
      timers.push(token);
      return token;
    },
    clearTimeout(token) {
      if (token) token.canceled = true;
    },
  });

  vm.runInContext(backgroundSource, context, { filename: "src/background.js" });
  await flush();

  assert.strictEqual(listeners.runtimeMessage.length, 1, "background should register one runtime message listener");
  const sendMessage = async (message, tabId = 7) => {
    let response;
    const asyncResponse = listeners.runtimeMessage[0](message, { tab: { id: tabId } }, (value) => { response = value; });
    await flush();
    return { asyncResponse, response };
  };
  const runTimers = async () => {
    while (timers.length) {
      const timer = timers.shift();
      if (!timer.canceled) await timer.handler();
      await flush();
    }
  };

  let result = await sendMessage({ type: "COLONIST_WATCHER_PAGE_ACTIVE", reason: "visible-page" });
  assert.strictEqual(result.asyncResponse, false);
  assert.strictEqual(result.response?.ok, true);
  await runTimers();
  assert.strictEqual(createdTabs.length, 0, "plain page activity must not open dashboard");

  result = await sendMessage({ type: "COLONIST_WATCHER_LIVE_SNAPSHOT", snapshot: { session: { activeReason: "dom" } } });
  assert.strictEqual(result.asyncResponse, true);
  await runTimers();
  assert.strictEqual(createdTabs.length, 0, "non-websocket snapshots must not open dashboard");

  result = await sendMessage({ type: "COLONIST_WATCHER_LIVE_SNAPSHOT", snapshot: { session: { activeReason: "websocket" } } });
  assert.strictEqual(result.asyncResponse, true);
  await runTimers();
  assert.strictEqual(createdTabs.length, 1, "websocket activity should open dashboard once");
  assert.strictEqual(createdTabs[0].url, "moz-extension://test/dashboard/index.html");
  assert.strictEqual(createdTabs[0].active, false, "auto-open should not steal focus");
  assert.strictEqual(storage.colonistWatcherDashboardOpenReason, "websocket");

  await sendMessage({ type: "COLONIST_WATCHER_LIVE_SNAPSHOT", snapshot: { session: { activeReason: "websocket" } } });
  await runTimers();
  assert.strictEqual(createdTabs.length, 1, "repeated websocket snapshots should reuse existing dashboard tab");

  result = await sendMessage({ type: "COLONIST_WATCHER_PAGE_INACTIVE" });
  assert.strictEqual(result.asyncResponse, false);
  await runTimers();
  assert.deepStrictEqual(removedTabs, [createdTabs[0].id], "dashboard should close after leaving Colonist");
  assert(storage.colonistWatcherDashboardClosedAt, "close timestamp should be stored");

  console.log("background smoke test ok");
  console.log(JSON.stringify({
    opened: createdTabs[0],
    removedTabs,
    openReason: storage.colonistWatcherDashboardOpenReason,
    closedAt: storage.colonistWatcherDashboardClosedAt,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
