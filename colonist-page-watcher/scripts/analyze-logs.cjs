#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const core = require("../src/core.js");
const { decodeColonistFrames, summarizeDecodedFrames } = require("./lib/colonist-ws.cjs");
const { buildMappedWsTracker, buildWsTracker, eventsFromDecodedFrames, isCompleteResourceMap, summarizeWsEvents } = require("./lib/colonist-events.cjs");

function usage() {
  console.error("Usage: node scripts/analyze-logs.cjs <colonist-export.json> [--player NAME] [--resource-map card_1=lumber,card_2=brick,card_3=wool,card_4=grain,card_5=ore] [--suggest-resource-maps]");
  process.exit(2);
}

function parseResourceMap(value) {
  if (!value) return null;
  const map = {};
  for (const part of value.split(",")) {
    const [key, resource] = part.split("=").map((item) => item?.trim());
    if (!key || !resource) continue;
    map[key] = resource;
  }
  return Object.keys(map).length ? map : null;
}

function parseArgs(argv) {  const args = { filePath: null, localPlayerName: process.env.COLONIST_PLAYER_NAME || "", resourceMap: null, suggestResourceMaps: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--player") {
      args.localPlayerName = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (value.startsWith("--player=")) {
      args.localPlayerName = value.slice("--player=".length);
      continue;
    }
    if (value === "--resource-map") {
      args.resourceMap = parseResourceMap(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (value.startsWith("--resource-map=")) {
      args.resourceMap = parseResourceMap(value.slice("--resource-map=".length));
      continue;
    }
    if (value === "--suggest-resource-maps") {
      args.suggestResourceMaps = true;
      continue;
    }
    if (!args.filePath) args.filePath = value;
  }
  return args;
}

function parseCopyRawText(text) {
  const rawLogs = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Colonist Watcher") || trimmed.startsWith("Session:") || trimmed.startsWith("Last sequence:") || trimmed.startsWith("Raw logs:")) {
      continue;
    }

    const numbered = trimmed.match(/^#(\d+|\?)\s+(\S+)?\s*(.*)$/);
    if (numbered) {
      const sequence = numbered[1] === "?" ? undefined : Number(numbered[1]);
      const maybeDate = numbered[2] || "";
      const hasTimestamp = /^\d{4}-\d{2}-\d{2}T/.test(maybeDate);
      rawLogs.push({
        id: `copy-raw-${rawLogs.length + 1}`,
        sequence,
        capturedAt: hasTimestamp ? maybeDate : undefined,
        source: "copy-raw",
        line: hasTimestamp ? numbered[3].trim() : `${maybeDate} ${numbered[3]}`.trim(),
      });
      continue;
    }

    rawLogs.push({
      id: `copy-raw-${rawLogs.length + 1}`,
      sequence: rawLogs.length + 1,
      source: "copy-raw",
      line: trimmed,
    });
  }
  return rawLogs.filter((log) => log.line);
}

function loadExport(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const trimmed = text.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const rawLogs = parseCopyRawText(text);
    return { rawLogs, allRawLogs: rawLogs, parsedEvents: core.eventsFromRawLogs(rawLogs), webSocketFrames: [] };
  }

  const payload = JSON.parse(trimmed);
  const rawLogs = Array.isArray(payload.rawLogs)
    ? payload.rawLogs
    : Array.isArray(payload.colonistRawLogs)
      ? payload.colonistRawLogs
      : Array.isArray(payload.rawGameLogs)
        ? payload.rawGameLogs
        : Array.isArray(payload)
          ? payload
          : [];
  const allRawLogs = Array.isArray(payload.allRawLogs)
    ? payload.allRawLogs
    : Array.isArray(payload.colonistAllRawLogs)
      ? payload.colonistAllRawLogs
      : rawLogs;
  const webSocketFrames = Array.isArray(payload.webSocketFrames)
    ? payload.webSocketFrames
    : Array.isArray(payload.colonistWebSocketFrames)
      ? payload.colonistWebSocketFrames
      : [];
  const parsedEvents = Array.isArray(payload.parsedEvents)
    ? payload.parsedEvents
    : Array.isArray(payload.colonistEvents)
      ? payload.colonistEvents
      : core.eventsFromRawLogs(rawLogs);

  return { rawLogs, allRawLogs, parsedEvents, webSocketFrames, resourceMap: payload.resourceMap || null };
}

function mostCommonUnknowns(events, limit = 20) {
  const counts = new Map();
  for (const event of events) {
    if (event.type !== "unknown") continue;
    counts.set(event.line, (counts.get(event.line) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([line, count]) => ({ count, line }));
}

function countIgnoredReasons(allRawLogs) {
  const counts = new Map();
  for (const log of allRawLogs || []) {
    const reason = log.acceptedForTracker ? "accepted" : log.ignoreReason || "unknown";
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, count }));
}

function summarizeWebSocketFrames(webSocketFrames) {
  const byDirection = {};
  const byKind = {};
  const urls = new Map();
  for (const frame of webSocketFrames || []) {
    const direction = frame.direction || "unknown";
    const kind = frame.kind || "event";
    byDirection[direction] = (byDirection[direction] || 0) + 1;
    byKind[kind] = (byKind[kind] || 0) + 1;
    if (frame.url) urls.set(frame.url, (urls.get(frame.url) || 0) + 1);
  }
  return {
    byDirection,
    byKind,
    urls: Array.from(urls.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

function mostCommonRaw(rawLogs, limit = 25) {
  const counts = new Map();
  for (const log of rawLogs) {
    const line = log.line || "";
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([line, count]) => ({ count, line }));
}


function mapHandCounts(counts, resourceMap) {
  const mapped = {};
  for (const [card, amount] of Object.entries(counts || {})) {
    const resource = resourceMap?.[card] || card;
    mapped[resource] = (mapped[resource] || 0) + amount;
  }
  return mapped;
}

function diffCounts(actual, estimate) {
  const delta = {};
  for (const resource of new Set([...Object.keys(actual || {}), ...Object.keys(estimate || {})])) {
    const value = (actual?.[resource] || 0) - (estimate?.[resource] || 0);
    if (value) delta[resource] = value;
  }
  return delta;
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
  const cards = ["card_1", "card_2", "card_3", "card_4", "card_5"];
  return Object.fromEntries(cards.map((card, index) => [card, order[index]]));
}

function scoreDelta(delta) {
  return Object.values(delta || {}).reduce((total, amount) => total + Math.abs(amount), 0);
}

function suggestResourceMaps(events, localHand, limit = 10) {
  if (!localHand) return [];
  const resources = ["lumber", "brick", "wool", "grain", "ore"];
  return permutations(resources).map((order) => {
    const map = resourceMapFromOrder(order);
    const tracker = buildMappedWsTracker(events, map);
    const actual = mapHandCounts(localHand.cards, map);
    const estimate = tracker.players?.[localHand.player]?.cards || {};
    const delta = diffCounts(actual, estimate);
    return { map, score: scoreDelta(delta), delta, tracker };
  }).sort((a, b) => a.score - b.score || JSON.stringify(a.map).localeCompare(JSON.stringify(b.map))).slice(0, limit);
}

function formatCounts(counts) {  const parts = Object.entries(counts || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([resource, amount]) => `${resource}=${amount}`);
  return `{${parts.join(", ") || "none"}}`;
}

function formatHand(hand) {  if (!hand) return "none";
  const cards = Object.entries(hand.cards || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([card, amount]) => `${card}=${amount}`)
    .join(", ");
  return `${hand.player || `color_${hand.color}`}: total=${hand.total}, cards={${cards || "none"}}, raw=[${(hand.rawCards || []).join(",")}], seq=${hand.messageSequence ?? "?"}, frame=${hand.frameSequence ?? "?"}`;
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

function printTracker(tracker) {
  const players = Object.values(tracker.players).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  if (!players.length) {
    console.log("Tracker players: none yet");
    return;
  }

  console.log("Tracker players:");
  for (const player of players) {
    console.log(
      `- ${player.name}: known=${player.knownCards}, uncertainty=${player.uncertainty}, devBought=${player.devCardsBought}, devPlayed=${player.devCardsPlayed}, resources=${JSON.stringify(player.resources)}`
    );
  }
}

function main() {
  const { filePath, localPlayerName, resourceMap: cliResourceMap, suggestResourceMaps: shouldSuggestResourceMaps } = parseArgs(process.argv.slice(2));
  if (!filePath) usage();

  const resolved = path.resolve(filePath);
  const { rawLogs, allRawLogs, parsedEvents, webSocketFrames, resourceMap: exportResourceMap } = loadExport(resolved);
  const resourceMap = cliResourceMap || { card_1: "lumber", card_2: "brick", card_3: "wool", card_4: "grain", card_5: "ore" };
  const reparsedEvents = core.eventsFromRawLogs(rawLogs);
  const summary = core.summarizeEvents(reparsedEvents, rawLogs);
  const tracker = core.buildTracker(reparsedEvents, { localPlayerName });
  const decodedWebSocket = decodeColonistFrames(webSocketFrames);
  const decodedSummary = summarizeDecodedFrames(decodedWebSocket.decoded);
  const wsEventResult = eventsFromDecodedFrames(decodedWebSocket.decoded, { localPlayerName });
  const wsEventSummary = summarizeWsEvents(wsEventResult.events);
  const wsTracker = isCompleteResourceMap(resourceMap)
    ? buildMappedWsTracker(wsEventResult.events, resourceMap)
    : buildWsTracker(wsEventResult.events);

  console.log(`File: ${resolved}`);
  if (localPlayerName) console.log(`Local player: ${localPlayerName}`);
  console.log(`Tracker raw logs: ${rawLogs.length}`);
  console.log(`All captured text rows: ${allRawLogs.length}`);
  console.log(`WebSocket frames: ${webSocketFrames.length}`);
  if (webSocketFrames.length) {
    console.log(`Decoded WebSocket frames: ${decodedWebSocket.decoded.length}`);
    console.log(`WebSocket decode failures: ${decodedWebSocket.failures.length}`);
  }
  console.log(`Parsed events in file: ${parsedEvents.length}`);
  console.log(`Reparsed events: ${reparsedEvents.length}`);
  console.log(`Known events: ${summary.knownCount}`);
  console.log(`Unknown events: ${summary.unknownCount}`);
  console.log(`Unknown rate: ${Math.round(summary.unknownRate * 100)}%`);
  console.log(`Covered groups: ${summary.coveredGroups}/8`);
  console.log(`Enough raw evidence: ${summary.enoughRawEvidence ? "yes" : "no"}`);
  console.log(`Enough for first tracker patterns: ${summary.enough ? "yes" : "no"}`);
  console.log(`By type: ${JSON.stringify(summary.byType)}`);
  console.log(`Missing groups: ${summary.missingGroups.join(", ") || "none"}`);
  console.log(`Trackable events: ${tracker.trackableEvents}`);
  console.log(`Uncertain events: ${tracker.uncertainEvents}`);
  console.log(`Unassigned events: ${tracker.unassignedEvents}`);
  printTracker(tracker);

  if (webSocketFrames.length) {
    const wsSummary = summarizeWebSocketFrames(webSocketFrames);
    console.log(`WebSocket by direction: ${JSON.stringify(wsSummary.byDirection)}`);
    console.log(`WebSocket by kind: ${JSON.stringify(wsSummary.byKind)}`);
    if (wsSummary.urls.length) {
      console.log("WebSocket URLs:");
      for (const [url, count] of wsSummary.urls) console.log(`- (${count}) ${url}`);
    }
    if (wsEventResult.events.length) {
      console.log(`Structured WebSocket log events: ${wsEventResult.events.length}`);
      console.log(`Structured WebSocket by type: ${JSON.stringify(wsEventSummary.byType)}`);
      const buildSignals = summarizeBuildPaymentSignals(wsEventResult.events);
      console.log(`WebSocket direct resource distributions: ${wsEventResult.distributionEvents?.length || 0} events / ${countCardsInEvents(wsEventResult.distributionEvents)} cards`);
      console.log(`WebSocket build signals: paid=${buildSignals.paid}, free=${buildSignals.free}, unknown=${buildSignals.unknown}`);
      const players = Object.values(wsEventResult.context.playersByColor || {}).map((player) => `${player.username}=color_${player.selectedColor}`);
      if (players.length) console.log(`WebSocket players: ${players.join(", ")}`);
      console.log(`WebSocket local hand: ${formatHand(wsEventResult.localHand)}`);
      console.log(`WebSocket latest non-empty local hand: ${formatHand(wsEventResult.localNonEmptyHand)}`);
      if (resourceMap) console.log(`WebSocket resource map: ${JSON.stringify(resourceMap)} (${isCompleteResourceMap(resourceMap) ? "complete" : "incomplete"})`);
      if (isCompleteResourceMap(resourceMap) && wsEventResult.localNonEmptyHand) {
        const playerName = wsEventResult.localNonEmptyHand.player;
        const actual = mapHandCounts(wsEventResult.localNonEmptyHand.cards, resourceMap);
        const estimate = wsTracker.players?.[playerName]?.cards || {};
        console.log(`WebSocket local tracker delta actual-minus-tracker: ${formatCounts(diffCounts(actual, estimate))}`);
      }
      if (shouldSuggestResourceMaps && wsEventResult.localNonEmptyHand) {
        console.log("Resource map suggestions by local-hand delta:");
        for (const suggestion of suggestResourceMaps(wsEventResult.events, wsEventResult.localNonEmptyHand, 10)) {
          console.log(`- score=${suggestion.score} map=${JSON.stringify(suggestion.map)} delta=${formatCounts(suggestion.delta)}`);
        }
      }
      const wsPlayers = Object.values(wsTracker.players).sort((a, b) => a.name.localeCompare(b.name));
      if (wsPlayers.length) {
        console.log("WebSocket card tracker:");
        for (const player of wsPlayers) {
          console.log(`- ${player.name}: known=${player.knownCards}, uncertainty=${player.uncertainty}, devPlayed=${player.devCardsPlayed}, cards=${JSON.stringify(player.cards)}`);
        }
      }
      console.log("Structured WebSocket examples:");
      for (const event of wsEventResult.events.filter((item) => item.type !== "turn").slice(-12)) {
        console.log(`- [${event.type}/p${event.protocolType}/log${event.logId}] ${event.line}`);
      }
    }
    if (decodedSummary.byDirectionType.length) {
      console.log("Decoded WebSocket message types:");
      for (const [key, count] of decodedSummary.byDirectionType.slice(0, 30)) {
        const example = decodedSummary.examples.get(key);
        console.log(`- (${count}) ${key} seq=${example?.sequence ?? "?"} frame=${example?.frame?.webSocketSequence ?? "?"}`);
      }
    }
  }

  const ignoredReasons = countIgnoredReasons(allRawLogs);
  if (ignoredReasons.length && allRawLogs !== rawLogs) {
    const reasonText = ignoredReasons.map((item) => `${item.reason}=${item.count}`).join(", ");
    console.log(`Ignored/archive reasons: ${reasonText}`);
  }
  const unknowns = mostCommonUnknowns(reparsedEvents);
  if (unknowns.length) {
    console.log("\nMost common unknown lines:");
    for (const item of unknowns) {
      console.log(`- (${item.count}) ${item.line}`);
    }
  }


  const candidates = core.unknownPatternCandidates(reparsedEvents);
  if (candidates.length) {
    console.log("\nPattern candidates from unknown lines:");
    for (const candidate of candidates) {
      console.log(`- (${candidate.count}) ${candidate.pattern}`);
      for (const example of candidate.examples) {
        console.log(`  example: ${example}`);
      }
    }
  }
  const commonRaw = mostCommonRaw(rawLogs, 10);
  if (commonRaw.length) {
    console.log("\nMost common raw lines:");
    for (const item of commonRaw) {
      console.log(`- (${item.count}) ${item.line}`);
    }
  }
}

main();