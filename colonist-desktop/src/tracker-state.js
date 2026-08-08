"use strict";

const RESOURCES = Object.freeze(["brick", "lumber", "ore", "grain", "wool"]);
const DEFAULT_RESOURCE_MAP = Object.freeze({
  card_1: "lumber",
  card_2: "brick",
  card_3: "wool",
  card_4: "grain",
  card_5: "ore",
});
const BUILD_COSTS = Object.freeze({
  build_road: { brick: 1, lumber: 1 },
  build_settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  build_city: { ore: 3, grain: 2 },
  development_card_bought: { ore: 1, grain: 1, wool: 1 },
});
const DEV_CARD_LIMITS = Object.freeze({
  knight: 14,
  "victory point": 5,
  "road building": 2,
  "year of plenty": 2,
  monopoly: 2,
});
const POINT_BUILD_COSTS = Object.freeze([
  Object.freeze({ label: "city", cost: BUILD_COSTS.build_city }),
  Object.freeze({ label: "settlement", cost: BUILD_COSTS.build_settlement }),
]);
const WINNING_POINTS = 10;

function safeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function emptyResourceCounts() {
  return Object.fromEntries(RESOURCES.map((resource) => [resource, 0]));
}

function mapCounts(counts = {}, resourceMap = DEFAULT_RESOURCE_MAP) {
  const mapped = emptyResourceCounts();
  for (const [card, amount] of Object.entries(counts || {})) {
    const resource = resourceMap[card] || card;
    if (RESOURCES.includes(resource)) mapped[resource] += Number(amount || 0);
  }
  return mapped;
}

function normalizeDevCardName(value) {
  const clean = String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^development card\s+/, "")
    .trim();
  if (clean.includes("monopoly")) return "monopoly";
  if (clean.includes("year") && clean.includes("plenty")) return "year of plenty";
  if (clean.includes("road") && clean.includes("building")) return "road building";
  if (clean.includes("victory") && clean.includes("point")) return "victory point";
  if (clean.includes("knight")) return "knight";
  return clean || "unknown";
}

function buildDevDeckWatch(events = []) {
  const played = {};
  let bought = 0;
  let playedTotal = 0;
  for (const event of events) {
    if (event.type === "development_card_bought") bought += 1;
    if (event.type !== "development_card_played") continue;
    playedTotal += 1;
    const name = normalizeDevCardName(event.developmentCard);
    played[name] = (played[name] || 0) + 1;
  }
  const rows = Object.entries(DEV_CARD_LIMITS).map(([name, limit]) => {
    const used = safeCount(played[name]);
    return {
      name,
      played: used,
      limit,
      remaining: Math.max(0, limit - used),
      exhausted: used >= limit,
      known: true,
    };
  });
  for (const [name, count] of Object.entries(played)) {
    if (DEV_CARD_LIMITS[name] !== undefined) continue;
    rows.push({ name, played: safeCount(count), limit: null, remaining: null, exhausted: false, known: false });
  }
  return {
    bought,
    playedTotal,
    hiddenInHands: Math.max(0, bought - playedTotal),
    rows,
  };
}

function canPay(cards, cost) {
  return Object.entries(cost || {}).every(([resource, amount]) => safeCount(cards?.[resource]) >= amount);
}

function spend(cards, cost) {
  const next = { ...cards };
  for (const [resource, amount] of Object.entries(cost || {})) next[resource] = safeCount(next[resource]) - amount;
  return next;
}

function bestPointBuildPlan(cards = {}) {
  const memo = new Map();
  function solve(remaining) {
    const key = RESOURCES.map((resource) => safeCount(remaining[resource])).join(":");
    if (memo.has(key)) return memo.get(key);
    let best = { points: 0, builds: [] };
    for (const option of POINT_BUILD_COSTS) {
      if (!canPay(remaining, option.cost)) continue;
      const child = solve(spend(remaining, option.cost));
      if (child.points + 1 > best.points) best = { points: child.points + 1, builds: [option.label, ...child.builds] };
    }
    memo.set(key, best);
    return best;
  }
  return solve(mapCounts(cards));
}

function decoratePlayerKnowledge(player) {
  const total = safeCount(player.handTotal ?? player.knownCards);
  const resourceKnowledge = {};
  const canHave = [];
  const cannotHave = [];
  let guaranteedTotal = 0;
  for (const resource of RESOURCES) {
    const source = player.cardRanges?.[resource];
    const minimum = safeCount(source?.min ?? player.cards?.[resource]);
    const maximum = Math.max(minimum, safeCount(source?.max ?? minimum));
    guaranteedTotal += minimum;
    if (maximum > 0) canHave.push(resource);
    else cannotHave.push(resource);
    resourceKnowledge[resource] = {
      min: minimum,
      max: maximum,
      state: maximum === 0 ? "impossible" : minimum === maximum ? "exact" : minimum > 0 ? "guaranteed-plus" : "possible",
    };
  }
  return {
    ...player,
    handTotal: total,
    knownCards: guaranteedTotal,
    unresolvedCards: Math.max(0, total - guaranteedTotal),
    resourceKnowledge,
    canHave,
    cannotHave,
  };
}

function buildWinWatch(players = []) {
  return players.map((player) => {
    const plan = bestPointBuildPlan(player.cards);
    const visiblePoints = safeCount(player.score?.visiblePoints);
    const hiddenVpRisk = safeCount(player.score?.hiddenVpRisk);
    const total = visiblePoints + plan.points;
    const totalWithHidden = total + hiddenVpRisk;
    const uncertainty = safeCount(player.unresolvedCards ?? player.uncertainty);
    const status = total >= WINNING_POINTS
      ? "danger"
      : uncertainty
        ? "unknown"
        : totalWithHidden >= WINNING_POINTS
          ? "watch"
          : visiblePoints >= 8 || total >= 9 || totalWithHidden >= 9
            ? "close"
            : "stable";
    return {
      player: player.name,
      color: player.color,
      visiblePoints,
      buildPoints: plan.points,
      hiddenVpRisk,
      total,
      totalWithHidden,
      builds: plan.builds,
      status,
      uncertainty,
    };
  }).sort((a, b) => {
    const rank = { danger: 0, watch: 1, unknown: 2, close: 3, stable: 4 };
    return rank[a.status] - rank[b.status] || b.totalWithHidden - a.totalWithHidden || String(a.player).localeCompare(String(b.player));
  });
}

function buildTradeWatch(events, winWatch) {
  const event = events.slice().reverse().find((candidate) => ["trade_offer", "player_trade", "bank_trade"].includes(candidate.type));
  if (!event) return null;
  const involved = new Set([event.player, event.otherPlayer].filter(Boolean));
  const risks = winWatch.filter((item) => involved.has(item.player) && item.status !== "stable");
  return {
    line: describeEvent(event),
    status: risks.some((item) => item.status === "danger") ? "danger" : risks.length ? "watch" : "stable",
    players: risks.map((item) => item.player),
  };
}

function emptyPlayer(name) {
  return {
    name,
    cards: emptyResourceCounts(),
    ledger: emptyResourceCounts(),
    knownCards: 0,
    handTotal: null,
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
  player.knownCards = Object.values(player.cards).reduce((sum, amount) => sum + Math.max(0, Number(amount || 0)), 0);
  const unresolvedGains = player.hiddenCards.filter((card) => !card.resolvedAs).length;
  const eventUncertainty = Number(player.otherUncertainty || 0) + unresolvedGains;
  player.uncertainty = player.snapshotUnknown == null ? eventUncertainty : player.snapshotUnknown;
}

function addCounts(player, counts, multiplier) {
  if (!player) return;
  const mapped = mapCounts(counts);
  for (const resource of RESOURCES) {
    player.ledger[resource] += mapped[resource] * multiplier;
    player.cards[resource] = Math.max(0, player.ledger[resource]);
  }
  refreshPlayer(player);
}

function addHiddenCard(player, event) {
  if (!player) return;
  const count = Math.max(1, Number(event.hiddenCount || 1));
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

function resolveForcedHiddenForCost(player, cost) {
  if (!player?.hiddenCards?.length) return;
  const deficits = Object.entries(cost)
    .map(([resource, amount]) => [resource, Math.max(0, amount - player.cards[resource])])
    .filter(([, amount]) => amount > 0);
  const deficitTotal = deficits.reduce((sum, [, amount]) => sum + amount, 0);
  if (deficitTotal !== 1 || deficits.length !== 1) return;
  const [resource] = deficits[0];
  const eligible = player.hiddenCards.filter((card) => !card.resolvedAs && card.candidates.includes(resource));
  if (eligible.length !== 1) return;
  eligible[0].resolvedAs = resource;
  player.ledger[resource] += 1;
  player.cards[resource] = Math.max(0, player.ledger[resource]);
  player.resolvedHiddenCards.push({ ...eligible[0] });
  refreshPlayer(player);
}

function subtractBuildCost(player, event) {
  const cost = BUILD_COSTS[event.type];
  if (!player || !cost) return;
  resolveForcedHiddenForCost(player, cost);
  for (const [resource, amount] of Object.entries(cost)) {
    player.ledger[resource] -= amount;
    player.cards[resource] = Math.max(0, player.ledger[resource]);
  }
  refreshPlayer(player);
}

function buildPublicLedger(events = []) {
  const state = { players: {}, trackableEvents: 0, uncertainEvents: 0 };
  for (const event of events) {
    const player = getPlayer(state, event.player);
    if (event.type === "resource_gain" || event.type === "monopoly_gain") {
      state.trackableEvents += 1;
      addCounts(player, event.cards, 1);
    } else if (event.type === "resource_loss" || event.type === "discard") {
      state.trackableEvents += 1;
      addCounts(player, event.cards, -1);
    } else if (event.type === "bank_trade") {
      state.trackableEvents += 1;
      addCounts(player, event.givenCards, -1);
      addCounts(player, event.receivedCards, 1);
    } else if (event.type === "player_trade") {
      state.trackableEvents += 1;
      addCounts(player, event.givenCards, -1);
      addCounts(player, event.receivedCards, 1);
      const otherPlayer = getPlayer(state, event.otherPlayer);
      addCounts(otherPlayer, event.receivedCards, -1);
      addCounts(otherPlayer, event.givenCards, 1);
    } else if (event.type === "steal") {
      state.trackableEvents += 1;
      state.uncertainEvents += 1;
      addHiddenCard(player, event);
      const victim = getPlayer(state, event.victim);
      if (victim) {
        victim.otherUncertainty = Number(victim.otherUncertainty || 0) + Number(event.hiddenCount || 1);
        refreshPlayer(victim);
      }
    } else if (BUILD_COSTS[event.type]) {
      state.trackableEvents += 1;
      const isFreeProtocolBuild = event.type.startsWith("build_") && event.raw?.type !== 5;
      if (!isFreeProtocolBuild) subtractBuildCost(player, event);
      if (event.type === "development_card_bought" && player) player.devCardsBought += 1;
    } else if (event.type === "development_card_played") {
      state.trackableEvents += 1;
      if (player) player.devCardsPlayed += 1;
    }
  }
  for (const player of Object.values(state.players)) refreshPlayer(player);
  return state;
}

function calculateResourceRanges(player, handTotal) {
  const ledger = RESOURCES.map((resource) => Math.trunc(Number(player.ledger?.[resource] || 0)));
  let hiddenGains = player.hiddenCards.filter((card) => !card.resolvedAs).length;
  let hiddenLosses = Math.max(0, Math.trunc(Number(player.otherUncertainty || 0)));
  const expectedTotal = ledger.reduce((sum, amount) => sum + amount, 0) + hiddenGains - hiddenLosses;
  const drift = handTotal - expectedTotal;
  if (drift > 0) hiddenGains += drift;
  if (drift < 0) hiddenLosses += -drift;

  const minimums = Array(RESOURCES.length).fill(Infinity);
  const maximums = Array(RESOURCES.length).fill(0);
  const candidate = Array(RESOURCES.length).fill(0);
  let feasibleCount = 0;

  function visit(index, remaining) {
    if (index === RESOURCES.length - 1) {
      candidate[index] = remaining;
      let requiredGains = 0;
      let requiredLosses = 0;
      for (let cardIndex = 0; cardIndex < RESOURCES.length; cardIndex += 1) {
        const delta = candidate[cardIndex] - ledger[cardIndex];
        if (delta > 0) requiredGains += delta;
        if (delta < 0) requiredLosses -= delta;
      }
      if (requiredGains > hiddenGains || requiredLosses > hiddenLosses) return;
      if (hiddenGains - requiredGains !== hiddenLosses - requiredLosses) return;
      feasibleCount += 1;
      for (let cardIndex = 0; cardIndex < RESOURCES.length; cardIndex += 1) {
        minimums[cardIndex] = Math.min(minimums[cardIndex], candidate[cardIndex]);
        maximums[cardIndex] = Math.max(maximums[cardIndex], candidate[cardIndex]);
      }
      return;
    }
    for (let amount = 0; amount <= remaining; amount += 1) {
      candidate[index] = amount;
      visit(index + 1, remaining - amount);
    }
  }

  visit(0, Math.max(0, handTotal));
  const ranges = {};
  for (let index = 0; index < RESOURCES.length; index += 1) {
    ranges[RESOURCES[index]] = feasibleCount
      ? { min: minimums[index], max: maximums[index] }
      : { min: 0, max: Math.max(0, handTotal) };
  }
  return { ranges, feasibleCount, drift };
}

function reconcileWithHands(state, hands = {}) {
  for (const hand of Object.values(hands.handsByColor || {})) {
    const player = getPlayer(state, hand.player);
    if (!player) continue;
    player.color = Number(hand.color);
    player.colorLabel = hand.colorLabel || `Color ${hand.color}`;
    player.handTotal = Math.max(0, Number(hand.total || 0));
    player.snapshotAt = hand.capturedAt || null;
    if (hand.compositionKnown) {
      const exact = mapCounts(hand.cards);
      player.cards = exact;
      player.ledger = { ...exact };
      player.cardRanges = Object.fromEntries(RESOURCES.map((resource) => [resource, { min: exact[resource], max: exact[resource] }]));
      player.snapshotUnknown = 0;
      player.exactHand = true;
      player.estimateConflict = 0;
      refreshPlayer(player);
      continue;
    }
    const solution = calculateResourceRanges(player, player.handTotal);
    player.cardRanges = solution.ranges;
    player.rangeFeasibleCount = solution.feasibleCount;
    player.rangeDrift = solution.drift;
    player.estimateConflict = solution.feasibleCount ? 0 : Math.abs(solution.drift);
    player.cards = Object.fromEntries(RESOURCES.map((resource) => [resource, solution.ranges[resource].min]));
    player.knownCards = Object.values(player.cards).reduce((sum, amount) => sum + amount, 0);
    player.snapshotUnknown = Math.max(0, player.handTotal - player.knownCards);
    player.exactHand = false;
    refreshPlayer(player);
  }
  return state;
}

function applyAuthoritativePlayers(state, playersByColor = {}) {
  for (const authoritative of Object.values(playersByColor)) {
    const player = getPlayer(state, authoritative.name);
    if (!player) continue;
    player.color = Number(authoritative.color);
    player.colorLabel = authoritative.colorLabel;
    player.score = authoritative.score || null;
    player.developmentCards = authoritative.developmentCards || { total: 0, cards: {} };
    if (player.handTotal == null) player.handTotal = 0;
  }
  return state;
}

function countByType(events) {
  return events.reduce((counts, event) => {
    counts[event.type || "unknown"] = (counts[event.type || "unknown"] || 0) + 1;
    return counts;
  }, {});
}

function formatMappedCards(counts) {
  return Object.entries(mapCounts(counts))
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${amount} ${resource}`)
    .join(", ");
}

function describeEvent(event) {
  if (event.type === "dice_roll") return `${event.player || "Unknown"} rolled ${event.value || "?"}`;
  if (event.type === "resource_gain") return `${event.player || "Unknown"} gained ${formatMappedCards(event.cards) || "resources"}`;
  if (event.type === "resource_loss" || event.type === "discard") return `${event.player || "Unknown"} lost ${formatMappedCards(event.cards) || "resources"}`;
  if (event.type === "player_trade" || event.type === "bank_trade") return `${event.player || "Unknown"} traded ${formatMappedCards(event.givenCards) || "cards"} for ${formatMappedCards(event.receivedCards) || "cards"}`;
  if (event.type?.startsWith("build_")) return `${event.player || "Unknown"} built ${event.piece || event.type.slice(6)}`;
  if (event.type === "steal") return `${event.player || "Unknown"} stole from ${event.victim || "Unknown"}`;
  if (event.type === "development_card_bought") return `${event.player || "Unknown"} bought a development card`;
  if (event.type === "development_card_played") return `${event.player || "Unknown"} played ${event.developmentCard || "a development card"}`;
  if (event.type === "game_won") return `${event.player || "Unknown"} won the game`;
  return String(event.type || "Game update").replaceAll("_", " ");
}

function emptyCounterState() {
  return {
    players: [],
    hand: null,
    devDeck: buildDevDeckWatch(),
    winWatch: [],
    tradeWatch: null,
    recentEvents: [],
    counts: { frames: 0, decoded: 0, events: 0, uncertain: 0, rolls: 0, trades: 0, builds: 0, devBought: 0, devPlayed: 0 },
    updatedAt: null,
    resetAt: null,
    resetReason: null,
  };
}

function buildCounterState(analysis = {}, metadata = {}) {
  const events = analysis.events || [];
  const ledger = applyAuthoritativePlayers(
    reconcileWithHands(buildPublicLedger(events), analysis.hands || {}),
    analysis.playersByColor || {}
  );
  const players = Object.values(ledger.players)
    .map((player) => decoratePlayerKnowledge({
      ...player,
      cards: { ...player.cards },
      ledger: { ...player.ledger },
      cardRanges: player.cardRanges || Object.fromEntries(RESOURCES.map((resource) => [resource, { min: 0, max: player.handTotal || 0 }])),
    }))
    .sort((a, b) => Number(a.color || 99) - Number(b.color || 99) || a.name.localeCompare(b.name));
  const byType = countByType(events);
  const handSource = analysis.localHand || analysis.localNonEmptyHand || null;
  const hand = handSource ? { ...handSource, cards: mapCounts(handSource.cards) } : null;
  const devDeck = buildDevDeckWatch(events);
  const winWatch = buildWinWatch(players);
  return {
    players,
    hand,
    devDeck,
    winWatch,
    tradeWatch: buildTradeWatch(events, winWatch),
    recentEvents: events.slice(-10).reverse().map((event) => ({ type: event.type, line: describeEvent(event), capturedAt: event.capturedAt || null })),
    counts: {
      frames: Number(metadata.frames || 0),
      decoded: Number(analysis.decodedCount || 0),
      events: events.length,
      uncertain: players.reduce((sum, player) => sum + Number(player.uncertainty || 0), 0),
      rolls: byType.dice_roll || 0,
      trades: (byType.player_trade || 0) + (byType.bank_trade || 0),
      builds: (byType.build_road || 0) + (byType.build_settlement || 0) + (byType.build_city || 0),
      devBought: devDeck.bought,
      devPlayed: devDeck.playedTotal,
    },
    updatedAt: metadata.updatedAt || null,
    resetAt: metadata.resetAt || null,
    resetReason: metadata.resetReason || null,
  };
}

module.exports = {
  BUILD_COSTS,
  DEFAULT_RESOURCE_MAP,
  DEV_CARD_LIMITS,
  RESOURCES,
  WINNING_POINTS,
  bestPointBuildPlan,
  buildCounterState,
  buildDevDeckWatch,
  buildPublicLedger,
  buildTradeWatch,
  buildWinWatch,
  calculateResourceRanges,
  decoratePlayerKnowledge,
  emptyCounterState,
  mapCounts,
  reconcileWithHands,
};
