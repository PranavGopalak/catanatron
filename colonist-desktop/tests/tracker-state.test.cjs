"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCounterState,
  buildDevDeckWatch,
  buildPublicLedger,
  buildWinWatch,
  calculateResourceRanges,
  decoratePlayerKnowledge,
  mapCounts,
} = require("../src/tracker-state");

const RESOURCES = ["brick", "lumber", "ore", "grain", "wool"];

function bruteForceRanges(player, handTotal) {
  const ledger = RESOURCES.map((resource) => Math.trunc(Number(player.ledger?.[resource] || 0)));
  let hiddenGains = (player.hiddenCards || []).filter((card) => !card.resolvedAs).length;
  let hiddenLosses = Math.max(0, Math.trunc(Number(player.otherUncertainty || 0)));
  const expectedTotal = ledger.reduce((sum, amount) => sum + amount, 0) + hiddenGains - hiddenLosses;
  const drift = handTotal - expectedTotal;
  if (drift > 0) hiddenGains += drift;
  if (drift < 0) hiddenLosses += -drift;
  const minimums = Array(RESOURCES.length).fill(Infinity);
  const maximums = Array(RESOURCES.length).fill(0);
  const presenceWays = Array(RESOURCES.length).fill(0);
  const amountSums = Array(RESOURCES.length).fill(0);
  const candidate = Array(RESOURCES.length).fill(0);
  let feasibleCount = 0;

  function visit(index, remaining) {
    if (index === RESOURCES.length - 1) {
      candidate[index] = remaining;
      let gains = 0;
      let losses = 0;
      for (let cardIndex = 0; cardIndex < RESOURCES.length; cardIndex += 1) {
        const delta = candidate[cardIndex] - ledger[cardIndex];
        gains += Math.max(0, delta);
        losses += Math.max(0, -delta);
      }
      if (gains > hiddenGains || losses > hiddenLosses) return;
      if (hiddenGains - gains !== hiddenLosses - losses) return;
      feasibleCount += 1;
      for (let cardIndex = 0; cardIndex < RESOURCES.length; cardIndex += 1) {
        minimums[cardIndex] = Math.min(minimums[cardIndex], candidate[cardIndex]);
        maximums[cardIndex] = Math.max(maximums[cardIndex], candidate[cardIndex]);
        if (candidate[cardIndex] > 0) presenceWays[cardIndex] += 1;
        amountSums[cardIndex] += candidate[cardIndex];
      }
      return;
    }
    for (let amount = 0; amount <= remaining; amount += 1) {
      candidate[index] = amount;
      visit(index + 1, remaining - amount);
    }
  }

  visit(0, handTotal);
  return {
    feasibleCount,
    ranges: Object.fromEntries(RESOURCES.map((resource, index) => [
      resource,
      feasibleCount ? {
        min: minimums[index],
        max: maximums[index],
        presencePct: Math.round((presenceWays[index] / feasibleCount) * 100),
        expected: Number((amountSums[index] / feasibleCount).toFixed(2)),
      } : { min: 0, max: handTotal, presencePct: null, expected: null },
    ])),
  };
}

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
  assert.equal(result.feasibleCount, 15);
  for (const range of Object.values(result.ranges)) assert.deepEqual(range, {
    min: 0,
    max: 2,
    presencePct: 33,
    expected: 0.4,
  });
});

test("solves exact ledgers and single hidden transfers deterministically", () => {
  const exact = calculateResourceRanges({
    ledger: { brick: 2, lumber: 1, ore: 0, grain: 0, wool: 0 },
    hiddenCards: [],
    otherUncertainty: 0,
  }, 3);
  assert.equal(exact.feasibleCount, 1);
  assert.deepEqual(exact.ranges, {
    brick: { min: 2, max: 2, presencePct: 100, expected: 2 },
    lumber: { min: 1, max: 1, presencePct: 100, expected: 1 },
    ore: { min: 0, max: 0, presencePct: 0, expected: 0 },
    grain: { min: 0, max: 0, presencePct: 0, expected: 0 },
    wool: { min: 0, max: 0, presencePct: 0, expected: 0 },
  });

  const hiddenGain = calculateResourceRanges({
    ledger: { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 },
    hiddenCards: [{}],
    otherUncertainty: 0,
  }, 1);
  assert.equal(hiddenGain.feasibleCount, 5);
  for (const range of Object.values(hiddenGain.ranges)) assert.deepEqual(range, {
    min: 0,
    max: 1,
    presencePct: 20,
    expected: 0.2,
  });

  const hiddenLoss = calculateResourceRanges({
    ledger: { brick: 1, lumber: 1, ore: 1, grain: 0, wool: 0 },
    hiddenCards: [],
    otherUncertainty: 1,
  }, 2);
  assert.equal(hiddenLoss.feasibleCount, 3);
  assert.deepEqual(hiddenLoss.ranges, {
    brick: { min: 0, max: 1, presencePct: 67, expected: 0.67 },
    lumber: { min: 0, max: 1, presencePct: 67, expected: 0.67 },
    ore: { min: 0, max: 1, presencePct: 67, expected: 0.67 },
    grain: { min: 0, max: 0, presencePct: 0, expected: 0 },
    wool: { min: 0, max: 0, presencePct: 0, expected: 0 },
  });
});

test("shows feasible resource likelihoods for a three-card enemy hand after an unknown steal", () => {
  const state = buildCounterState({
    events: [{ type: "steal", player: "Avery", victim: "Blake", hiddenCount: 1, messageSequence: 9 }],
    hands: {
      handsByColor: {
        1: { color: 1, player: "Avery", cards: { hidden_resource_card: 3 }, total: 3, compositionKnown: false },
      },
    },
    playersByColor: {
      1: { color: 1, colorLabel: "Red", name: "Avery", score: {}, developmentCards: { total: 0, cards: {} } },
    },
  });
  const player = state.players.find((candidate) => candidate.name === "Avery");
  assert.equal(player.handTotal, 3);
  assert.equal(player.rangeFeasibleCount, 35);
  for (const resource of RESOURCES) {
    assert.deepEqual(player.cardRanges[resource], {
      min: 0,
      max: 3,
      presencePct: 43,
      expected: 0.6,
    });
  }
});

test("keeps missing hand snapshots unknown and distinguishes an observed empty hand", () => {
  const unknown = buildCounterState({
    playersByColor: {
      1: { color: 1, colorLabel: "Red", name: "Avery", score: {}, developmentCards: { total: 0, cards: {} } },
    },
  }).players[0];
  assert.equal(unknown.handTotal, null);
  assert.equal(unknown.handObserved, false);
  assert.equal(unknown.unresolvedCards, null);
  for (const resource of RESOURCES) {
    assert.equal(unknown.resourceKnowledge[resource].max, null);
    assert.equal(unknown.resourceKnowledge[resource].state, "unknown");
  }

  const empty = buildCounterState({
    hands: { handsByColor: { 1: { color: 1, player: "Avery", cards: {}, total: 0, compositionKnown: true } } },
    playersByColor: {
      1: { color: 1, colorLabel: "Red", name: "Avery", score: {}, developmentCards: { total: 0, cards: {} } },
    },
  }).players[0];
  assert.equal(empty.handTotal, 0);
  assert.equal(empty.handObserved, true);
  for (const resource of RESOURCES) assert.equal(empty.resourceKnowledge[resource].state, "impossible");
});

test("marks infeasible zero-drift ledgers as conflicts and widens honestly", () => {
  const direct = calculateResourceRanges({
    ledger: { brick: -1, lumber: 3, ore: 0, grain: 0, wool: 0 },
    hiddenCards: [],
    otherUncertainty: 0,
  }, 2);
  assert.equal(direct.drift, 0);
  assert.equal(direct.feasibleCount, 0);
  for (const range of Object.values(direct.ranges)) assert.deepEqual(range, {
    min: 0,
    max: 2,
    presencePct: null,
    expected: null,
  });

  const state = buildCounterState({
    events: [
      { type: "resource_loss", player: "Avery", cards: { card_2: 1 } },
      { type: "resource_gain", player: "Avery", cards: { card_1: 3 } },
    ],
    hands: { handsByColor: { 1: { color: 1, player: "Avery", cards: { hidden_resource_card: 2 }, total: 2, compositionKnown: false } } },
  });
  assert.equal(state.players[0].estimateConflict, 1);
  assert.equal(state.players[0].knownCards, 0);
  assert.equal(state.players[0].unresolvedCards, 2);
});

test("widens malformed external ranges instead of exceeding an observed hand", () => {
  const player = decoratePlayerKnowledge({
    handTotal: 2,
    cards: { brick: 3, lumber: 2 },
    cardRanges: {
      brick: { min: 3, max: 4 },
      lumber: { min: 2, max: 2 },
    },
  });
  assert.equal(player.estimateConflict, 1);
  assert.equal(player.knownCards, 0);
  assert.equal(player.unresolvedCards, 2);
  for (const resource of RESOURCES) assert.deepEqual(player.resourceKnowledge[resource], {
    min: 0,
    max: 2,
    presencePct: null,
    expected: null,
    state: "possible",
  });
});

test("does not hide a winning hidden point risk behind hand uncertainty", () => {
  const risk = buildWinWatch([{
    name: "Avery",
    color: 1,
    cards: {},
    unresolvedCards: 4,
    score: { visiblePoints: 9, hiddenVpRisk: 1 },
  }])[0];
  assert.equal(risk.status, "watch");
  assert.equal(risk.totalWithHidden, 10);
});

test("exact range solver matches brute force across varied public ledgers and hidden transfers", () => {
  const ledgers = [
    [0, 0, 0, 0, 0],
    [2, 1, 0, 0, 0],
    [-1, 2, 1, 0, 0],
    [3, -2, 0, 1, 0],
    [1, 1, 1, 1, 1],
  ];
  for (let handTotal = 0; handTotal <= 8; handTotal += 1) {
    for (const counts of ledgers) {
      for (let hiddenGainCount = 0; hiddenGainCount <= 3; hiddenGainCount += 1) {
        for (let hiddenLossCount = 0; hiddenLossCount <= 2; hiddenLossCount += 1) {
          const player = {
            ledger: Object.fromEntries(RESOURCES.map((resource, index) => [resource, counts[index]])),
            hiddenCards: Array.from({ length: hiddenGainCount }, (_, index) => ({ id: index })),
            otherUncertainty: hiddenLossCount,
          };
          const exact = calculateResourceRanges(player, handTotal);
          const reference = bruteForceRanges(player, handTotal);
          assert.equal(exact.feasibleCount, reference.feasibleCount);
          assert.deepEqual(exact.ranges, reference.ranges);
        }
      }
    }
  }
});

test("public ledger distinguishes free placement, paid builds, trades, and hidden steals", () => {
  const state = buildPublicLedger([
    { type: "resource_gain", player: "Avery", cards: { card_2: 3, card_1: 3, card_4: 1, card_3: 1 } },
    { type: "build_road", player: "Avery", raw: { type: 4 } },
    { type: "build_road", player: "Avery", raw: { type: 5 } },
    { type: "bank_trade", player: "Avery", givenCards: { card_2: 2 }, receivedCards: { card_5: 1 } },
    { type: "player_trade", player: "Avery", otherPlayer: "Blake", givenCards: { card_1: 1 }, receivedCards: { card_3: 1 } },
    { type: "steal", player: "Blake", victim: "Avery", hiddenCount: 1, messageSequence: 9 },
  ]);
  assert.deepEqual(state.players.Avery.ledger, { brick: 0, lumber: 1, ore: 1, grain: 1, wool: 2 });
  assert.deepEqual(state.players.Blake.ledger, { brick: 0, lumber: 1, ore: 0, grain: 0, wool: -1 });
  assert.equal(state.players.Avery.otherUncertainty, 1);
  assert.equal(state.players.Blake.hiddenCards.length, 1);
  assert.equal(state.uncertainEvents, 1);
});

test("unknown build provenance is charged and a uniquely required stolen card is resolved", () => {
  const state = buildPublicLedger([
    { type: "resource_gain", player: "Avery", cards: { card_2: 2, card_1: 1 } },
    { type: "build_road", player: "Avery" },
    { type: "steal", player: "Avery", victim: "Blake", hiddenCount: 1, messageSequence: 12 },
    { type: "build_road", player: "Avery", raw: { type: 5 } },
  ]);
  assert.deepEqual(state.players.Avery.ledger, { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 });
  assert.equal(state.players.Avery.hiddenCards[0].resolvedAs, "lumber");
  assert.equal(state.players.Avery.resolvedHiddenCards.length, 1);
  assert.equal(state.players.Avery.uncertainty, 0);
});

test("malformed card counts are ignored instead of poisoning the tracker", () => {
  assert.deepEqual(mapCounts({ card_1: "oops", card_2: -5, card_3: 2.9, card_4: Infinity }), {
    brick: 0,
    lumber: 0,
    ore: 0,
    grain: 0,
    wool: 2,
  });
});

test("large observed hands stay exact and bounded without composition enumeration", { timeout: 1000 }, () => {
  const result = calculateResourceRanges({
    ledger: { brick: 12, lumber: -4, ore: 8, grain: 3, wool: 0 },
    hiddenCards: Array.from({ length: 8 }, (_, index) => ({ id: index })),
    otherUncertainty: 6,
  }, 200);
  assert(result.feasibleCount > 0);
  for (const range of Object.values(result.ranges)) {
    assert(range.min >= 0);
    assert(range.max <= 200);
    assert(range.min <= range.max);
  }
});
