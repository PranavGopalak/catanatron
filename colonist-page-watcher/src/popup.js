const eventsList = document.getElementById("events");
const statusText = document.getElementById("status");
const filterSelect = document.getElementById("filter");
const newGameButton = document.getElementById("newGame");
const scanButton = document.getElementById("scan");
const openDashboardButton = document.getElementById("openDashboard");
const copyReportButton = document.getElementById("copyReport");
const copyRawButton = document.getElementById("copyRaw");
const exportLogsButton = document.getElementById("exportLogs");
const coverageTitle = document.getElementById("coverageTitle");
const coverageDetails = document.getElementById("coverageDetails");
const trackerStatus = document.getElementById("trackerStatus");
const trackerPlayers = document.getElementById("trackerPlayers");
const patternCandidates = document.getElementById("patternCandidates");
const captureHealth = document.getElementById("captureHealth");
const localPlayerNameInput = document.getElementById("localPlayerName");
const popupVersion = document.getElementById("popupVersion");
popupVersion.textContent = `v${chrome.runtime.getManifest().version}`;
const calibrationStatus = document.getElementById("calibrationStatus");
const calibrationHand = document.getElementById("calibrationHand");
const calibrationDeltaStatus = document.getElementById("calibrationDeltaStatus");
const calibrationDelta = document.getElementById("calibrationDelta");
const resourceMapStatus = document.getElementById("resourceMapStatus");
const resourceMapSuggestion = document.getElementById("resourceMapSuggestion");
const applyResourceMapSuggestionButton = document.getElementById("applyResourceMapSuggestion");
const resourceMapInputs = {
  card_1: document.getElementById("resourceMapCard1"),
  card_2: document.getElementById("resourceMapCard2"),
  card_3: document.getElementById("resourceMapCard3"),
  card_4: document.getElementById("resourceMapCard4"),
  card_5: document.getElementById("resourceMapCard5"),
};

const core = globalThis.ColonistWatcherCore;
const wsCore = globalThis.ColonistWatcherWsCore;
if (!core) {
  throw new Error("ColonistWatcherCore did not load before popup.js");
}
if (!wsCore) {
  throw new Error("ColonistWatcherWsCore did not load before popup.js");
}

const CARD_KEYS = ["card_1", "card_2", "card_3", "card_4", "card_5"];
const RESOURCE_NAMES = ["lumber", "brick", "wool", "grain", "ore"];
const DEFAULT_RESOURCE_MAP = {
  card_1: "lumber",
  card_2: "brick",
  card_3: "wool",
  card_4: "grain",
  card_5: "ore",
};

const RESOURCE_LABELS = {  brick: "Brick",
  lumber: "Lumber",
  ore: "Ore",
  grain: "Grain",
  wool: "Wool",
  card_1: "Card 1",
  card_2: "Card 2",
  card_3: "Card 3",
  card_4: "Card 4",
  card_5: "Card 5",
};

const counters = {
  rollCount: document.getElementById("rollCount"),
  gainCount: document.getElementById("gainCount"),
  tradeCount: document.getElementById("tradeCount"),
  buildCount: document.getElementById("buildCount"),
};

let latestEvents = [];
let latestRawLogs = [];
let latestAllRawLogs = [];
let latestWebSocketFrames = [];
let latestTracker = core.createTrackerState();
let latestWebSocketAnalysis = { events: [], tracker: { players: {}, trackableEvents: 0, uncertainEvents: 0 } };
let latestSession = {};
let latestLocalPlayerName = "KabaliKhan";
let latestResourceMap = { ...DEFAULT_RESOURCE_MAP };
let latestResourceMapSuggestion = null;

function formatType(type) {
  return String(type || "unknown").replaceAll("_", " ");
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function countBuilds(events) {
  return events.filter((event) => event.type?.startsWith("build_")).length;
}

function countTrades(events) {
  return events.filter((event) =>
    ["player_trade", "bank_trade", "trade"].includes(event.type)
  ).length;
}

function cleanResourceMap(value) {
  const next = { ...DEFAULT_RESOURCE_MAP };
  for (const card of CARD_KEYS) {
    const mapped = value?.[card];
    next[card] = RESOURCE_NAMES.includes(mapped) ? mapped : card;
  }
  return next;
}

function mappedResourceName(resource) {
  return latestResourceMap[resource] || resource;
}

function resourceLabel(resource) {
  const mapped = mappedResourceName(resource);
  return RESOURCE_LABELS[mapped] || RESOURCE_LABELS[resource] || resource;
}

function resourceClass(resource) {
  return mappedResourceName(resource).replace(/[^a-z0-9_-]/gi, "_");
}

function mapCounts(counts = {}) {
  const mapped = {};
  for (const [resource, amount] of Object.entries(counts || {})) {
    const name = mappedResourceName(resource);
    mapped[name] = (mapped[name] || 0) + amount;
  }
  return mapped;
}

function mapTrackerResources(tracker) {
  const players = {};
  for (const [key, player] of Object.entries(tracker.players || {})) {
    const resources = mapCounts(player.resources || player.cards || {});
    players[key] = {
      ...player,
      resources,
      cards: resources,
      knownCards: Object.values(resources).reduce((total, amount) => total + amount, 0),
    };
  }
  return { ...tracker, players };
}

function refreshKnownCards(player) {
  player.knownCards = Object.values(player.resources).reduce((total, amount) => total + amount, 0);
  if (Array.isArray(player.hiddenCards)) {
    player.uncertainty = (player.otherUncertainty || 0) + player.hiddenCards.filter((card) => !card.resolvedAs).length;
  }
}

function addHiddenCard(player, event) {
  if (!player) return;
  if (!Array.isArray(player.hiddenCards)) player.hiddenCards = [];
  if (!Array.isArray(player.resolvedHiddenCards)) player.resolvedHiddenCards = [];
  const count = event.hiddenCount || 1;
  for (let index = 0; index < count; index += 1) {
    player.hiddenCards.push({
      id: `hidden-${event.messageSequence || event.frameSequence || event.logId || "event"}-${index}`,
      source: "steal",
      from: event.victim,
      candidates: RESOURCE_NAMES.slice(),
      resolvedAs: null,
    });
  }
  refreshKnownCards(player);
}

function resolveForcedHiddenForCost(player, cost) {
  if (!player?.hiddenCards?.length) return;
  const deficits = Object.entries(cost || {})
    .map(([resource, amount]) => [resource, Math.max(0, amount - (player.resources[resource] || 0))])
    .filter(([, amount]) => amount > 0);
  const deficitTotal = deficits.reduce((total, [, amount]) => total + amount, 0);
  if (deficitTotal !== 1 || deficits.length !== 1) return;
  const [resource] = deficits[0];
  const eligible = player.hiddenCards.filter((card) => !card.resolvedAs && card.candidates.includes(resource));
  if (eligible.length !== 1) return;
  eligible[0].resolvedAs = resource;
  player.resources[resource] = (player.resources[resource] || 0) + 1;
  player.resolvedHiddenCards.push({ ...eligible[0] });
  refreshKnownCards(player);
}

function getMappedTrackerPlayer(state, name) {
  if (!name) return null;
  if (!state.players[name]) {
    state.players[name] = {
      name,
      resources: core.createTrackerState().players?.[name]?.resources || core.RESOURCE_NAMES.reduce((items, resource) => {
        items[resource] = 0;
        return items;
      }, {}),
      knownCards: 0,
      uncertainty: 0,
      otherUncertainty: 0,
      hiddenCards: [],
      resolvedHiddenCards: [],
      devCardsBought: 0,
      devCardsPlayed: 0,
    };
  }
  return state.players[name];
}

function addMappedCounts(player, counts, multiplier) {
  if (!player) return;
  const mapped = mapCounts(counts);
  for (const [resource, amount] of Object.entries(mapped)) {
    player.resources[resource] = Math.max(0, (player.resources[resource] || 0) + amount * multiplier);
  }
  refreshKnownCards(player);
}

function subtractBuildCost(player, eventType) {
  if (!player) return;
  const cost = core.BUILD_COSTS?.[eventType];
  if (!cost) return;
  resolveForcedHiddenForCost(player, cost);
  for (const [resource, amount] of Object.entries(cost)) {
    player.resources[resource] = Math.max(0, (player.resources[resource] || 0) - amount);
  }
  refreshKnownCards(player);
}

function buildMappedWebSocketTracker(events) {
  const state = { players: {}, trackableEvents: 0, uncertainEvents: 0, unassignedEvents: 0 };
  for (const event of events || []) {
    const player = getMappedTrackerPlayer(state, event.player);
    if (event.type === "resource_gain") {
      state.trackableEvents += 1;
      addMappedCounts(player, event.cards, 1);
      continue;
    }
    if (event.type === "resource_loss" || event.type === "discard") {
      state.trackableEvents += 1;
      addMappedCounts(player, event.cards, -1);
      continue;
    }
    if (event.type === "bank_trade") {
      state.trackableEvents += 1;
      addMappedCounts(player, event.givenCards, -1);
      addMappedCounts(player, event.receivedCards, 1);
      continue;
    }
    if (event.type === "player_trade") {
      state.trackableEvents += 1;
      addMappedCounts(player, event.givenCards, -1);
      addMappedCounts(player, event.receivedCards, 1);
      const other = getMappedTrackerPlayer(state, event.otherPlayer);
      addMappedCounts(other, event.receivedCards, -1);
      addMappedCounts(other, event.givenCards, 1);
      continue;
    }
    if (event.type === "steal") {
      state.trackableEvents += 1;
      state.uncertainEvents += 1;
      addHiddenCard(player, event);
      const victim = getMappedTrackerPlayer(state, event.victim);
      if (victim) {
        victim.otherUncertainty = (victim.otherUncertainty || 0) + (event.hiddenCount || 1);
        refreshKnownCards(victim);
      }
      continue;
    }
    if (core.BUILD_COSTS?.[event.type]) {
      state.trackableEvents += 1;
      const isFreeProtocolBuild = event.type?.startsWith("build_") && event.raw?.type !== 5;
      if (!isFreeProtocolBuild) subtractBuildCost(player, event.type);
      if (event.type === "development_card_bought" && player) player.devCardsBought += 1;
      continue;
    }
    if (event.type === "development_card_played") {
      state.trackableEvents += 1;
      if (player) player.devCardsPlayed += 1;
    }
  }
  for (const player of Object.values(state.players)) refreshKnownCards(player);
  return state;
}

function trackerForWebSocketAnalysis(wsAnalysis) {
  if (!wsAnalysis.events.length) return null;
  return hasUnmappedProtocolCards() ? wsAnalysis.tracker : buildMappedWebSocketTracker(wsAnalysis.events);
}
function hasUnmappedProtocolCards() {
  return CARD_KEYS.some((card) => latestResourceMap[card] === card);
}

function renderResourceMapControls() {
  for (const card of CARD_KEYS) {
    if (resourceMapInputs[card]) resourceMapInputs[card].value = latestResourceMap[card] || card;
  }
  const mappedCount = CARD_KEYS.filter((card) => latestResourceMap[card] !== card).length;
  resourceMapStatus.textContent = mappedCount === CARD_KEYS.length
    ? "Resource names mapped"
    : `${mappedCount}/5 mapped`;
}

function renderDiagnostics(events, rawLogs) {
  const summary = core.summarizeEvents(events, rawLogs);
  const unknownPercent = Math.round(summary.unknownRate * 100);

  if (!summary.rawTotal && events.length) {
    coverageTitle.textContent = "WebSocket tracker evidence captured";
    coverageDetails.textContent = `${events.length} decoded WebSocket game events. DOM tracker logs are empty, but protocol capture is enough for the card tracker.`;
    return;
  }

  if (!summary.rawTotal) {
    coverageTitle.textContent = "No raw logs captured yet";
    coverageDetails.textContent = "Open or refresh a Colonist game tab and play a few visible actions.";
    return;
  }

  coverageTitle.textContent = summary.enough
    ? "Enough logs for first tracker patterns"
    : "Still collecting tracker evidence";

  const missingText = summary.missingGroups.length
    ? `Missing: ${summary.missingGroups.slice(0, 4).join(", ")}.`
    : "Core event groups are present.";

  coverageDetails.textContent = `${summary.rawTotal} raw logs, ${unknownPercent}% unknown after parsing, ${summary.coveredGroups}/8 event groups. ${missingText}`;
}

function normalizeTrackerForRender(tracker, sourceLabel) {
  const players = Object.values(tracker.players || {}).map((player) => ({
    name: player.name,
    knownCards: player.knownCards || 0,
    resources: mapCounts(player.resources || player.cards || {}),
    devCardsBought: player.devCardsBought || 0,
    devCardsPlayed: player.devCardsPlayed || 0,
    uncertainty: player.uncertainty || 0,
    hiddenCards: player.hiddenCards || [],
    resolvedHiddenCards: player.resolvedHiddenCards || [],
  }));
  return {
    players,
    sourceLabel,
    trackableEvents: tracker.trackableEvents || 0,
    uncertainEvents: tracker.uncertainEvents || 0,
  };
}

function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const result = [];
  for (let index = 0; index < items.length; index += 1) {
    const head = items[index];
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([head, ...tail]);
  }
  return result;
}

function resourceMapFromOrder(order) {
  return Object.fromEntries(CARD_KEYS.map((card, index) => [card, order[index]]));
}

function withResourceMap(resourceMap, callback) {
  const previous = latestResourceMap;
  latestResourceMap = cleanResourceMap(resourceMap);
  try {
    return callback();
  } finally {
    latestResourceMap = previous;
  }
}

function scoreDelta(delta) {
  return Object.values(delta || {}).reduce((total, amount) => total + Math.abs(amount), 0);
}

function formatResourceMap(resourceMap) {
  return CARD_KEYS.map((card) => `${RESOURCE_LABELS[card]}=${RESOURCE_LABELS[resourceMap[card]] || resourceMap[card]}`).join(", ");
}

function suggestResourceMaps(events, hand, limit = 3) {
  if (!hand?.total || !events?.length) return [];
  return permutations(RESOURCE_NAMES).map((order) => {
    const resourceMap = resourceMapFromOrder(order);
    return withResourceMap(resourceMap, () => {
      const tracker = buildMappedWebSocketTracker(events);
      const actual = mapCounts(hand.cards);
      const estimate = tracker.players?.[hand.player]?.resources || {};
      const delta = diffCounts(actual, estimate);
      return { resourceMap, score: scoreDelta(delta), delta };
    });
  }).sort((a, b) => a.score - b.score || formatResourceMap(a.resourceMap).localeCompare(formatResourceMap(b.resourceMap))).slice(0, limit);
}

function renderResourceMapSuggestion(_wsAnalysis) {
  latestResourceMapSuggestion = null;
  applyResourceMapSuggestionButton.disabled = true;
  resourceMapSuggestion.textContent = `Verified. ${formatResourceMap(DEFAULT_RESOURCE_MAP)}`;
}

function diffCounts(actual, estimate) {  const diff = {};
  for (const resource of new Set([...Object.keys(actual || {}), ...Object.keys(estimate || {})])) {
    const value = (actual?.[resource] || 0) - (estimate?.[resource] || 0);
    if (value) diff[resource] = value;
  }
  return diff;
}

function renderDeltaChips(container, counts) {
  container.innerHTML = "";
  for (const resource of Object.keys(counts || {}).sort()) {
    const chip = document.createElement("div");
    chip.className = `resource-chip ${resourceClass(resource)}`;
    const value = counts[resource] || 0;
    chip.innerHTML = `<span>${resourceLabel(resource)}</span><strong>${value > 0 ? "+" : ""}${value}</strong>`;
    container.append(chip);
  }
}
function renderResourceChips(container, counts) {
  container.innerHTML = "";
  const resourceNames = Object.keys(counts || {}).length ? Object.keys(counts).sort() : core.RESOURCE_NAMES;
  for (const resource of resourceNames) {
    const chip = document.createElement("div");
    chip.className = `resource-chip ${resourceClass(resource)}`;
    chip.innerHTML = `<span>${resourceLabel(resource)}</span><strong>${counts?.[resource] || 0}</strong>`;
    container.append(chip);
  }
}

function renderCalibrationHand(localHand, fallbackHand) {
  const hand = localHand?.total ? localHand : fallbackHand;
  if (!hand || !hand.total) {
    calibrationStatus.textContent = "Waiting for your hand snapshot";
    calibrationHand.innerHTML = "";
    calibrationDeltaStatus.textContent = "Tracker check waits for mapped hand data.";
    calibrationDelta.innerHTML = "";
    return;
  }
  const timeLabel = hand.capturedAt ? formatTime(hand.capturedAt) : "latest";
  const playerName = hand.player || latestLocalPlayerName;
  const actualCounts = mapCounts(hand.cards);
  const trackerCounts = latestTracker.players?.[playerName]?.resources || latestTracker.players?.[playerName]?.cards || {};
  const delta = diffCounts(actualCounts, trackerCounts);
  calibrationStatus.textContent = `${playerName}: ${hand.total} cards at ${timeLabel}`;
  renderResourceChips(calibrationHand, actualCounts);
  if (!Object.keys(trackerCounts).length) {
    calibrationDeltaStatus.textContent = "Tracker check waits for this player in tracker.";
    calibrationDelta.innerHTML = "";
    return;
  }
  if (!Object.keys(delta).length) {
    calibrationDeltaStatus.textContent = "Tracker check: matches latest hand.";
    calibrationDelta.innerHTML = "";
    return;
  }
  calibrationDeltaStatus.textContent = "Tracker check delta: actual minus tracker.";
  renderDeltaChips(calibrationDelta, delta);
}
function renderTracker(tracker, sourceLabel = "DOM") {
  const displayTracker = mapTrackerResources(tracker);
  latestTracker = displayTracker;
  const normalized = normalizeTrackerForRender(displayTracker, sourceLabel);
  const players = normalized.players.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const labelNote = sourceLabel === "WebSocket" && hasUnmappedProtocolCards() ? " Some card labels are still protocol IDs." : "";
  trackerStatus.textContent = players.length
    ? `${sourceLabel}: ${players.length} players, ${normalized.trackableEvents} trackable events, ${normalized.uncertainEvents} uncertain.${labelNote}`
    : "Waiting for parsed resource/build events.";

  trackerPlayers.innerHTML = "";

  if (!players.length) {
    const empty = document.createElement("div");
    empty.className = "tracker-empty";
    empty.textContent = "Raw logs are being saved. Card estimates appear after rolls or builds are parsed.";
    trackerPlayers.append(empty);
    return;
  }

  for (const player of players) {
    const row = document.createElement("article");
    row.className = "player-track";

    const header = document.createElement("div");
    header.className = "player-track__header";
    header.innerHTML = `<strong>${player.name}</strong><span>${player.knownCards} known cards</span>`;

    const resources = document.createElement("div");
    resources.className = "resource-grid";
    renderResourceChips(resources, player.resources);

    const meta = document.createElement("div");
    meta.className = "tracker-meta";
    const resolvedHidden = player.resolvedHiddenCards?.length || 0;
    meta.textContent = `Dev bought ${player.devCardsBought}, played ${player.devCardsPlayed}, uncertainty ${player.uncertainty}, resolved hidden ${resolvedHidden}`;

    row.append(header, resources, meta);
    trackerPlayers.append(row);
  }
}

function countCardsInEvents(events) {
  return (events || []).reduce((total, event) =>
    total + Object.values(event.cards || {}).reduce((sum, amount) => sum + amount, 0),
    0
  );
}

function summarizeBuildPaymentSignals(events) {
  const builds = (events || []).filter((event) => event.type?.startsWith("build_"));
  return {
    total: builds.length,
    paid: builds.filter((event) => event.raw?.type === 5).length,
    free: builds.filter((event) => event.raw?.type === 4).length,
    unknown: builds.filter((event) => event.raw?.type !== 4 && event.raw?.type !== 5).length,
  };
}

function buildReport(events, rawLogs, allRawLogs = latestAllRawLogs, webSocketFrames = latestWebSocketFrames) {
  const summary = core.summarizeEvents(events, rawLogs);
  const tracker = core.buildTracker(events, { localPlayerName: latestLocalPlayerName });
  const reportWsAnalysis = wsCore.analyzeFrames(webSocketFrames, { localPlayerName: latestLocalPlayerName, rawLogs: allRawLogs });
  const recentUnknown = events
    .filter((event) => event.type === "unknown")
    .slice(0, 30)
    .map((event) => event.line);
  const recentRaw = rawLogs.slice(0, 50).map((log) => log.line);
  const reportWsTracker = trackerForWebSocketAnalysis(reportWsAnalysis);
  const reportTracker = reportWsTracker || tracker;
  const playerSummaries = Object.values(reportTracker.players).map((player) => ({
    name: player.name,
    resources: mapCounts(player.resources || player.cards || {}),
    knownCards: player.knownCards,
    devCardsBought: player.devCardsBought,
    devCardsPlayed: player.devCardsPlayed,
    uncertainty: player.uncertainty,
  }));
  const buildSignals = summarizeBuildPaymentSignals(reportWsAnalysis.events);
  const distributionEvents = reportWsAnalysis.distributionEvents || [];
  const distributionCards = countCardsInEvents(distributionEvents);

  return [
    "Colonist Watcher Diagnostics",
    `Session: ${latestSession.sessionId || "unknown"}`,
    `Last sequence: ${latestSession.sequence || 0}`,
    `Tracker raw logs: ${summary.rawTotal}`,
    `All captured text rows: ${allRawLogs.length}`,
    `WebSocket frames: ${webSocketFrames.length}`,
    `WebSocket events: ${reportWsAnalysis.events.length}`,
    `WebSocket direct resource distributions: ${distributionEvents.length} events / ${distributionCards} cards`,
    `WebSocket build signals: paid=${buildSignals.paid}, free=${buildSignals.free}, unknown=${buildSignals.unknown}`,
    `Parsed events: ${summary.total}`,
    `Known events: ${summary.knownCount}`,
    `Unknown events: ${summary.unknownCount}`,
    `Unknown rate: ${Math.round(summary.unknownRate * 100)}%`,
    `Covered groups: ${summary.coveredGroups}/8`,
    `Enough raw evidence: ${summary.enoughRawEvidence ? "yes" : "no"}`,
    `Enough for first tracker patterns: ${summary.enough ? "yes" : "no"}`,
    `By type: ${JSON.stringify(summary.byType)}`,
    `Missing groups: ${summary.missingGroups.join(", ") || "none"}`,
    `Tracker: ${JSON.stringify(playerSummaries)}`,
    "",
    "Recent unknown parsed lines:",
    recentUnknown.join("\n") || "none",
    "",
    "Recent raw lines:",
    recentRaw.join("\n") || "none",
  ].join("\n");
}


function buildRawText(rawLogs) {
  const chronological = (rawLogs || []).slice().sort((a, b) => {
    const aSeq = Number(a.sequence || 0);
    const bSeq = Number(b.sequence || 0);
    if (aSeq || bSeq) return aSeq - bSeq;
    return Date.parse(a.capturedAt || "") - Date.parse(b.capturedAt || "");
  });

  return [
    "Colonist Watcher Raw Logs",
    `Session: ${latestSession.sessionId || "unknown"}`,
    `Last sequence: ${latestSession.sequence || 0}`,
    `Raw logs: ${chronological.length}`,
    "",
    ...chronological.map((log) => `#${log.sequence || "?"} ${log.capturedAt || ""} ${log.line}`),
  ].join("\n");
}
function formatCardsForLine(cards) {
  return Object.entries(cards || {})
    .flatMap(([card, amount]) => Array.from({ length: amount }, () => resourceLabel(card)))
    .join(" ");
}

function describeEvent(event) {
  if (!event) return "";
  if (event.line) return event.line;
  if (event.type === "dice_roll") return `${event.player || "Unknown"} rolled ${(event.dice || []).join("+") || event.value || "?"}`;
  if (event.type === "resource_gain") return `${event.player || "Unknown"} got ${formatCardsForLine(event.cards) || "cards"}`;
  if (event.type === "resource_loss" || event.type === "discard") return `${event.player || "Unknown"} lost ${formatCardsForLine(event.cards) || "cards"}`;
  if (event.type === "player_trade" || event.type === "bank_trade") return `${event.player || "Unknown"} traded ${formatCardsForLine(event.givenCards) || "cards"} for ${formatCardsForLine(event.receivedCards) || "cards"}`;
  if (event.type?.startsWith("build_")) return `${event.player || "Unknown"} built ${event.piece || event.type.replace("build_", "")}`;
  if (event.type === "steal") return `${event.player || "Unknown"} stole from ${event.victim || "unknown"}`;
  if (event.type === "development_card_played") return `${event.player || "Unknown"} played ${event.developmentCard || "development card"}`;
  return formatType(event.type);
}

function makeEventItem(event) {
  const item = document.createElement("li");
  item.className = "event";
  item.dataset.type = event.type || "unknown";

  const meta = document.createElement("div");
  meta.className = "event-type";
  meta.innerHTML = `<span>${formatType(event.type)}</span><time>${formatTime(event.capturedAt)}</time>`;

  const line = document.createElement("div");
  line.className = "event-line";
  line.textContent = describeEvent(event);

  item.append(meta, line);
  return item;
}

function formatWebSocketPayload(frame) {
  if (frame.text) return frame.text;
  if (frame.base64) return `[${frame.kind || "binary"} base64 ${frame.base64.length} chars] ${frame.base64.slice(0, 180)}`;
  return frame.kind || "frame";
}

function makeWebSocketItem(frame) {
  const item = document.createElement("li");
  item.className = "event";
  item.dataset.type = "websocket";

  const meta = document.createElement("div");
  meta.className = "event-type";
  meta.innerHTML = `<span>ws #${frame.webSocketSequence || "?"} / ${frame.direction || "?"} / ${frame.kind || "event"}</span><time>${formatTime(frame.capturedAt)}</time>`;

  const line = document.createElement("div");
  line.className = "event-line";
  line.textContent = `${frame.url || frame.pageUrl || ""} ${formatWebSocketPayload(frame)}`.trim();

  item.append(meta, line);
  return item;
}

function makeRawLogItem(log) {
  const item = document.createElement("li");
  item.className = "event";
  item.dataset.type = "raw";

  const meta = document.createElement("div");
  meta.className = "event-type";
  meta.innerHTML = `<span>raw #${log.sequence || "?"} / ${log.source || "unknown"}</span><time>${formatTime(log.capturedAt)}</time>`;

  const line = document.createElement("div");
  line.className = "event-line";
  line.textContent = log.line;

  item.append(meta, line);
  return item;
}

function deriveEvents(rawLogs, storedEvents) {
  return rawLogs.length ? core.eventsFromRawLogs(rawLogs) : storedEvents;
}

function renderCaptureHealth(rawLogs, allRawLogs, webSocketFrames) {
  const sessionLabel = latestSession.sessionId ? latestSession.sessionId.slice(0, 8) : "none";
  const flushLabel = latestSession.lastFlushAt ? formatTime(latestSession.lastFlushAt) : "not flushed";
  const activeAt = Date.parse(latestSession.activeAt || "");
  const activeAgeSeconds = Number.isNaN(activeAt)
    ? null
    : Math.max(0, Math.round((Date.now() - activeAt) / 1000));
  const activeLabel = activeAgeSeconds === null
    ? webSocketFrames.length
      ? "websocket active"
      : "watcher not seen"
    : activeAgeSeconds <= 120
      ? `watcher active ${activeAgeSeconds}s ago`
      : `watcher stale ${Math.round(activeAgeSeconds / 60)}m ago`;
  captureHealth.textContent = `${activeLabel} / Session ${sessionLabel} / seq ${latestSession.sequence || 0} / all seq ${latestSession.allSequence || 0} / ws seq ${latestSession.webSocketSequence || 0} / last flush ${flushLabel} / ${rawLogs.length} tracker logs / ${allRawLogs.length} all rows / ${webSocketFrames.length} ws frames`;
}

function createSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}


function emptyRecordsMessage(filter, context = {}) {
  if (filter === "websocket") return "No WebSocket frames captured yet.";
  if (filter === "all_raw") return "No captured page text yet.";
  if (filter === "raw") return "No DOM tracker rows captured yet; WebSocket capture may still be active.";
  if (filter === "all" && context.webSocketFrames?.length) return "WebSocket frames captured; waiting for decoded game-log events.";
  return "No matching parsed events captured yet.";
}

function renderPatterns(events) {  const candidates = core.unknownPatternCandidates(events, 6);
  patternCandidates.innerHTML = "";

  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "pattern-empty";
    empty.textContent = "No repeated unknown patterns yet.";
    patternCandidates.append(empty);
    return;
  }

  for (const candidate of candidates) {
    const item = document.createElement("article");
    item.className = "pattern-item";

    const title = document.createElement("div");
    title.className = "pattern-title";
    title.innerHTML = `<strong>${candidate.pattern}</strong><span>${candidate.count}x</span>`;

    const example = document.createElement("p");
    example.textContent = candidate.examples[0] || "";

    item.append(title, example);
    patternCandidates.append(item);
  }
}
function render(storedEvents, rawLogs, allRawLogs = [], webSocketFrames = []) {
  localPlayerNameInput.value = latestLocalPlayerName;
  renderResourceMapControls();
  const events = deriveEvents(rawLogs, storedEvents);
  const wsAnalysis = wsCore.analyzeFrames(webSocketFrames, { localPlayerName: latestLocalPlayerName, rawLogs: allRawLogs });
  renderResourceMapSuggestion(wsAnalysis);
  const primaryEvents = wsAnalysis.events.length ? wsAnalysis.events : events;
  latestEvents = events;
  latestRawLogs = rawLogs;
  latestAllRawLogs = allRawLogs;
  latestWebSocketFrames = webSocketFrames;
  latestWebSocketAnalysis = wsAnalysis;
  const tracker = core.buildTracker(events, { localPlayerName: latestLocalPlayerName });
  const filter = filterSelect.value;
  const showingRaw = filter === "raw";
  const showingAllRaw = filter === "all_raw";
  const showingWebSocket = filter === "websocket";
  const visibleEvents =
    filter === "all" ? primaryEvents : primaryEvents.filter((event) => event.type === filter);

  counters.rollCount.textContent = String(
    primaryEvents.filter((event) => event.type === "dice_roll").length
  );
  counters.gainCount.textContent = String(
    primaryEvents.filter((event) => event.type === "resource_gain").length
  );
  counters.tradeCount.textContent = String(countTrades(primaryEvents));
  counters.buildCount.textContent = String(countBuilds(primaryEvents));

  statusText.textContent = rawLogs.length || allRawLogs.length || webSocketFrames.length
    ? `${rawLogs.length} tracker logs, ${allRawLogs.length} all rows, ${webSocketFrames.length} ws frames, ${primaryEvents.length} parsed events`
    : "Open a Colonist game tab to begin";

  renderDiagnostics(primaryEvents, rawLogs);
  renderCaptureHealth(rawLogs, allRawLogs, webSocketFrames);
  const wsTracker = trackerForWebSocketAnalysis(wsAnalysis);
  renderTracker(wsTracker || tracker, wsTracker ? "WebSocket" : "DOM");
  renderCalibrationHand(wsAnalysis.localHand, wsAnalysis.localNonEmptyHand);

  eventsList.innerHTML = "";
  const records = showingWebSocket ? webSocketFrames : showingAllRaw ? allRawLogs : showingRaw ? rawLogs : visibleEvents;

  if (!records.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = emptyRecordsMessage(filter, { webSocketFrames });
    eventsList.append(empty);
    return;
  }

  for (const record of records) {
    eventsList.append(showingWebSocket ? makeWebSocketItem(record) : showingAllRaw || showingRaw ? makeRawLogItem(record) : makeEventItem(record));
  }
}

function loadData() {
  chrome.storage.local.get(
    {
      colonistAllRawLogs: [],
      colonistEvents: [],
      colonistRawLogs: [],
      colonistWebSocketFrames: [],
      colonistWatcherSessionId: null,
      colonistWatcherSequence: 0,
      colonistWatcherAllSequence: 0,
      colonistWatcherWebSocketSequence: 0,
      colonistWatcherLastFlushAt: null,
      colonistWatcherAutoResetAt: null,
      colonistWatcherAutoResetReason: null,
      colonistWatcherActiveAt: null,
      colonistWatcherActiveReason: null,
      colonistWatcherActiveUrl: null,
      colonistWatcherLocalPlayerName: latestLocalPlayerName || "KabaliKhan",
      colonistWatcherResourceMap: latestResourceMap,
    },
    ({
      colonistAllRawLogs,
      colonistEvents,
      colonistRawLogs,
      colonistWebSocketFrames,
      colonistWatcherSessionId,
      colonistWatcherSequence,
      colonistWatcherAllSequence,
      colonistWatcherWebSocketSequence,
      colonistWatcherLastFlushAt,
      colonistWatcherActiveAt,
      colonistWatcherActiveReason,
      colonistWatcherActiveUrl,
      colonistWatcherLocalPlayerName,
      colonistWatcherResourceMap,
    }) => {
      latestLocalPlayerName = colonistWatcherLocalPlayerName || "KabaliKhan";
      latestResourceMap = { ...DEFAULT_RESOURCE_MAP };
      latestSession = {
        sessionId: colonistWatcherSessionId,
        sequence: colonistWatcherSequence,
        allSequence: colonistWatcherAllSequence,
        webSocketSequence: colonistWatcherWebSocketSequence,
        lastFlushAt: colonistWatcherLastFlushAt,
        activeAt: colonistWatcherActiveAt,
        activeReason: colonistWatcherActiveReason,
        activeUrl: colonistWatcherActiveUrl,
      };
      render(colonistEvents, colonistRawLogs, colonistAllRawLogs, colonistWebSocketFrames);
    }
  );
}

newGameButton.addEventListener("click", () => {
  const resetAt = new Date().toISOString();
  chrome.storage.local.set(
    {
      colonistAllRawLogs: [],
      colonistEvents: [],
      colonistRawLogs: [],
      colonistWebSocketFrames: [],
      colonistWatcherSessionId: createSessionId(),
      colonistWatcherSequence: 0,
      colonistWatcherAllSequence: 0,
      colonistWatcherWebSocketSequence: 0,
      colonistWatcherLastFlushAt: null,
      colonistWatcherAutoResetAt: resetAt,
      colonistWatcherAutoResetReason: "manual-reset",
      colonistWatcherActiveAt: resetAt,
      colonistWatcherActiveReason: "manual-reset",
      colonistWatcherActiveUrl: null,
      colonistWatcherLocalPlayerName: latestLocalPlayerName || "KabaliKhan",
    },
    loadData
  );
});

filterSelect.addEventListener("change", loadData);

localPlayerNameInput.addEventListener("change", () => {
  latestLocalPlayerName = localPlayerNameInput.value.trim() || "KabaliKhan";
  chrome.storage.local.set({ colonistWatcherLocalPlayerName: latestLocalPlayerName }, loadData);
});

applyResourceMapSuggestionButton.addEventListener("click", () => {
  if (!latestResourceMapSuggestion) return;
  latestResourceMap = cleanResourceMap(latestResourceMapSuggestion);
  chrome.storage.local.set({ colonistWatcherResourceMap: latestResourceMap }, loadData);
});

for (const [card, input] of Object.entries(resourceMapInputs)) {
  input.addEventListener("change", () => {
    latestResourceMap = cleanResourceMap({ ...latestResourceMap, [card]: input.value });
    chrome.storage.local.set({ colonistWatcherResourceMap: latestResourceMap }, loadData);
  });
}

copyReportButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildReport(latestEvents, latestRawLogs));
  copyReportButton.textContent = "Copied";
  window.setTimeout(() => {
    copyReportButton.textContent = "Copy Report";
  }, 1200);
});


copyRawButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildRawText(latestRawLogs));
  copyRawButton.textContent = "Copied";
  window.setTimeout(() => {
    copyRawButton.textContent = "Copy Raw";
  }, 1200);
});
function buildExportPayload() {
  return {
    exportedAt: new Date().toISOString(),
    session: latestSession,
    localPlayerName: latestLocalPlayerName,
    rawLogs: latestRawLogs,
    allRawLogs: latestAllRawLogs,
    webSocketFrames: latestWebSocketFrames,
    webSocketEvents: latestWebSocketAnalysis.events,
    webSocketLocalHand: latestWebSocketAnalysis.localHand || null,
    webSocketLocalNonEmptyHand: latestWebSocketAnalysis.localNonEmptyHand || null,
    parsedEvents: latestEvents,
    tracker: latestTracker,
    resourceMap: latestResourceMap,
    report: buildReport(latestEvents, latestRawLogs, latestAllRawLogs, latestWebSocketFrames),
  };
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  if (chrome.downloads?.download) {
    chrome.downloads.download(
      {
        url,
        filename,
        conflictAction: "overwrite",
        saveAs: false,
      },
      () => window.setTimeout(() => URL.revokeObjectURL(url), 5000)
    );
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = filename.split("/").pop();
  link.click();
  URL.revokeObjectURL(url);
}

exportLogsButton.addEventListener("click", () => {
  const payload = buildExportPayload();
  downloadJson(payload, "colonist-watcher/latest.json");
  exportLogsButton.textContent = "Saved Latest";
  window.setTimeout(() => {
    exportLogsButton.textContent = "Export JSON";
  }, 1400);
});

openDashboardButton.addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html"), active: true });
});

scanButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "COLONIST_WATCHER_SCAN" }, () => {
    if (chrome.runtime.lastError) {
      captureHealth.textContent = "Watcher not active on this tab. Refresh Colonist after reloading the add-on.";
      return;
    }
    window.setTimeout(loadData, 300);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (changes.colonistEvents ||
      changes.colonistRawLogs ||
      changes.colonistAllRawLogs ||
      changes.colonistWebSocketFrames ||
      changes.colonistWatcherLocalPlayerName ||
      changes.colonistWatcherResourceMap ||
      changes.colonistWatcherActiveAt ||
      changes.colonistWatcherSequence)
  ) {
    loadData();
  }
});

loadData();