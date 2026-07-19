#!/usr/bin/env node
const assert = require("assert");
const { buildMappedWsTracker } = require("./lib/colonist-events.cjs");

const resourceMap = {
  card_1: "lumber",
  card_2: "brick",
  card_3: "wool",
  card_4: "grain",
  card_5: "ore",
};

const forcedEvents = [
  { type: "resource_gain", player: "Alice", cards: { brick: 1, lumber: 1, wool: 1 }, messageSequence: 1 },
  { type: "steal", player: "Alice", victim: "Bob", hiddenCount: 1, messageSequence: 2 },
  { type: "build_settlement", player: "Alice", raw: { type: 5 }, messageSequence: 3 },
];

const forced = buildMappedWsTracker(forcedEvents, resourceMap);
assert.deepStrictEqual(forced.players.Alice.cards, {
  brick: 0,
  lumber: 0,
  ore: 0,
  grain: 0,
  wool: 0,
});
assert.strictEqual(forced.players.Alice.uncertainty, 0);
assert.strictEqual(forced.players.Alice.resolvedHiddenCards.length, 1);
assert.strictEqual(forced.players.Alice.resolvedHiddenCards[0].resolvedAs, "grain");
assert.strictEqual(forced.players.Bob.uncertainty, 1);

const ambiguousEvents = [
  { type: "resource_gain", player: "Alice", cards: { brick: 1 }, messageSequence: 1 },
  { type: "steal", player: "Alice", victim: "Bob", hiddenCount: 1, messageSequence: 2 },
  { type: "build_settlement", player: "Alice", raw: { type: 5 }, messageSequence: 3 },
];

const ambiguous = buildMappedWsTracker(ambiguousEvents, resourceMap);
assert.strictEqual(ambiguous.players.Alice.uncertainty, 1);
assert.strictEqual(ambiguous.players.Alice.resolvedHiddenCards.length, 0);

console.log("hidden inference smoke test ok");
console.log(JSON.stringify({
  forcedAlice: forced.players.Alice,
  ambiguousAlice: ambiguous.players.Alice,
}, null, 2));
