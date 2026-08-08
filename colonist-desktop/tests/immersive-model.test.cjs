"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildHandSlots,
  knowledgeFor,
  matchPlayer,
  normalizePlayerName,
} = require("../src/immersive-model");

test("renders guaranteed cards before unresolved backs for the exact hand total", () => {
  const player = {
    handTotal: 7,
    resourceKnowledge: {
      brick: { min: 1, max: 2 },
      lumber: { min: 2, max: 4 },
      ore: { min: 0, max: 0 },
      grain: { min: 0, max: 2 },
      wool: { min: 0, max: 1 },
    },
  };
  const slots = buildHandSlots(player);
  assert.equal(slots.length, 7);
  assert.deepEqual(slots.slice(0, 3), [
    { kind: "resource", resource: "brick" },
    { kind: "resource", resource: "lumber" },
    { kind: "resource", resource: "lumber" },
  ]);
  assert(slots.slice(3).every((slot) => slot.kind === "unknown"));
  assert.equal(knowledgeFor(player, "ore").state, "impossible");
});

test("bounds very large hands with an honest overflow slot", () => {
  const slots = buildHandSlots({ handTotal: 22, cards: { brick: 2 } });
  assert.equal(slots.length, 14);
  assert.deepEqual(slots.at(-1), { kind: "overflow", count: 9 });
});

test("matches player rows by color first and normalized name second", () => {
  const players = [
    { color: 2, name: "Morgan" },
    { color: 4, name: "Avery  Prime" },
  ];
  assert.equal(matchPlayer(players, "2", "Different DOM name"), players[0]);
  assert.equal(matchPlayer(players, "", "  AVERY prime "), players[1]);
  assert.equal(normalizePlayerName("  AVERY   Prime "), "avery prime");
});
