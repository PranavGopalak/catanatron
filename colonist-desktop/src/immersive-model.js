"use strict";

const RESOURCE_UI = Object.freeze({
  brick: Object.freeze({ enum: 2, mark: "BR", label: "Brick" }),
  lumber: Object.freeze({ enum: 1, mark: "LU", label: "Lumber" }),
  ore: Object.freeze({ enum: 5, mark: "OR", label: "Ore" }),
  grain: Object.freeze({ enum: 4, mark: "GR", label: "Grain" }),
  wool: Object.freeze({ enum: 3, mark: "WO", label: "Wool" }),
});
const RESOURCE_ORDER = Object.freeze(Object.keys(RESOURCE_UI));
const MAX_INLINE_CARDS = 14;

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

function buildHandSlots(player, limit = MAX_INLINE_CARDS) {
  const total = count(player?.handTotal ?? player?.knownCards);
  const slots = [];
  for (const resource of RESOURCE_ORDER) {
    for (let index = 0; index < guaranteedCount(player, resource); index += 1) {
      slots.push({ kind: "resource", resource });
    }
  }
  while (slots.length < total) slots.push({ kind: "unknown" });
  if (slots.length <= limit) return slots;
  const visible = Math.max(1, limit - 1);
  return slots.slice(0, visible).concat({ kind: "overflow", count: slots.length - visible });
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

module.exports = {
  MAX_INLINE_CARDS,
  RESOURCE_ORDER,
  RESOURCE_UI,
  buildHandSlots,
  count,
  guaranteedCount,
  knowledgeFor,
  matchPlayer,
  normalizePlayerName,
  playerDigest,
};
