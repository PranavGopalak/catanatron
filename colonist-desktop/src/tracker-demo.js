"use strict";

const { buildWinWatch, decoratePlayerKnowledge } = require("./tracker-state");

const RESOURCE_RANGES = {
  brick: { min: 0, max: 0 },
  lumber: { min: 0, max: 0 },
  ore: { min: 0, max: 0 },
  grain: { min: 0, max: 0 },
  wool: { min: 0, max: 0 },
};

function player({ color, colorLabel, name, cards, ranges, total, exact, visiblePoints, hiddenPoints = 0, dev = 0 }) {
  const cardRanges = Object.fromEntries(Object.keys(RESOURCE_RANGES).map((resource) => [
    resource,
    ranges?.[resource] || { min: Number(cards?.[resource] || 0), max: Number(cards?.[resource] || 0) },
  ]));
  const guaranteed = Object.fromEntries(Object.entries(cardRanges).map(([resource, range]) => [resource, range.min]));
  const knownCards = Object.values(guaranteed).reduce((sum, amount) => sum + amount, 0);
  return decoratePlayerKnowledge({
    color,
    colorLabel,
    name,
    cards: guaranteed,
    cardRanges,
    handTotal: total,
    knownCards,
    uncertainty: Math.max(0, total - knownCards),
    exactHand: exact,
    estimateConflict: 0,
    score: { visiblePoints, hiddenVictoryPoints: hiddenPoints, hiddenVpRisk: hiddenPoints, totalPoints: visiblePoints + hiddenPoints },
    developmentCards: { total: dev, compositionKnown: false, cards: {} },
  });
}

function createDemoTrackerSnapshot() {
  const updatedAt = new Date().toISOString();
  const localCards = { brick: 2, lumber: 1, ore: 0, grain: 2, wool: 1 };
  const players = [
    player({ color: 4, colorLabel: "Green", name: "Avery", total: 5, visiblePoints: 6, dev: 1, ranges: { brick: { min: 1, max: 2 }, lumber: { min: 0, max: 1 }, ore: { min: 1, max: 2 }, grain: { min: 1, max: 2 }, wool: { min: 0, max: 1 } } }),
    player({ color: 2, colorLabel: "Blue", name: "Morgan", total: 7, visiblePoints: 5, dev: 2, ranges: { brick: { min: 1, max: 2 }, lumber: { min: 2, max: 4 }, ore: { min: 0, max: 0 }, grain: { min: 0, max: 2 }, wool: { min: 0, max: 1 } } }),
    player({ color: 3, colorLabel: "Orange", name: "Riley", total: 4, visiblePoints: 7, dev: 0, ranges: { brick: { min: 1, max: 2 }, lumber: { min: 1, max: 2 }, ore: { min: 0, max: 1 }, grain: { min: 0, max: 1 }, wool: { min: 0, max: 1 } } }),
    player({ color: 1, colorLabel: "Red", name: "You", cards: localCards, total: 6, exact: true, visiblePoints: 8, hiddenPoints: 1, dev: 2 }),
  ];
  const devDeck = {
    bought: 6,
    playedTotal: 3,
    hiddenInHands: 3,
    rows: [
      { name: "knight", played: 2, limit: 14, remaining: 12, exhausted: false, known: true },
      { name: "victory point", played: 0, limit: 5, remaining: 5, exhausted: false, known: true },
      { name: "road building", played: 1, limit: 2, remaining: 1, exhausted: false, known: true },
      { name: "year of plenty", played: 0, limit: 2, remaining: 2, exhausted: false, known: true },
      { name: "monopoly", played: 0, limit: 2, remaining: 2, exhausted: false, known: true },
    ],
  };
  return {
    enabled: true,
    capture: { enabled: true, attached: true, framesCaptured: 1842, droppedFrames: 0, lastError: null },
    players,
    hand: { player: "You", total: 6, cards: localCards, compositionKnown: true },
    devDeck,
    winWatch: buildWinWatch(players),
    tradeWatch: { line: "Morgan traded 1 wool for 1 ore", status: "watch", players: ["Morgan"] },
    recentEvents: [
      { type: "build_city", line: "You built city", capturedAt: updatedAt },
      { type: "player_trade", line: "Morgan traded 1 wool for 1 ore", capturedAt: updatedAt },
      { type: "dice_roll", line: "Riley rolled 8", capturedAt: updatedAt },
    ],
    counts: { frames: 1842, decoded: 1815, events: 63, uncertain: 15, rolls: 19, trades: 4, builds: 11 },
    updatedAt,
    resetAt: updatedAt,
    resetReason: "demo",
  };
}

module.exports = { createDemoTrackerSnapshot };
