const DASHBOARD_PATH = "dashboard/index.html";
const AUTO_OPEN_COOLDOWN_MS = 5000;
const CLOSE_DELAY_MS = 2500;

const activeColonistTabs = new Set();
const dashboardTabs = new Set();
let closeTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function dashboardUrl() {
  return chrome.runtime.getURL(DASHBOARD_PATH);
}

function isDashboardUrl(url) {
  return String(url || "").startsWith(dashboardUrl());
}

function isColonistUrl(url) {
  try {
    const host = new URL(url || "").hostname;
    return host === "colonist.io" || host.endsWith(".colonist.io");
  } catch (_error) {
    return false;
  }
}

async function findDashboardTab() {
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => isDashboardUrl(tab.url));
}

async function maybeOpenDashboard(reason) {
  const existing = await findDashboardTab();
  if (existing?.id !== undefined) {
    dashboardTabs.add(existing.id);
    return existing;
  }
  const { colonistWatcherDashboardOpenedAt } = await chrome.storage.local.get({ colonistWatcherDashboardOpenedAt: null });
  const lastOpened = Date.parse(colonistWatcherDashboardOpenedAt || "");
  if (!Number.isNaN(lastOpened) && Date.now() - lastOpened < AUTO_OPEN_COOLDOWN_MS) return null;
  await chrome.storage.local.set({
    colonistWatcherDashboardOpenedAt: nowIso(),
    colonistWatcherDashboardOpenReason: reason || "colonist-page",
  });
  const tab = await chrome.tabs.create({ url: dashboardUrl(), active: false });
  if (tab?.id !== undefined) dashboardTabs.add(tab.id);
  return tab;
}

function scheduleDashboardClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(async () => {
    if (activeColonistTabs.size) return;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id !== undefined && isDashboardUrl(tab.url)) {
        try { await chrome.tabs.remove(tab.id); } catch (_error) {}
      }
    }
    dashboardTabs.clear();
    await chrome.storage.local.set({ colonistWatcherDashboardClosedAt: nowIso() });
  }, CLOSE_DELAY_MS);
}

function activateColonistTab(tabId, reason) {
  if (tabId !== undefined) activeColonistTabs.add(tabId);
  clearTimeout(closeTimer);
  chrome.storage.local.set({ colonistWatcherActiveAt: nowIso(), colonistWatcherActiveReason: reason || "colonist-page" });
}

function activateGameDashboard(tabId, reason) {
  activateColonistTab(tabId, reason || "game-activity");
  setTimeout(() => maybeOpenDashboard(reason || "game-activity"), 300);
}

function deactivateColonistTab(tabId) {
  if (tabId !== undefined) activeColonistTabs.delete(tabId);
  if (!activeColonistTabs.size) scheduleDashboardClose();
}

async function reconcileOpenTabs() {
  const tabs = await chrome.tabs.query({});
  activeColonistTabs.clear();
  dashboardTabs.clear();
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    if (isColonistUrl(tab.url)) activeColonistTabs.add(tab.id);
    if (isDashboardUrl(tab.url)) dashboardTabs.add(tab.id);
  }
  if (activeColonistTabs.size) {
    clearTimeout(closeTimer);
    await chrome.storage.local.set({ colonistWatcherActiveAt: nowIso(), colonistWatcherActiveReason: "tab-reconcile" });
  } else if (dashboardTabs.size) {
    scheduleDashboardClose();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender && sender.tab ? sender.tab.id : undefined;
  if (message && message.type === "COLONIST_WATCHER_PAGE_ACTIVE") {
    activateColonistTab(tabId, message.reason);
    sendResponse({ ok: true });
    return false;
  }
  if (message && message.type === "COLONIST_WATCHER_PAGE_INACTIVE") {
    deactivateColonistTab(tabId);
    sendResponse({ ok: true });
    return false;
  }
  if (message && message.type === "COLONIST_WATCHER_LIVE_SNAPSHOT") {
    const snapshot = message.snapshot || {};
    if (snapshot.session?.activeReason === "websocket") activateGameDashboard(tabId, "websocket");
    else activateColonistTab(tabId, snapshot.session?.activeReason || "live-snapshot");
    chrome.storage.local.set({ colonistWatcherLiveSnapshot: snapshot, colonistWatcherLiveSnapshotAt: nowIso() }, () => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  dashboardTabs.delete(tabId);
  deactivateColonistTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab?.url && isDashboardUrl(tab.url)) dashboardTabs.add(tabId);
  if (changeInfo.url && !isColonistUrl(changeInfo.url)) deactivateColonistTab(tabId);
  if (changeInfo.url && isColonistUrl(changeInfo.url)) activateColonistTab(tabId, "tab-url");
  if (tab && tab.url && !isColonistUrl(tab.url) && activeColonistTabs.has(tabId)) deactivateColonistTab(tabId);
});


reconcileOpenTabs();
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(reconcileOpenTabs);
if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(reconcileOpenTabs);
