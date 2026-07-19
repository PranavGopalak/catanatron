#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { decodeColonistFrames } = require("./lib/colonist-ws.cjs");

function usage() {
  console.error("Usage: node scripts/protocol-smoke-test.cjs <colonist-export.json>");
  process.exit(2);
}

function countCards(events) {
  return (events || []).reduce((total, event) =>
    total + Object.values(event.cards || {}).reduce((sum, amount) => sum + amount, 0), 0);
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) usage();
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  const frames = payload.webSocketFrames || [];
  const decoded = decodeColonistFrames(frames);

  require(path.join(__dirname, "..", "src", "ws-core.js"));
  const api = globalThis.ColonistWatcherWsCore;
  const result = api.analyzeFrames(frames, { localPlayerName: payload.localPlayerName || "KabaliKhan", rawLogs: payload.allRawLogs || payload.rawLogs || [] });
  const distributionCards = countCards(result.distributionEvents);
  const builds = result.events.filter((event) => event.type?.startsWith("build_"));
  const devPlays = result.events.filter((event) => event.type === "development_card_played");
  const enum11Plays = devPlays.filter((event) => event.raw?.cardEnum === 11);
  const bankSnapshots = decoded.decoded.filter((item) => {
    const mechanic = item.payload?.gameState?.mechanicDevelopmentCardsState || item.payload?.diff?.mechanicDevelopmentCardsState;
    return Array.isArray(mechanic?.bankDevelopmentCards?.cards);
  });

  assert(frames.length > 0, "export should contain WebSocket frames");
  assert(result.decodedCount >= decoded.decoded.length, "extension decoder should decode every frame accepted by the diagnostic decoder");
  assert(result.events.length > 0, "structured game events should be decoded");
  assert(result.distributionEvents.length > 0, "direct resource distributions should be decoded");
  assert(distributionCards >= result.distributionEvents.length, "distribution card totals should cover each distribution event");
  assert(builds.every((event) => event.raw?.type === 4 || event.raw?.type === 5), "build events should retain free/paid protocol signals");
  assert(enum11Plays.every((event) => event.developmentCard === "knight"), "development card enum 11 must map to Knight");
  assert.strictEqual(api.cardLabel(12), "victory point");
  assert.strictEqual(api.cardLabel(13), "monopoly");
  assert.strictEqual(api.cardLabel(14), "road building");
  assert.strictEqual(api.cardLabel(15), "year of plenty");
  if (bankSnapshots.length) {
    assert(result.developmentCardPurchaseEvents.length > 0, "development deck decreases should produce purchase events");
  }
  if (result.context.localColor !== undefined) {
    assert(result.localNonEmptyHand, "local color inference should produce a local hand snapshot");
    assert.strictEqual(result.localNonEmptyHand.player, payload.localPlayerName || "KabaliKhan");
  }
  for (const hand of Object.values(result.hands.handsByColor || {})) {
    assert.strictEqual(hand.total, hand.rawCards.length, "server hand total must equal snapshot length");
  }
  if (frames.length === 2907) {
    assert.deepStrictEqual(Object.fromEntries(Object.entries(result.playersByColor).map(([color, player]) => [color, player.name])), { 1: "DoctorFunk", 2: "ketstown", 3: "Temple2099", 5: "KabaliKhan" });
    assert.deepStrictEqual(Object.fromEntries(Object.entries(result.playersByColor).map(([color, player]) => [color, player.score.visiblePoints])), { 1: 4, 2: 4, 3: 3, 5: 3 });
    const staleBlue = api.analyzeFrames(frames, { localPlayerName: "KabaliKhan", localColor: 2, playersByColor: { 2: { selectedColor: 2, username: "KabaliKhan" } }, rawLogs: payload.allRawLogs || [] });
    assert.strictEqual(staleBlue.context.localColor, 5, "current roster must replace a stale Blue local color with Black");
  }
  if (frames.length === 4860) {
    assert.strictEqual(result.context.localColor, 1);
    assert.deepStrictEqual(Object.fromEntries(Object.entries(result.playersByColor).map(([color, player]) => [color, player.name])), { 1: "KabaliKhan", 2: "kawasaki811", 4: "xSniperxx420", 5: "FarmerJ" });
    const monopolyGain = result.events.find((event) => event.type === "monopoly_gain" && event.player === "xSniperxx420");
    assert(monopolyGain, "Monopoly protocol transfer must become a ledger event");
    assert.deepStrictEqual(monopolyGain.cards, { card_3: 5 });
    assert.strictEqual(result.events.filter((event) => event.type === "unknown_ws_log").length, 0);
  }
  if (frames.length === 4211) {
    assert.strictEqual(result.context.localColor, 2);
    assert.deepStrictEqual(Object.fromEntries(Object.entries(result.playersByColor).map(([color, player]) => [color, player.name])), { 1: "TBone100", 2: "KabaliKhan", 3: "Darkout1234", 5: "AlbertoIV" });
    assert.deepStrictEqual(Object.fromEntries(Object.entries(result.playersByColor).map(([color, player]) => [color, [player.score.visiblePoints, player.score.hiddenVictoryPoints, player.score.hiddenVpRisk]])), { 1: [7, 0, 1], 2: [8, 2, 2], 3: [5, 0, 1], 5: [4, 0, 0] });
    assert.deepStrictEqual(Object.fromEntries(Object.entries(result.hands.handsByColor).map(([color, hand]) => [color, hand.total])), { 1: 8, 2: 10, 3: 1, 5: 3 });

    const chronological = frames.slice().sort((a, b) => Number(a.webSocketSequence || 0) - Number(b.webSocketSequence || 0));
    let low = 1;
    let high = chronological.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const replay = api.analyzeFrames(chronological.slice(0, middle), { localPlayerName: "KabaliKhan", localColor: 5, playersByColor: { 5: { selectedColor: 5, username: "KabaliKhan" } }, rawLogs: payload.allRawLogs || [] });
      if (replay.events.length >= 47) high = middle;
      else low = middle + 1;
    }
    const earlyReplay = api.analyzeFrames(chronological.slice(0, high), { localPlayerName: "KabaliKhan", localColor: 5, playersByColor: { 5: { selectedColor: 5, username: "KabaliKhan" } }, rawLogs: payload.allRawLogs || [] });
    assert(earlyReplay.events.length >= 47, "early replay should reach the screenshot event count");
    assert.strictEqual(earlyReplay.context.localColor, 2, "early replay must reject stale Black and identify KabaliKhan as Blue");
    assert.deepStrictEqual(Object.keys(earlyReplay.playersByColor).sort(), ["1", "2", "3", "5"], "early replay must retain all four participants");
    assert.strictEqual(earlyReplay.playersByColor[2].name, "KabaliKhan");
    assert.strictEqual(earlyReplay.playersByColor[5].name, "AlbertoIV");
  }
  if (frames.length === 4713) {
    assert.strictEqual(result.decodedCount, frames.length, "every captured frame must decode" );
    assert.strictEqual(result.events.filter((event) => event.type === "unknown_ws_log").length, 0, "all observed game-log protocols must be classified");
    assert.deepStrictEqual(Object.fromEntries(Object.entries(result.playersByColor).map(([color, player]) => [color, player.name])), { 1: "Pyle3508", 2: "KabaliKhan", 4: "meluhn", 5: "yourdaddyP" });
    assert.deepStrictEqual(Object.fromEntries(Object.entries(result.playersByColor).map(([color, player]) => [color, [player.score.visiblePoints, player.score.hiddenVictoryPoints, player.score.hiddenVpRisk]])), { 1: [7, 0, 0], 2: [9, 1, 1], 4: [5, 0, 0], 5: [4, 0, 1] });
    const staleBlack = api.analyzeFrames(frames, { localPlayerName: "KabaliKhan", localColor: 5, playersByColor: { 5: { selectedColor: 5, username: "KabaliKhan" } }, rawLogs: payload.allRawLogs || [] });
    assert.strictEqual(staleBlack.context.localColor, 2, "current roster must replace a stale Black local color with Blue");
    assert.strictEqual(staleBlack.playersByColor[5].name, "yourdaddyP", "stale local identity must not overwrite the current Black player");
    assert.strictEqual(devPlays.filter((event) => event.developmentCard === "year of plenty").length, 1);
    assert.strictEqual(result.distributionEvents.filter((event) => event.distributionType === 0).length, 4);
  }

  console.log("protocol smoke test ok");
  console.log(JSON.stringify({
    frames: frames.length,
    decoded: result.decodedCount,
    diagnosticFailures: decoded.failures.length,
    events: result.events.length,
    distributionEvents: result.distributionEvents.length,
    distributionCards,
    knightPlays: enum11Plays.length,
    devPurchases: result.developmentCardPurchaseEvents.length,
    localColor: result.context.localColor,
    localHand: result.localNonEmptyHand,
    handTotals: Object.fromEntries(Object.entries(result.hands.handsByColor || {}).map(([color, hand]) => [color, hand.total])),
  }, null, 2));
}

main();
