"use strict";

const RESOURCE_UI = Object.freeze({
  brick: Object.freeze({ enum: 2, mark: "BR", label: "Brick" }),
  lumber: Object.freeze({ enum: 1, mark: "LU", label: "Lumber" }),
  ore: Object.freeze({ enum: 5, mark: "OR", label: "Ore" }),
  grain: Object.freeze({ enum: 4, mark: "GR", label: "Grain" }),
  wool: Object.freeze({ enum: 3, mark: "WO", label: "Wool" }),
});
const RESOURCE_ORDER = Object.freeze(Object.keys(RESOURCE_UI));

function count(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizePlayerName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function guaranteedCount(player, resource) {
  return count(player?.resourceKnowledge?.[resource]?.min ?? player?.cardRanges?.[resource]?.min ?? player?.cards?.[resource]);
}

function buildHandGroups(player) {
  const total = count(player?.handTotal ?? player?.knownCards);
  const groups = [];
  let remaining = total;
  for (const resource of RESOURCE_ORDER) {
    const amount = Math.min(remaining, guaranteedCount(player, resource));
    if (amount > 0) groups.push({ kind: "resource", resource, count: amount });
    remaining -= amount;
  }
  if (remaining > 0) groups.push({ kind: "unknown", count: remaining });
  return groups;
}

function matchPlayer(players, color, name) {
  const numericColor = Number(color);
  if (Number.isFinite(numericColor)) {
    const colorMatch = players.find((player) => Number(player.color) === numericColor);
    if (colorMatch) return colorMatch;
  }
  const normalized = normalizePlayerName(name);
  if (!normalized) return null;
  return players.find((player) => normalizePlayerName(player.name) === normalized) || null;
}

function knowledgeFor(player, resource) {
  const source = player?.resourceKnowledge?.[resource] || player?.cardRanges?.[resource];
  const minimum = count(source?.min ?? player?.cards?.[resource]);
  const hasObservedTotal = player?.handTotal !== null && player?.handTotal !== undefined;
  if (!hasObservedTotal && source?.max == null) {
    return {
      min: minimum,
      max: null,
      presencePct: minimum > 0 ? 100 : null,
      expected: minimum > 0 ? minimum : null,
      state: minimum > 0 ? "guaranteed" : "unknown",
    };
  }
  const maximum = Math.max(minimum, count(source?.max ?? minimum));
  const hasSuppliedPercentage = source?.presencePct !== null && source?.presencePct !== undefined;
  const suppliedPercentage = Number(source?.presencePct);
  const presencePct = hasSuppliedPercentage && Number.isFinite(suppliedPercentage)
    ? Math.min(100, Math.max(0, Math.round(suppliedPercentage)))
    : maximum === 0
      ? 0
      : minimum > 0 || minimum === maximum
        ? 100
        : null;
  const hasSuppliedExpected = source?.expected !== null && source?.expected !== undefined;
  const suppliedExpected = Number(source?.expected);
  return {
    min: minimum,
    max: maximum,
    presencePct,
    expected: hasSuppliedExpected && Number.isFinite(suppliedExpected)
      ? Math.min(maximum, Math.max(minimum, suppliedExpected))
      : minimum === maximum ? minimum : null,
    state: maximum === 0 ? "impossible" : minimum === maximum ? "exact" : minimum > 0 ? "guaranteed" : "possible",
  };
}

function bindPlayersToNativeIdentities(players = [], identities = []) {
  const remaining = Array.from(players || []);
  return Array.from(identities || []).map((identity) => {
    const matched = matchPlayer(remaining, identity?.color, identity?.name);
    if (!matched) {
      return {
        color: Number(identity?.color),
        name: identity?.name || "Player",
        displayName: identity?.name || "Player",
        trackerName: null,
        handTotal: null,
        identityPending: true,
        cards: {},
        cardRanges: {},
        resourceKnowledge: {},
      };
    }
    remaining.splice(remaining.indexOf(matched), 1);
    return {
      ...matched,
      displayName: identity?.name || matched.name,
      trackerName: matched.name,
      identityPending: false,
    };
  });
}

function playerDigest(player) {
  return JSON.stringify({
    color: player?.color,
    name: player?.name,
    total: player?.handTotal,
    dev: player?.developmentCards?.total,
    score: player?.score,
    displayName: player?.displayName,
    trackerName: player?.trackerName,
    identityPending: player?.identityPending,
    knowledge: RESOURCE_ORDER.map((resource) => knowledgeFor(player, resource)),
  });
}

function integratedColumnWidth(viewportWidth, playerCount) {
  const width = Number(viewportWidth);
  const players = count(playerCount);
  if (!Number.isFinite(width) || width <= 0 || players <= 1) return 0;
  const desired = Math.max(320, Math.round(width * 0.27));
  if (width - desired <= 880) return 0;
  return desired;
}

module.exports = {
  RESOURCE_ORDER,
  RESOURCE_UI,
  bindPlayersToNativeIdentities,
  buildHandGroups,
  count,
  guaranteedCount,
  knowledgeFor,
  integratedColumnWidth,
  matchPlayer,
  normalizePlayerName,
  playerDigest,
};
