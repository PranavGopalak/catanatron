#!/usr/bin/env node
const assert = require("assert");
const core = require("../src/core.js");

const rawLogs = [
  { id: "1", sequence: 1, capturedAt: "2026-06-23T00:00:01.000Z", line: "Alice rolled 8" },
  { id: "2", sequence: 2, capturedAt: "2026-06-23T00:00:02.000Z", line: "Alice received 1 brick and 1 lumber" },
  { id: "3", sequence: 3, capturedAt: "2026-06-23T00:00:03.000Z", line: "Bob received 2 grain" },
  { id: "4", sequence: 4, capturedAt: "2026-06-23T00:00:04.000Z", line: "Alice built a road" },
  { id: "5", sequence: 5, capturedAt: "2026-06-23T00:00:05.000Z", line: "Bob bought a development card" },
  { id: "6", sequence: 6, capturedAt: "2026-06-23T00:00:06.000Z", line: "Alice stole 1 wool" },
  { id: "7", sequence: 7, capturedAt: "2026-06-23T00:00:07.000Z", line: "Alice played knight" },
];

const events = core.eventsFromRawLogs(rawLogs);
assert.deepStrictEqual(
  events.map((event) => event.type),
  [
    "dice_roll",
    "resource_gain",
    "resource_gain",
    "build_road",
    "development_card_bought",
    "steal",
    "development_card_played",
  ]
);
assert.strictEqual(events[0].player, "Alice");
assert.strictEqual(events[0].value, 8);
assert.deepStrictEqual(events[1].resources.sort(), ["brick", "lumber"]);
assert.strictEqual(events[6].developmentCard, "knight");

const summary = core.summarizeEvents(events, rawLogs);
assert.strictEqual(summary.total, 7);
assert.strictEqual(summary.knownCount, 7);
assert.strictEqual(summary.unknownCount, 0);
assert.strictEqual(summary.byType.resource_gain, 2);
assert.strictEqual(summary.byType.development_card_played, 1);

const tracker = core.buildTracker(events);
assert.strictEqual(tracker.trackableEvents, 6);
assert.strictEqual(tracker.uncertainEvents, 1);
assert.strictEqual(tracker.unassignedEvents, 0);
assert.deepStrictEqual(tracker.players.Alice.resources, {
  brick: 0,
  lumber: 0,
  ore: 0,
  grain: 0,
  wool: 1,
});
assert.strictEqual(tracker.players.Alice.knownCards, 1);
assert.strictEqual(tracker.players.Alice.devCardsPlayed, 1);

const aliasTracker = core.buildTracker(
  core.eventsFromRawLogs([
    { id: "alias-1", sequence: 1, capturedAt: "2026-06-23T00:00:08.000Z", line: "You got Lumber" },
  ]),
  { localPlayerName: "KabaliKhan" }
);
assert.strictEqual(aliasTracker.players.KabaliKhan.resources.lumber, 1);
assert.strictEqual(aliasTracker.players.You, undefined);
assert.deepStrictEqual(tracker.players.Bob.resources, {
  brick: 0,
  lumber: 0,
  ore: 0,
  grain: 1,
  wool: 0,
});
assert.strictEqual(tracker.players.Bob.devCardsBought, 1);
assert.strictEqual(tracker.players.Bob.uncertainty, 2);

console.log("core smoke test ok");