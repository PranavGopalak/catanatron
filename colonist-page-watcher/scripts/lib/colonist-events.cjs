"use strict";

const wsCore = require("../../src/ws-core.js");

const RESOURCES = ["brick", "lumber", "ore", "grain", "wool"];
const CARD_KEYS = ["card_1", "card_2", "card_3", "card_4", "card_5"];
const BUILD_COSTS = {
  build_road: { brick: 1, lumber: 1 },
  build_settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  build_city: { ore: 3, grain: 2 },
  development_card_bought: { ore: 1, grain: 1, wool: 1 },
};

function isCompleteResourceMap(resourceMap) {
  return (
    resourceMap &&
    CARD_KEYS.every((card) => RESOURCES.includes(resourceMap[card])) &&
    new Set(CARD_KEYS.map((card) => resourceMap[card])).size === RESOURCES.length
  );
}

function emptyCounts() {
  return Object.fromEntries(RESOURCES.map((resource) => [resource, 0]));
}

function emptyPlayer(name) {
  return {
    name,
    cards: emptyCounts(),
    ledger: emptyCounts(),
    knownCards: 0,
    uncertainty: 0,
    hiddenCards: [],
    resolvedHiddenCards: [],
    devCardsPlayed: 0,
    devCardsBought: 0,
  };
}

function getPlayer(state, name) {
  if (!name) return null;
  if (!state.players[name]) state.players[name] = emptyPlayer(name);
  return state.players[name];
}

function refreshPlayer(player) {
  if (!player) return;
  player.knownCards = Object.values(player.cards).reduce(
    (sum, amount) => sum + Math.max(0, amount || 0),
    0
  );
  player.uncertainty =
    (player.otherUncertainty || 0) +
    player.hiddenCards.filter((card) => !card.resolvedAs).length;
}

function mapCounts(counts, resourceMap) {
  const mapped = {};
  for (const [card, amount] of Object.entries(counts || {})) {
    const resource = resourceMap?.[card] || card;
    mapped[resource] = (mapped[resource] || 0) + amount;
  }
  return mapped;
}

function addCounts(player, counts, resourceMap, multiplier) {
  if (!player) return;
  for (const [resource, amount] of Object.entries(mapCounts(counts, resourceMap))) {
    player.ledger[resource] = (player.ledger[resource] || 0) + amount * multiplier;
    player.cards[resource] = Math.max(0, player.ledger[resource]);
  }
  refreshPlayer(player);
}

function addHiddenCard(player, event) {
  if (!player) return;
  const count = event.hiddenCount || 1;
  for (let index = 0; index < count; index += 1) {
    player.hiddenCards.push({
      id: `hidden-${event.messageSequence || event.frameSequence || event.logId || "event"}-${index}`,
      source: "steal",
      from: event.victim,
      candidates: RESOURCES.slice(),
      resolvedAs: null,
    });
  }
  refreshPlayer(player);
}

function payBuildCost(player, cost) {
  if (!player || !cost) return;
  const deficits = Object.entries(cost)
    .map(([resource, amount]) => [
      resource,
      Math.max(0, amount - (player.cards[resource] || 0)),
    ])
    .filter(([, amount]) => amount > 0);
  const deficitTotal = deficits.reduce((sum, [, amount]) => sum + amount, 0);

  if (deficitTotal === 1 && deficits.length === 1) {
    const resource = deficits[0][0];
    const eligible = player.hiddenCards.filter(
      (card) => !card.resolvedAs && card.candidates.includes(resource)
    );
    if (eligible.length === 1) {
      eligible[0].resolvedAs = resource;
      player.ledger[resource] = (player.ledger[resource] || 0) + 1;
      player.cards[resource] = Math.max(0, player.ledger[resource]);
      player.resolvedHiddenCards.push({ ...eligible[0] });
    }
  }

  for (const [resource, amount] of Object.entries(cost)) {
    player.ledger[resource] = (player.ledger[resource] || 0) - amount;
    player.cards[resource] = Math.max(0, player.ledger[resource]);
  }
  refreshPlayer(player);
}

function buildMappedWsTracker(events, resourceMap) {
  const state = { players: {}, trackableEvents: 0, uncertainEvents: 0 };
  for (const event of events || []) {
    const player = getPlayer(state, event.player);
    if (event.type === "resource_gain" || event.type === "monopoly_gain") {
      state.trackableEvents += 1;
      addCounts(player, event.cards, resourceMap, 1);
    } else if (event.type === "resource_loss" || event.type === "discard") {
      state.trackableEvents += 1;
      addCounts(player, event.cards, resourceMap, -1);
    } else if (event.type === "bank_trade") {
      state.trackableEvents += 1;
      addCounts(player, event.givenCards, resourceMap, -1);
      addCounts(player, event.receivedCards, resourceMap, 1);
    } else if (event.type === "player_trade") {
      state.trackableEvents += 1;
      addCounts(player, event.givenCards, resourceMap, -1);
      addCounts(player, event.receivedCards, resourceMap, 1);
      const other = getPlayer(state, event.otherPlayer);
      addCounts(other, event.receivedCards, resourceMap, -1);
      addCounts(other, event.givenCards, resourceMap, 1);
    } else if (event.type === "steal") {
      state.trackableEvents += 1;
      state.uncertainEvents += 1;
      addHiddenCard(player, event);
      const victim = getPlayer(state, event.victim);
      if (victim) {
        victim.otherUncertainty =
          (victim.otherUncertainty || 0) + (event.hiddenCount || 1);
        refreshPlayer(victim);
      }
    } else if (BUILD_COSTS[event.type]) {
      state.trackableEvents += 1;
      const freeBuild = event.type.startsWith("build_") && event.raw?.type !== 5;
      if (!freeBuild) payBuildCost(player, BUILD_COSTS[event.type]);
      if (event.type === "development_card_bought" && player) {
        player.devCardsBought += 1;
      }
    } else if (event.type === "development_card_played") {
      state.trackableEvents += 1;
      if (player) player.devCardsPlayed += 1;
    }
  }
  for (const player of Object.values(state.players)) refreshPlayer(player);
  return state;
}

function buildWsTracker(events) {
  return wsCore.buildTracker(events);
}

function eventsFromDecodedFrames(decodedFrames, options = {}) {
  return wsCore.analyzeDecodedFrames(decodedFrames || [], options);
}

function summarizeWsEvents(events) {
  const byType = {};
  for (const event of events || []) {
    const type = event.type || "unknown";
    byType[type] = (byType[type] || 0) + 1;
  }
  return { count: (events || []).length, byType };
}

module.exports = {
  buildMappedWsTracker,
  buildWsTracker,
  eventsFromDecodedFrames,
  isCompleteResourceMap,
  summarizeWsEvents,
};
