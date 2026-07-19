#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createElement(idOrTag) {
  const listeners = {};
  return {
    id: "",
    tagName: String(idOrTag || "div").toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    value: "",
    textContent: "",
    innerHTML: "",
    className: "",
    classList: {
      values: new Set(),
      toggle(name, enabled) {
        if (enabled) this.values.add(name);
        else this.values.delete(name);
      },
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
      contains(name) { return this.values.has(name); },
    },
    append(...items) { this.children.push(...items); },
    addEventListener(type, handler) { listeners[type] = handler; },
    dispatch(type) { if (listeners[type]) listeners[type]({ target: this }); },
    setAttribute(name, value) { this[name] = value; },
  };
}

function makeEvent(type, player, extra = {}) {
  return { type, player, capturedAt: "2026-07-10T07:00:00.000Z", ...extra };
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const liveExportPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const liveExport = liveExportPath ? JSON.parse(fs.readFileSync(liveExportPath, "utf8")) : null;
  const index = fs.readFileSync(path.join(root, "dashboard", "index.html"), "utf8");
  const ids = Array.from(index.matchAll(/id="([^"]+)"/g)).map((match) => match[1]);
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        const element = createElement(id);
        element.id = id;
        elements.set(id, element);
      }
      return elements.get(id);
    },
    createElement(tag) { return createElement(tag); },
    querySelectorAll() { return []; },
  };
  for (const id of ids) document.getElementById(id);

  const events = [
    ...Array.from({ length: 9 }, () => makeEvent("build_settlement", "Alice")),
    makeEvent("resource_gain", "Alice", { cards: { brick: 1, lumber: 1, grain: 1, wool: 1 } }),
    ...Array.from({ length: 8 }, () => makeEvent("build_settlement", "Bob")),
    makeEvent("development_card_bought", "Bob"),
    makeEvent("development_card_bought", "Bob"),
    makeEvent("development_card_bought", "Bob"),
    makeEvent("development_card_played", "Bob", { developmentCard: "monopoly" }),
    makeEvent("development_card_played", "Cara", { developmentCard: "monopoly" }),
    makeEvent("development_card_played", "Cara", { developmentCard: "road building" }),
    makeEvent("build_settlement", "Cara"),
    makeEvent("trade_offer", "Alice", { offeredCards: { brick: 1 }, wantedCards: { grain: 1 } }),
  ];

  const storageState = {
    colonistAllRawLogs: [],
    colonistEvents: events,
    colonistRawLogs: [],
    colonistWebSocketFrames: [],
    colonistWatcherActiveAt: new Date().toISOString(),
    colonistWatcherAutoResetAt: new Date().toISOString(),
    colonistWatcherAutoResetReason: "game-start",
    colonistWatcherLiveSnapshotAt: new Date().toISOString(),
    colonistWatcherLocalPlayerName: "KabaliKhan",
    colonistWatcherResourceMap: {
      card_1: "lumber",
      card_2: "brick",
      card_3: "wool",
      card_4: "grain",
      card_5: "ore",
    },
  };

  if (liveExport) {
    storageState.colonistAllRawLogs = liveExport.allRawLogs || [];
    storageState.colonistEvents = liveExport.parsedEvents || [];
    storageState.colonistRawLogs = liveExport.rawLogs || [];
    storageState.colonistWebSocketFrames = liveExport.webSocketFrames || [];
    storageState.colonistWatcherLocalPlayerName = liveExport.localPlayerName || "KabaliKhan";
    storageState.colonistWatcherPlayerContext = null;
  }

  const context = vm.createContext({
    console,
    document,
    location: { protocol: "moz-extension:" },
    chrome: {
      runtime: { getManifest: () => ({ version: "0.1.8" }) },
      storage: {
        local: {
          get(defaults, callback) { callback({ ...defaults, ...storageState }); },
          set(value, callback) { Object.assign(storageState, value); if (callback) callback(); },
        },
      },
    },
    window: { setInterval() {}, setTimeout() {}, clearTimeout() {} },
    setInterval() {},
    clearInterval() {},
    TextDecoder,
    Uint8Array,
    DataView,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
  });

  vm.runInContext(fs.readFileSync(path.join(root, "src", "ws-core.js"), "utf8"), context, { filename: "ws-core.js" });
  vm.runInContext(fs.readFileSync(path.join(root, "dashboard", "app.js"), "utf8"), context, { filename: "dashboard/app.js" });
  await new Promise((resolve) => setImmediate(resolve));

  if (liveExport) {
    const state = context.ColonistWatcherDashboardTest.buildExtensionState(storageState);
    assert.strictEqual(state.players.length, 4, "live export should render four players");
    assert(state.devDeck.bought > 0, "live export should decode development-card purchases");
    const knight = state.devDeck.rows.find((row) => row.name === "knight");
    assert((knight?.played || 0) > 0, "live export should decode Knight plays");
    assert.strictEqual(state.hand?.player, "KabaliKhan");
    assert(Number.isInteger(state.hand?.total), "local hand needs an exact total");
    assert(state.players.find((player) => player.name === "KabaliKhan")?.colorLabel, "local player should have a decoded color");
    const handTotals = Object.fromEntries(state.players.map((player) => [player.color, player.handTotal]));
    assert(Object.values(handTotals).every((total) => Number.isInteger(total) && total >= 0), "dashboard must use exact server hand totals");
    const frameCount = (liveExport.webSocketFrames || []).length;
    if (frameCount === 2907) {
      assert.strictEqual(state.hand?.total, 5);
      assert.strictEqual(state.devDeck.bought, 2, "first live regression should decode two purchases");
      assert.strictEqual(knight?.played, 2, "first live regression should decode two Knights");
      assert.deepStrictEqual(handTotals, { 1: 6, 2: 5, 3: 10, 5: 5 });
      assert.strictEqual(state.players.find((player) => player.name === "KabaliKhan")?.colorLabel, "Black");
      assert.deepStrictEqual(
        Object.fromEntries(state.players.map((player) => [player.name, [player.score.visiblePoints, player.score.hiddenVictoryPoints]])),
        { DoctorFunk: [4, 0], ketstown: [4, 0], Temple2099: [3, 0], KabaliKhan: [3, 0] }
      );
      assert.strictEqual(state.counts.setupGains, 4, "first live regression must include every second-settlement grant" );
    }
    if (frameCount === 4860) {
      assert.deepStrictEqual(
        Object.fromEntries(state.players.map((player) => [player.name, player.colorLabel])),
        { KabaliKhan: "Red", kawasaki811: "Blue", xSniperxx420: "Green", FarmerJ: "Black" }
      );
      assert.deepStrictEqual(JSON.parse(JSON.stringify(state.hand.cards)), { wool: 1, grain: 2, brick: 2 });
      const farmer = state.players.find((player) => player.name === "FarmerJ");
      assert.deepStrictEqual(JSON.parse(JSON.stringify(farmer.cardRanges.ore)), { min: 2, max: 4 });
    }    if (frameCount === 4211) {
      assert.strictEqual(state.players.length, 4);
      assert.strictEqual(state.hand?.total, 10);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(state.hand.cards)), { grain: 2, brick: 1, lumber: 7 });
      assert.deepStrictEqual(
        Object.fromEntries(state.players.map((player) => [player.name, player.colorLabel])),
        { TBone100: "Red", KabaliKhan: "Blue", Darkout1234: "Orange", AlbertoIV: "Black" }
      );
      assert.deepStrictEqual(
        Object.fromEntries(state.players.map((player) => [player.name, [player.score.visiblePoints, player.score.hiddenVictoryPoints]])),
        { TBone100: [7, 0], KabaliKhan: [8, 2], Darkout1234: [5, 0], AlbertoIV: [4, 0] }
      );
    }    if (frameCount === 4713) {
      assert.strictEqual(state.hand?.total, 1);
      assert.strictEqual(state.devDeck.bought, 7, "second live regression should decode seven purchases");
      assert.strictEqual(knight?.played, 4, "second live regression should decode four Knights");
      assert.strictEqual(state.devDeck.rows.find((row) => row.name === "year of plenty")?.played, 1);
      assert.strictEqual(state.counts.setupGains, 4, "second live regression must include every second-settlement grant" );
      assert.deepStrictEqual(handTotals, { 1: 2, 2: 1, 4: 6, 5: 2 });
      const players = Object.fromEntries(state.players.map((player) => [player.name, player]));
      assert.deepStrictEqual(Object.keys(players).sort(), ["KabaliKhan", "Pyle3508", "meluhn", "yourdaddyP"].sort());
      assert.deepStrictEqual(
        Object.fromEntries(state.players.map((player) => [player.name, player.colorLabel])),
        { Pyle3508: "Red", KabaliKhan: "Blue", meluhn: "Green", yourdaddyP: "Black" }
      );
      assert.deepStrictEqual(
        Object.fromEntries(state.players.map((player) => [player.name, [player.score.visiblePoints, player.score.hiddenVictoryPoints]])),
        { Pyle3508: [7, 0], KabaliKhan: [9, 1], meluhn: [5, 0], yourdaddyP: [4, 0] }
      );
    }
    assert(state.players.every((player) => player.knownCards <= player.handTotal), "no resource estimate may exceed the exact server hand total");
    console.log("live dashboard regression test ok");
    console.log(JSON.stringify({
      players: state.players.map((player) => ({ name: player.name, color: player.colorLabel, total: player.handTotal, identified: player.knownCards, unknown: player.uncertainty, conflict: player.estimateConflict, ledger: player.ledger, ranges: player.cardRanges })),
      devBought: state.devDeck.bought,
      knightPlayed: knight.played,
      localHand: state.hand.cards,
    }, null, 2));
    return;
  }

  const winWatch = elements.get("winWatch");
  const winWatchHtml = winWatch.children.map((child) => child.innerHTML).join("\n");
  const devDeck = elements.get("devDeckWatch");
  const devDeckHtml = devDeck.children.map((child) => child.innerHTML).join("\n");
  assert(winWatch.children.length >= 3, "expected Win Watch cards for tracked players");
  assert.match(winWatchHtml, /Alice/);
  assert.match(winWatchHtml, /WIN NOW/);
  assert.match(winWatchHtml, /Bob/);
  assert.match(winWatchHtml, /Hidden VP/);
  assert.match(devDeckHtml, /Monopoly/);
  assert.match(devDeckHtml, /Exhausted/);
  assert.match(devDeckHtml, /Road Building/);
  assert(elements.get("devDeckMeta").textContent.includes("3 bought / 3 played"));
  assert.match(elements.get("stateReset").textContent, /^Auto /);
  assert.strictEqual(elements.get("stateVersion").textContent, "v0.1.8");
  assert.strictEqual(elements.get("headerVersion").textContent, "v0.1.8");
  assert.match(elements.get("tradeVerdictTitle").textContent, /WIN RISK|SAFE|HIDDEN VP RISK|UNKNOWN/);
  assert(elements.get("players").children.length >= 3, "expected player cards to render");
  assert(elements.get("events").children.length > 0, "expected recent events to render");

  const dashboardApi = context.ColonistWatcherDashboardTest;
  assert.notStrictEqual(dashboardApi.playerColorValue(8), dashboardApi.playerColorValue(9), "unknown color enums need stable distinct hues");
  assert.strictEqual(dashboardApi.playerColorValue(2), "#287fc5", "verified Blue must keep its exact hue");
  const constrained = dashboardApi.calculateResourceRanges({
    ledger: { brick: 2, lumber: 1, ore: 0, grain: 0, wool: 0 },
    hiddenCards: [],
    otherUncertainty: 1,
  }, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(constrained.ranges)), {
    brick: { min: 1, max: 2 },
    lumber: { min: 0, max: 1 },
    ore: { min: 0, max: 0 },
    grain: { min: 0, max: 0 },
    wool: { min: 0, max: 0 },
  }, "one hidden loss must narrow resource ranges without erasing the ledger");
  const resourceMap = storageState.colonistWatcherResourceMap;
  const overflowTracker = dashboardApi.buildMappedTracker([
    makeEvent("resource_gain", "Red player", { cards: { card_5: 11 } }),
  ], resourceMap);
  dashboardApi.reconcileTrackerWithHands(overflowTracker, {
    handsByColor: {
      1: { player: "Red player", color: 1, total: 3, compositionKnown: false },
    },
  }, resourceMap);
  assert.strictEqual(overflowTracker.players["Red player"].handTotal, 3);
  assert.strictEqual(overflowTracker.players["Red player"].knownCards, 3, "server hand total must constrain unexplained losses without erasing known composition");
  assert.strictEqual(overflowTracker.players["Red player"].uncertainty, 0);
  assert.strictEqual(overflowTracker.players["Red player"].estimateConflict, 0);

  const localTracker = dashboardApi.buildMappedTracker([], resourceMap);
  dashboardApi.reconcileTrackerWithHands(localTracker, {
    handsByColor: {
      5: { player: "KabaliKhan", color: 5, total: 3, compositionKnown: true, cards: { card_1: 1, card_3: 2 } },
    },
  }, resourceMap);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(localTracker.players.KabaliKhan.cards)),
    { brick: 0, lumber: 1, ore: 0, grain: 0, wool: 2 },
    "local server snapshot must replace estimates with the exact hand"
  );
  assert.strictEqual(localTracker.players.KabaliKhan.uncertainty, 0);

  console.log("dashboard render smoke test ok");
  console.log(JSON.stringify({
    winWatchCards: winWatch.children.length,
    reset: elements.get("stateReset").textContent,
    version: elements.get("stateVersion").textContent,
    tradeVerdict: elements.get("tradeVerdictTitle").textContent,
    devDeckCards: devDeck.children.length,
    devDeckMeta: elements.get("devDeckMeta").textContent,
    players: elements.get("players").children.length,
    events: elements.get("events").children.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});