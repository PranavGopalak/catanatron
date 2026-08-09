"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildHandGroups,
  integratedColumnWidth,
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

test("scales an integrated multiplayer column without crushing the native game", () => {
  assert.equal(integratedColumnWidth(1210, 4), 266);
  assert.equal(integratedColumnWidth(1366, 4), 301);
  assert.equal(integratedColumnWidth(1480, 4), 326);
  assert.equal(integratedColumnWidth(1129, 2), 248);
  assert.equal(integratedColumnWidth(1128, 4), 0);
  assert.equal(integratedColumnWidth(1210, 1), 0);
  assert.equal(integratedColumnWidth(Number.NaN, 4), 0);
});
