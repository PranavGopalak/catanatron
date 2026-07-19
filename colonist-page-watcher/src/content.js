const EVENT_LIMIT = 500;
const RAW_LOG_LIMIT = 2000;
const ALL_RAW_LOG_LIMIT = 5000;
const WEBSOCKET_FRAME_LIMIT = 20000;
const RECENT_SIGNATURE_LIMIT = 1200;
const MIN_TEXT_LENGTH = 4;
const MAX_TEXT_LENGTH = 360;
const RECENT_DUPLICATE_MS = 1500;
const MUTATION_SCAN_DELAY_MS = 350;
const STORAGE_FLUSH_DELAY_MS = 600;
const MAX_NODES_PER_SCAN = 80;
const HTML_SNIPPET_LIMIT = 1200;
const DASHBOARD_STREAM_MIN_MS = 1000;
const GAME_START_RESET_DEBOUNCE_MS = 10000;

const seenNodeText = new WeakMap();
const recentSignatures = [];
const recentAllSignatures = [];
const pendingNodes = new Set();
const queuedAllRawLogs = [];
const queuedRawLogs = [];
const queuedEvents = [];
const queuedWebSocketFrames = [];

let scanTimer = null;
let flushTimer = null;
let sequence = 0;
let allSequence = 0;
let webSocketSequence = 0;
let sessionId = null;
let lastDashboardStreamAt = 0;
let lastGameStartResetAt = 0;
let autoResetInFlight = false;

function getCore() {
  return globalThis.ColonistWatcherCore || {
    classifyLine: () => ({ type: "unknown" }),
  };
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function splitLines(text) {
  return String(text || "")
    .split(
      /\n|(?<=\.)\s+(?=[A-Z0-9])|(?<=!)\s+(?=[A-Z0-9])|(?<=\?)\s+(?=[A-Z0-9])/
    )
    .map(normalizeText)
    .filter(
      (line) =>
        line.length >= MIN_TEXT_LENGTH && line.length <= MAX_TEXT_LENGTH
    );
}

function getSessionId() {
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return sessionId;
}

function isNoisyText(line) {
  const lower = line.toLowerCase();
  return (
    /^\d+\s+(?:seconds?|minutes?|hours?|days?)\s+left(?:\s+rotation)?$/i.test(line) ||
    /^\d+\/\d+\s+placements to rank$/i.test(line) ||
    /^karma:\s*\d+\/\d+$/i.test(line) ||
    /notificationsmark all as readno notifications/i.test(line) ||
    /\b(has sent you a friend request|you are now friends with)\b/i.test(line) ||
    /\byou have been reported\b/i.test(line) ||
    /\bplay fair and be respectful\b/i.test(line) ||
    /^(accept|ignore|friends \(\d+\/\d+\)|beginner mode|play vs\.?|bots|easy medium hard|free games|shuffle|game end|well played!)$/i.test(line) ||
    /^(?:this week|rotation|map \/ replay|time:|chat is being monitored)/i.test(line) ||
    /^(?:built|received|moved robber|gave bank|and took|won the game|is blocked by the robber|bot is selecting)\b/i.test(line) ||
    /^(?:1v1|4 player|cities & knights|colonist rush)\b/i.test(line) ||
    /^\d+(?:\s+\d+){1,3}$/.test(line) ||
    lower.includes("cookie") ||
    lower.includes("privacy policy") ||
    lower.includes("terms of service") ||
    lower === "settings" ||
    lower === "profile" ||
    lower === "login" ||
    lower === "log in"
  );
}

function isProbablyPlayerNameOnly(line) {
  return /^[A-Za-z0-9_ -]{2,24}$/.test(line) && !/\s/.test(line);
}

function isGameLikeLine(line) {
  return (
    /\b(rolled|rolls|got|gets|received|receives|gained|gains|built|builds|placed|places|bought|buys|discarded|discards|stole|steals|robber|traded|trades|gave bank|took|won the game|joined|left|turn|development card|longest road|largest army)\b/i.test(line) ||
    /^.+?:\s+\S+/.test(line)
  );
}

function getTrackingDecision(line, source) {
  if (isNoisyText(line)) return { accepted: false, reason: "noise" };
  if (isProbablyPlayerNameOnly(line)) return { accepted: false, reason: "player-name-only" };
  if (!isGameLikeLine(line) && source !== "manual") {
    return { accepted: false, reason: "not-game-like" };
  }
  return { accepted: true, reason: "game-like" };
}

function trimSignatureList(signatures) {
  const cutoff = Date.now() - RECENT_DUPLICATE_MS;
  while (
    signatures.length > RECENT_SIGNATURE_LIMIT ||
    (signatures[0] && signatures[0].createdAt < cutoff)
  ) {
    signatures.shift();
  }
}

function shouldSkipRecentDuplicate(signatures, signature) {
  trimSignatureList(signatures);
  return signatures.some((entry) => entry.signature === signature);
}

function rememberSignature(signatures, signature) {
  signatures.push({ signature, createdAt: Date.now() });
  trimSignatureList(signatures);
}

function isVisibleElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    Number(style.opacity) !== 0
  );
}

function findCandidateContainers(root = document, fallbackToBody = true) {
  const selector = [
    "[class*='log' i]",
    "[class*='chat' i]",
    "[class*='history' i]",
    "[class*='message' i]",
    "[class*='notification' i]",
    "[class*='toast' i]",
    "[id*='log' i]",
    "[id*='chat' i]",
  ].join(", ");
  const matches = Array.from(root.querySelectorAll(selector)).filter(
    isVisibleElement
  );
  if (matches.length) return matches.slice(0, MAX_NODES_PER_SCAN);
  return fallbackToBody ? [document.body] : [];
}

function findRows(container) {
  if (!(container instanceof HTMLElement)) return [];
  const selector = [
    "li",
    "p",
    "[role='listitem']",
    "[class*='message' i]",
    "[class*='entry' i]",
    "[class*='event' i]",
    "[class*='toast' i]",
    "[class*='notification' i]",
  ].join(", ");
  return Array.from(container.querySelectorAll(selector))
    .filter(isVisibleElement)
    .slice(0, MAX_NODES_PER_SCAN);
}

function getAttributeText(element) {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return "";
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("alt"),
    element.getAttribute("title"),
    element.getAttribute("data-tooltip"),
    element.getAttribute("data-tooltip-content"),
    element.getAttribute("data-testid"),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
}

function getSemanticTextForElement(element) {
  const visibleText = normalizeText(element.innerText || element.textContent || "");
  const labels = Array.from(
    element.querySelectorAll("[aria-label], [alt], [title], [data-tooltip], [data-tooltip-content], [data-testid]")
  )
    .map(getAttributeText)
    .filter(Boolean);
  return normalizeText([visibleText, ...labels].join(" "));
}

function getHtmlSnippet(node) {
  if (!(node instanceof HTMLElement)) return undefined;
  return node.outerHTML ? node.outerHTML.slice(0, HTML_SNIPPET_LIMIT) : undefined;
}

function getBestTextForNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }
  if (!isVisibleElement(node)) return "";
  return getSemanticTextForElement(node);
}

function rememberAllLine(line, source, node, decision) {
  const signature = `${source}:${line}`;
  if (shouldSkipRecentDuplicate(recentAllSignatures, signature)) return null;
  rememberSignature(recentAllSignatures, signature);

  const capturedAt = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const rawLog = {
    id,
    sessionId: getSessionId(),
    allSequence: ++allSequence,
    line,
    source,
    url: location.href,
    capturedAt,
    html: getHtmlSnippet(node),
    acceptedForTracker: decision.accepted,
    ignoreReason: decision.accepted ? undefined : decision.reason,
  };

  queuedAllRawLogs.push(rawLog);
  scheduleStorageFlush();
  return rawLog;
}

function rememberLine(line, source = "scan", node = null) {
  const decision = getTrackingDecision(line, source);
  rememberAllLine(line, source, node, decision);
  if (!decision.accepted) return null;

  const signature = line;
  if (shouldSkipRecentDuplicate(recentSignatures, signature)) return null;
  rememberSignature(recentSignatures, signature);

  const parsed = getCore().classifyLine(line);
  const capturedAt = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const rawLog = {
    id,
    sessionId: getSessionId(),
    sequence: ++sequence,
    line,
    source,
    url: location.href,
    capturedAt,
    html: getHtmlSnippet(node),
    parsed,
  };
  const event = {
    id,
    sessionId: rawLog.sessionId,
    sequence: rawLog.sequence,
    line,
    source,
    url: location.href,
    capturedAt,
    ...parsed,
  };

  queuedRawLogs.push(rawLog);
  queuedEvents.push(event);
  scheduleStorageFlush();
  return rawLog;
}

function hasGameStartFrame(frameRecord) {
  const analyzer = globalThis.ColonistWatcherWsCore?.analyzeFrames;
  if (!analyzer) return false;
  try {
    const analysis = analyzer([frameRecord]);
    return Boolean((analysis.events || []).some((event) => event.type === "game_start"));
  } catch (_error) {
    return false;
  }
}

function clearRuntimeQueues() {
  queuedAllRawLogs.splice(0, queuedAllRawLogs.length);
  queuedRawLogs.splice(0, queuedRawLogs.length);
  queuedEvents.splice(0, queuedEvents.length);
  queuedWebSocketFrames.splice(0, queuedWebSocketFrames.length);
  recentSignatures.splice(0, recentSignatures.length);
  recentAllSignatures.splice(0, recentAllSignatures.length);
}

function compactPlayerContext(context = {}) {
  const playersByColor = {};
  for (const [color, player] of Object.entries(context.playersByColor || {})) {
    if (!player?.username) continue;
    playersByColor[color] = {
      selectedColor: Number(player.selectedColor ?? color),
      username: String(player.username),
    };
  }
  return { playersByColor, localColor: context.localColor };
}

function resetForNewGame(callback) {
  if (autoResetInFlight) return;
  autoResetInFlight = true;
  window.clearTimeout(flushTimer);
  const pendingWebSocketFrames = queuedWebSocketFrames.slice();
  clearRuntimeQueues();

  chrome.storage.local.get(
    {
      colonistWebSocketFrames: [],
      colonistWatcherLocalPlayerName: "KabaliKhan",
      colonistWatcherPlayerContext: null,
    },
    ({ colonistWebSocketFrames, colonistWatcherLocalPlayerName, colonistWatcherPlayerContext }) => {
      let playerContext = { playersByColor: {} };
      try {
        const analysis = globalThis.ColonistWatcherWsCore?.analyzeFrames(
          [...pendingWebSocketFrames, ...(colonistWebSocketFrames || [])],
          {
            localPlayerName: colonistWatcherLocalPlayerName,
            playersByColor: {},
          }
        );
        if (analysis?.context) playerContext = compactPlayerContext(analysis.context);
      } catch (_error) {}

      playerContext = { playersByColor: {} };
      sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sequence = 0;
      allSequence = 0;
      webSocketSequence = 0;
      lastDashboardStreamAt = 0;
      lastGameStartResetAt = Date.now();
      const resetAt = new Date().toISOString();
      chrome.storage.local.set(
        {
          colonistAllRawLogs: [],
          colonistEvents: [],
          colonistRawLogs: [],
          colonistWebSocketFrames: [],
          colonistWatcherPlayerContext: playerContext,
          colonistWatcherSessionId: sessionId,
          colonistWatcherSequence: 0,
          colonistWatcherAllSequence: 0,
          colonistWatcherWebSocketSequence: 0,
          colonistWatcherLastFlushAt: null,
          colonistWatcherAutoResetAt: resetAt,
          colonistWatcherAutoResetReason: "game-start",
          colonistWatcherActiveAt: resetAt,
          colonistWatcherActiveReason: "game-start",
          colonistWatcherActiveUrl: location.href,
        },
        () => {
          autoResetInFlight = false;
          if (typeof callback === "function") callback();
        }
      );
    }
  );
}

function enqueueWebSocketFrame(frame) {
  updateWatcherHeartbeat("websocket");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  queuedWebSocketFrames.push({
    id,
    sessionId: getSessionId(),
    webSocketSequence: ++webSocketSequence,
    pageUrl: location.href,
    ...frame,
  });
  scheduleStorageFlush();
}

function rememberWebSocketFrame(frame) {
  const preview = {
    id: "preview",
    sessionId: getSessionId(),
    webSocketSequence: webSocketSequence + 1,
    pageUrl: location.href,
    ...frame,
  };
  if (hasGameStartFrame(preview) && Date.now() - lastGameStartResetAt > GAME_START_RESET_DEBOUNCE_MS) {
    resetForNewGame(() => enqueueWebSocketFrame(frame));
    return;
  }
  enqueueWebSocketFrame(frame);
}

function rememberTextBlock(text, source) {
  for (const line of splitLines(text)) {
    rememberLine(line, source);
  }
}

function scanNode(node, source = "mutation") {
  const text = normalizeText(getBestTextForNode(node));
  if (!text || text.length < MIN_TEXT_LENGTH) return;

  if (node instanceof HTMLElement) {
    const previousText = seenNodeText.get(node);
    if (previousText === text) return;
    seenNodeText.set(node, text);
  }

  for (const line of splitLines(text)) {
    rememberLine(line, source, node);
  }
}

function scanContainer(container, source) {
  const rows = findRows(container);
  if (rows.length) {
    for (const row of rows) {
      scanNode(row, "row");
    }
    return;
  }
  scanNode(container, source);
}

function scanVisibleText() {
  const containers = findCandidateContainers();
  for (const container of containers) {
    scanContainer(container, "container");
  }
}

function scanPendingNodes() {
  const nodes = Array.from(pendingNodes).slice(0, MAX_NODES_PER_SCAN);
  pendingNodes.clear();

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      scanNode(node, "text");
      continue;
    }

    if (!(node instanceof HTMLElement)) continue;
    scanNode(node, "added");

    for (const container of findCandidateContainers(node, false)) {
      scanContainer(container, "added-container");
    }
  }

  scanVisibleText();
}

function scheduleMutationScan() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scanPendingNodes, MUTATION_SCAN_DELAY_MS);
}

function scheduleStorageFlush() {
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flushQueuedLogs, STORAGE_FLUSH_DELAY_MS);
}

function notifyDashboardActive(reason) {
  chrome.runtime.sendMessage({ type: "COLONIST_WATCHER_PAGE_ACTIVE", reason }, () => {});
}

function streamLiveSnapshot(snapshot) {
  const now = Date.now();
  if (now - lastDashboardStreamAt < DASHBOARD_STREAM_MIN_MS) return;
  lastDashboardStreamAt = now;
  chrome.runtime.sendMessage({ type: "COLONIST_WATCHER_LIVE_SNAPSHOT", snapshot }, () => {});
}

function buildLiveSnapshot({
  rawLogs = [],
  allRawLogs = [],
  webSocketFrames = [],
  parsedEvents = [],
  flushedAt = new Date().toISOString(),
  activeReason = "heartbeat",
} = {}) {
  return {
    exportedAt: flushedAt,
    source: "extension-live",
    localPlayerName: "",
    session: {
      sessionId: getSessionId(),
      sequence,
      allSequence,
      webSocketSequence,
      lastFlushAt: flushedAt,
      activeAt: flushedAt,
      activeReason,
      activeUrl: location.href,
    },
    rawLogs,
    allRawLogs,
    webSocketFrames,
    parsedEvents,
  };
}

function updateWatcherHeartbeat(reason) {
  chrome.storage.local.set({
    colonistWatcherActiveAt: new Date().toISOString(),
    colonistWatcherActiveReason: reason,
    colonistWatcherActiveUrl: location.href,
    colonistWatcherSessionId: getSessionId(),
  });
}

function flushQueuedLogs() {
  if (!queuedAllRawLogs.length && !queuedRawLogs.length && !queuedEvents.length && !queuedWebSocketFrames.length) return;

  const allRawBatch = queuedAllRawLogs.splice(0, queuedAllRawLogs.length);
  const rawBatch = queuedRawLogs.splice(0, queuedRawLogs.length);
  const eventBatch = queuedEvents.splice(0, queuedEvents.length);
  const webSocketBatch = queuedWebSocketFrames.splice(0, queuedWebSocketFrames.length);

  chrome.storage.local.get(
    {
      colonistAllRawLogs: [],
      colonistEvents: [],
      colonistRawLogs: [],
      colonistWebSocketFrames: [],
      colonistWatcherSessionId: null,
    },
    ({ colonistAllRawLogs, colonistEvents, colonistRawLogs, colonistWebSocketFrames, colonistWatcherSessionId }) => {
      if (colonistWatcherSessionId && !sessionId) {
        sessionId = colonistWatcherSessionId;
      }
      const nextAllRawLogs = [...allRawBatch, ...colonistAllRawLogs].slice(0, ALL_RAW_LOG_LIMIT);
      const nextEvents = [...eventBatch, ...colonistEvents].slice(0, EVENT_LIMIT);
      const nextRawLogs = [...rawBatch, ...colonistRawLogs].slice(0, RAW_LOG_LIMIT);
      const nextWebSocketFrames = [...webSocketBatch, ...colonistWebSocketFrames].slice(0, WEBSOCKET_FRAME_LIMIT);
      const flushedAt = new Date().toISOString();
      const activeReason = webSocketBatch.length ? "websocket" : "flush";
      const snapshot = buildLiveSnapshot({
        rawLogs: nextRawLogs,
        allRawLogs: nextAllRawLogs,
        webSocketFrames: nextWebSocketFrames,
        parsedEvents: nextEvents,
        flushedAt,
        activeReason,
      });
      chrome.storage.local.get({ colonistWatcherLocalPlayerName: "KabaliKhan" }, ({ colonistWatcherLocalPlayerName }) => {
        snapshot.localPlayerName = colonistWatcherLocalPlayerName || "KabaliKhan";
        streamLiveSnapshot(snapshot);
      });
      chrome.storage.local.set({
        colonistAllRawLogs: nextAllRawLogs,
        colonistEvents: nextEvents,
        colonistRawLogs: nextRawLogs,
        colonistWebSocketFrames: nextWebSocketFrames,
        colonistWatcherSessionId: getSessionId(),
        colonistWatcherLastFlushAt: flushedAt,
        colonistWatcherActiveAt: flushedAt,
        colonistWatcherActiveReason: activeReason,
        colonistWatcherActiveUrl: location.href,
        colonistWatcherSequence: sequence,
        colonistWatcherAllSequence: allSequence,
        colonistWatcherWebSocketSequence: webSocketSequence,
      });
    }
  );
}

let domWatcherStarted = false;

function startDomWatcher() {
  if (domWatcherStarted || !document.body) return;
  domWatcherStarted = true;
  scanVisibleText();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        pendingNodes.add(mutation.target);
      }
      for (const node of mutation.addedNodes) {
        pendingNodes.add(node);
      }
    }
    scheduleMutationScan();
  });

  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function startWatching() {
  notifyDashboardActive("colonist-page");
  injectWebSocketHook();

  chrome.storage.local.get(
    { colonistWatcherSessionId: null, colonistWatcherSequence: 0, colonistWatcherAllSequence: 0, colonistWatcherWebSocketSequence: 0 },
    ({ colonistWatcherSessionId, colonistWatcherSequence, colonistWatcherAllSequence, colonistWatcherWebSocketSequence }) => {
      sessionId = colonistWatcherSessionId || getSessionId();
      sequence = Number(colonistWatcherSequence || 0);
      allSequence = Number(colonistWatcherAllSequence || 0);
      webSocketSequence = Number(colonistWatcherWebSocketSequence || 0);
      chrome.storage.local.set({ colonistWatcherSessionId: sessionId });
      updateWatcherHeartbeat("start");
    }
  );

  if (document.body) {
    startDomWatcher();
  } else {
    document.addEventListener("DOMContentLoaded", startDomWatcher, { once: true });
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "COLONIST_WATCHER_WS") return;
  rememberWebSocketFrame(event.data.frame || {});
});

function injectWebSocketHook() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("src/page-websocket-hook.js");
  script.async = false;
  script.onload = () => script.remove();
  (document.documentElement || document.head || document.body).append(script);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.colonistWatcherSessionId?.newValue) return;
  const nextSessionId = changes.colonistWatcherSessionId.newValue;
  if (nextSessionId === sessionId) return;
  window.clearTimeout(flushTimer);
  clearRuntimeQueues();
  sessionId = nextSessionId;
  sequence = 0;
  allSequence = 0;
  webSocketSequence = 0;
  lastDashboardStreamAt = 0;
  lastGameStartResetAt = 0;
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "COLONIST_WATCHER_SCAN") {
    updateWatcherHeartbeat("scan");
    scanVisibleText();
    flushQueuedLogs();
    sendResponse({ ok: true, sessionId: getSessionId(), sequence, allSequence, webSocketSequence });
  }
});

window.addEventListener("beforeunload", () => {
  flushQueuedLogs();
  chrome.runtime.sendMessage({ type: "COLONIST_WATCHER_PAGE_INACTIVE" }, () => {});
});
startWatching();