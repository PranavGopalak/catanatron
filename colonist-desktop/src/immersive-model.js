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
  const maximum = Math.max(minimum, count(source?.max ?? minimum));
  return {
    min: minimum,
    max: maximum,
    state: maximum === 0 ? "impossible" : minimum === maximum ? "exact" : minimum > 0 ? "guaranteed" : "possible",
  };
}

function playerDigest(player) {
  return JSON.stringify({
    color: player?.color,
    name: player?.name,
    total: player?.handTotal,
    dev: player?.developmentCards?.total,
    score: player?.score,
    knowledge: RESOURCE_ORDER.map((resource) => knowledgeFor(player, resource)),
  });
}

function isSafeSideDock(gameRect, dockRect) {
  if (!gameRect || !dockRect) return false;
  const gameLeft = Number(gameRect.left);
  const dockLeft = Number(dockRect.left);
  const dockRight = Number(dockRect.right);
  const dockWidth = Number(dockRect.width);
  const dockHeight = Number(dockRect.height);
  if (![gameLeft, dockLeft, dockRight, dockWidth, dockHeight].every(Number.isFinite)) return false;
  return dockWidth >= 100 && dockHeight >= 300 && dockLeft >= -2 && dockRight <= gameLeft + 2;
}

module.exports = {
  RESOURCE_ORDER,
  RESOURCE_UI,
  buildHandGroups,
  count,
  guaranteedCount,
  knowledgeFor,
  isSafeSideDock,
  matchPlayer,
  normalizePlayerName,
  playerDigest,
};
