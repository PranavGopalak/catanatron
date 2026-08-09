"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildHandGroups,
  isSafeSideDock,
  knowledgeFor,
  matchPlayer,
  normalizePlayerName,
} = require("../src/immersive-model");

test("groups guaranteed resources and unresolved cards with visible counts", () => {
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
  const groups = buildHandGroups(player);
  assert.deepEqual(groups, [
    { kind: "resource", resource: "brick", count: 1 },
    { kind: "resource", resource: "lumber", count: 2 },
    { kind: "unknown", count: 4 },
  ]);
  assert.equal(knowledgeFor(player, "ore").state, "impossible");
});

test("keeps a large hand compact and never exceeds the observed total", () => {
  assert.deepEqual(buildHandGroups({ handTotal: 22, cards: { brick: 2 } }), [
    { kind: "resource", resource: "brick", count: 2 },
    { kind: "unknown", count: 20 },
  ]);
  assert.deepEqual(buildHandGroups({ handTotal: 2, cards: { brick: 3, lumber: 2 } }), [
    { kind: "resource", resource: "brick", count: 2 },
  ]);
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

test("uses a side dock only when it is a real nonoverlapping game gutter", () => {
  const game = { left: 135, right: 1074, width: 939, height: 740 };
  assert.equal(isSafeSideDock(game, { left: 4, right: 126, width: 122, height: 494 }), true);
  assert.equal(isSafeSideDock(game, null), false);
  assert.equal(isSafeSideDock(game, { left: 0, right: 208, width: 208, height: 620 }), false);
  assert.equal(isSafeSideDock(game, { left: 0, right: 90, width: 90, height: 620 }), false);
});
