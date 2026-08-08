"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCounterState,
  buildDevDeckWatch,
  buildWinWatch,
  calculateResourceRanges,
  decoratePlayerKnowledge,
} = require("../src/tracker-state");

test("builds exact local counts and bounded opponent ranges", () => {
  const analysis = {
    decodedCount: 8,
    events: [
      { type: "resource_gain", player: "Avery", cards: { card_2: 2, card_1: 1 } },
      { type: "build_road", player: "Avery", raw: { type: 5 } },
      { type: "dice_roll", player: "You", value: 8 },
    ],
    hands: {
      handsByColor: {
        1: { color: 1, player: "Avery", cards: { hidden_resource_card: 3 }, total: 3, compositionKnown: false },
        5: { color: 5, player: "You", cards: { card_1: 1, card_3: 1 }, total: 2, compositionKnown: true },
      },
    },
    localHand: { color: 5, player: "You", cards: { card_1: 1, card_3: 1 }, total: 2, compositionKnown: true },
    playersByColor: {
      1: { color: 1, colorLabel: "Red", name: "Avery", score: { visiblePoints: 4, hiddenVictoryPoints: 0, hiddenVpRisk: 0 }, developmentCards: { total: 1, cards: {} } },
      5: { color: 5, colorLabel: "Black", name: "You", score: { visiblePoints: 5, hiddenVictoryPoints: 1, hiddenVpRisk: 1 }, developmentCards: { total: 2, cards: {} } },
    },
  };

  const state = buildCounterState(analysis, { frames: 10, updatedAt: "2026-08-08T00:00:00.000Z" });
  const local = state.players.find((player) => player.name === "You");
  const opponent = state.players.find((player) => player.name === "Avery");
  assert.deepEqual(local.cards, { brick: 0, lumber: 1, ore: 0, grain: 0, wool: 1 });
  assert.equal(local.exactHand, true);
  assert.equal(local.handTotal, 2);
  assert.equal(opponent.handTotal, 3);
  assert.equal(opponent.exactHand, false);
  assert.equal(opponent.cardRanges.brick.min, 1);
  assert(opponent.cardRanges.brick.max <= 3);
  assert.equal(opponent.knownCards, 1);
  assert.equal(opponent.unresolvedCards, 2);
  assert.equal(opponent.resourceKnowledge.brick.state, "guaranteed-plus");
  assert(opponent.canHave.includes("ore"));
  assert.equal(state.counts.frames, 10);
  assert.equal(state.counts.events, 3);
});

test("tracks development card usage and exhausted card types", () => {
  const watch = buildDevDeckWatch([
    { type: "development_card_bought" },
    { type: "development_card_bought" },
    { type: "development_card_bought" },
    { type: "development_card_played", developmentCard: "Knight" },
    { type: "development_card_played", developmentCard: "Monopoly" },
    { type: "development_card_played", developmentCard: "development_card_monopoly" },
  ]);
  assert.equal(watch.bought, 3);
  assert.equal(watch.playedTotal, 3);
  assert.equal(watch.hiddenInHands, 0);
  const monopoly = watch.rows.find((row) => row.name === "monopoly");
  assert.deepEqual(monopoly, { name: "monopoly", played: 2, limit: 2, remaining: 0, exhausted: true, known: true });
});

test("derives possible resources and immediate point build risk", () => {
  const player = decoratePlayerKnowledge({
    name: "Avery",
    color: 1,
    handTotal: 5,
    cards: { brick: 0, lumber: 0, ore: 3, grain: 2, wool: 0 },
    cardRanges: {
      brick: { min: 0, max: 0 },
      lumber: { min: 0, max: 0 },
      ore: { min: 3, max: 3 },
      grain: { min: 2, max: 2 },
      wool: { min: 0, max: 0 },
    },
    score: { visiblePoints: 9, hiddenVpRisk: 0 },
  });
  assert.deepEqual(player.cannotHave, ["brick", "lumber", "wool"]);
  assert.deepEqual(player.canHave, ["ore", "grain"]);
  const risk = buildWinWatch([player])[0];
  assert.equal(risk.buildPoints, 1);
  assert.deepEqual(risk.builds, ["city"]);
  assert.equal(risk.status, "danger");
});

test("keeps honest full ranges when no public composition is known", () => {
  const player = { ledger: { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 }, hiddenCards: [], otherUncertainty: 0 };
  const result = calculateResourceRanges(player, 2);
  assert(result.feasibleCount > 1);
  for (const range of Object.values(result.ranges)) assert.deepEqual(range, { min: 0, max: 2 });
});
