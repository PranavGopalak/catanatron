const resources = ["brick", "lumber", "ore", "grain", "wool"];
const cards = ["card_1", "card_2", "card_3", "card_4", "card_5"];
const labels = {
  card_1: "Card 1",
  card_2: "Card 2",
  card_3: "Card 3",
  card_4: "Card 4",
  card_5: "Card 5",
  brick: "Brick",
  lumber: "Lumber",
  ore: "Ore",
  grain: "Grain",
  wool: "Wool",
};
const resourceMark = { brick: "BR", lumber: "LU", ore: "OR", grain: "GR", wool: "WO" };
const defaultResourceMap = {
  card_1: "lumber",
  card_2: "brick",
  card_3: "wool",
  card_4: "grain",
  card_5: "ore",
};
const buildCosts = {
  build_road: { brick: 1, lumber: 1 },
  build_settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
  build_city: { ore: 3, grain: 2 },
  development_card_bought: { ore: 1, grain: 1, wool: 1 },
};
const pointBuildCosts = [
  { label: "city", points: 1, cost: { ore: 3, grain: 2 } },
  { label: "settlement", points: 1, cost: { brick: 1, lumber: 1, grain: 1, wool: 1 } },
];
const winningPoints = 10;
const refreshMs = 500;
const devDeckLimits = {
  knight: 14,
  "victory point": 5,
  "road building": 2,
  "year of plenty": 2,
  monopoly: 2,
};

function el(id) {
  return document.getElementById(id);
}

function text(id, value) {
  const target = el(id);
  if (target) target.textContent = value;
}

function safeText(value) {
  return String(value == null ? "" : value);
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeDevCardName(value) {
  const clean = String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^development card\s+/, "")
    .trim();
  if (!clean) return "unknown";
  if (/^\d+$/.test(clean) && /^development[_\s]card/i.test(String(value || ""))) return "development card " + clean;
  if (clean.includes("monopoly")) return "monopoly";
  if (clean.includes("year") && clean.includes("plenty")) return "year of plenty";
  if (clean.includes("road") && clean.includes("building")) return "road building";
  if (clean.includes("victory") && clean.includes("point")) return "victory point";
  if (clean.includes("knight")) return "knight";
  return clean;
}

function extensionVersion() {
  try {
    const version = chrome.runtime?.getManifest?.().version;
    return version ? `v${version}` : "Unknown";
  } catch (_error) {
    return "Unknown";
  }
}
function isExtensionPage() {
  return (
    typeof chrome !== "undefined" &&
    chrome.storage?.local &&
    /^moz-extension:|^chrome-extension:/.test(location.protocol)
  );
}

function storageGet(defaults) {
  return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

function cleanResourceMap(value) {
  const next = {};
  for (const card of cards) {
    next[card] = resources.includes(value?.[card]) ? value[card] : defaultResourceMap[card];
  }
  return next;
}

function mapCounts(counts = {}, resourceMap = defaultResourceMap) {
  const mapped = {};
  for (const [card, amount] of Object.entries(counts || {})) {
    const resource = resourceMap[card] || card;
    mapped[resource] = (mapped[resource] || 0) + amount;
  }
  return mapped;
}

function countByType(events = []) {
  return events.reduce((out, event) => {
    out[event.type || "unknown"] = (out[event.type || "unknown"] || 0) + 1;
    return out;
  }, {});
}

function formatCards(counts, resourceMap) {
  return Object.entries(mapCounts(counts || {}, resourceMap))
    .flatMap(([resource, amount]) => Array.from({ length: amount }, () => resource))
    .join(" ");
}

function describeEvent(event, resourceMap) {
  if (event.line) return event.line;
  if (event.type === "dice_roll") return `${event.player || "Unknown"} rolled ${(event.dice || []).join("+") || event.value || "?"}`;
  if (event.type === "resource_gain") return `${event.player || "Unknown"} got ${formatCards(event.cards, resourceMap) || "cards"}`;
  if (event.type === "monopoly_gain") return `${event.player || "Unknown"} monopolized ${formatCards(event.cards, resourceMap) || "resources"}`;
  if (event.type === "resource_loss" || event.type === "discard") return `${event.player || "Unknown"} lost ${formatCards(event.cards, resourceMap) || "cards"}`;
  if (event.type === "player_trade" || event.type === "bank_trade") return `${event.player || "Unknown"} traded ${formatCards(event.givenCards, resourceMap) || "cards"} for ${formatCards(event.receivedCards, resourceMap) || "cards"}`;
  if (event.type === "trade_offer") return `${event.player || "Unknown"} offered ${formatCards(event.offeredCards, resourceMap) || "cards"} for ${formatCards(event.wantedCards, resourceMap) || "cards"}`;
  if (event.type && event.type.startsWith("build_")) return `${event.player || "Unknown"} built ${event.piece || event.type.replace("build_", "")}`;
  if (event.type === "steal") return `${event.player || "Unknown"} stole from ${event.victim || "unknown"}`;
  if (event.type === "development_card_played") return `${event.player || "Unknown"} played ${event.developmentCard || "development card"}`;
  if (event.type === "development_card_effect") return `${event.player || "Unknown"} selected ${formatCards(event.cards, resourceMap) || "resources"}`;
  if (event.type === "longest_road") return `${event.player || "Unknown"} took Longest Road`;
  if (event.type === "largest_army") return `${event.player || "Unknown"} took Largest Army`;
  if (event.type === "game_won") return `${event.player || "Unknown"} won the game`;
  return titleCase(event.type || "unknown");
}

function latestEvents(events, resourceMap, limit = 100) {
  return (events || [])
    .slice(-limit)
    .reverse()
    .map((event) => ({ ...event, line: describeEvent(event, resourceMap) }));
}

function addResourceCounts(base, delta, multiplier = 1) {
  const next = { ...(base || {}) };
  for (const [resource, amount] of Object.entries(delta || {})) {
    next[resource] = Math.max(0, (next[resource] || 0) + amount * multiplier);
  }
  return next;
}

function canPay(cardsValue, cost) {
  return Object.entries(cost || {}).every(([resource, amount]) => (cardsValue?.[resource] || 0) >= amount);
}

function spend(cardsValue, cost) {
  return addResourceCounts(cardsValue, cost, -1);
}

function bestPointBuildPlan(cardsValue) {
  let best = { points: 0, builds: [] };
  function walk(currentCards, points, builds) {
    if (points > best.points) best = { points, builds: builds.slice() };
    for (const option of pointBuildCosts) {
      if (canPay(currentCards, option.cost)) {
        walk(spend(currentCards, option.cost), points + option.points, builds.concat(option.label));
      }
    }
  }
  walk({ ...(cardsValue || {}) }, 0, []);
  return best;
}

function estimateScoreState(events, trackerPlayers = {}) {
  const score = {};
  function ensure(playerName) {
    if (!playerName) return null;
    if (!score[playerName]) {
      const player = trackerPlayers[playerName] || {};
      const authoritative = player.score?.authoritative;
      score[playerName] = {
        player: playerName,
        authoritative: Boolean(authoritative),
        visiblePoints: authoritative ? Number(player.score.visiblePoints || 0) : 0,
        buildPoints: 0,
        awardPoints: authoritative ? Number(player.score.largestArmy || 0) * 2 + Number(player.score.longestRoad || 0) * 2 : 0,
        hiddenVictoryPoints: authoritative ? Number(player.score.hiddenVictoryPoints || 0) : 0,
        hiddenVpRisk: authoritative ? Number(player.score.hiddenVpRisk ?? player.score.hiddenVictoryPoints ?? 0) : Math.max(0, (player.devCardsBought || 0) - (player.devCardsPlayed || 0)),
        details: authoritative ? ["server score"] : [],
      };
    }
    return score[playerName];
  }

  for (const name of Object.keys(trackerPlayers || {})) ensure(name);

  for (const event of events || []) {
    const entry = ensure(event.player);
    if (!entry) continue;
    if (!entry.authoritative && event.type === "build_settlement") {
      entry.visiblePoints += 1;
      entry.buildPoints += 1;
      entry.details.push("settlement");
    }
    if (!entry.authoritative && event.type === "build_city") {
      entry.visiblePoints += 1;
      entry.buildPoints += 1;
      entry.details.push("city upgrade");
    }
    if (!entry.authoritative && event.type === "longest_road") {
      entry.visiblePoints += 2;
      entry.awardPoints += 2;
      entry.details.push("longest road");
    }
    if (!entry.authoritative && event.type === "largest_army") {
      entry.visiblePoints += 2;
      entry.awardPoints += 2;
      entry.details.push("largest army");
    }
  }

  for (const entry of Object.values(score)) {
    if (!entry.authoritative && entry.buildPoints === 0) {
      entry.visiblePoints = Math.max(entry.visiblePoints, 2);
      entry.details.push("2 VP fallback");
    }
  }

  return score;
}

function estimateVisiblePoints(events, trackerPlayers = {}) {
  return Object.fromEntries(
    Object.entries(estimateScoreState(events, trackerPlayers)).map(([player, entry]) => [player, entry.visiblePoints])
  );
}

function assessTradeOutcome({ event, playerName, gainedCards, spentCards, trackerPlayers, resourceMap, scoreState, localPlayerName, label, alreadyApplied = false }) {
  const player = trackerPlayers[playerName];
  if (!player) return null;

  const playerCards = mapCounts(player.cards || {}, resourceMap);
  const afterTrade = alreadyApplied
    ? playerCards
    : addResourceCounts(
        addResourceCounts(playerCards, mapCounts(spentCards, resourceMap), -1),
        mapCounts(gainedCards, resourceMap),
        1
      );
  const plan = bestPointBuildPlan(afterTrade);
  const score = scoreState[playerName] || { visiblePoints: 2, hiddenVpRisk: 0, details: ["2 VP fallback"] };
  const currentPoints = score.visiblePoints || 0;
  const hiddenVpRisk = score.hiddenVpRisk || 0;
  const reachesWin = currentPoints + plan.points >= winningPoints;
  const reachesWinWithHidden = currentPoints + plan.points + hiddenVpRisk >= winningPoints;
  const close = currentPoints >= 8 && plan.points > 0;
  if (!reachesWin && !reachesWinWithHidden && !close) return null;

  return {
    player: playerName,
    currentPoints,
    possiblePoints: plan.points,
    reachesWin,
    reachesWinWithHidden,
    hiddenVpRisk,
    scoreDetails: score.details || [],
    builds: plan.builds,
    line: describeEvent(event, resourceMap),
    label,
    forYou: Boolean(localPlayerName && (event.offeredTo === localPlayerName || event.otherPlayer === localPlayerName)),
  };
}

function buildDevDeckWatch(events = []) {
  const played = {};
  let bought = 0;
  let playedTotal = 0;
  for (const event of events || []) {
    if (event.type === "development_card_bought") bought += 1;
    if (event.type === "development_card_played") {
      playedTotal += 1;
      const name = normalizeDevCardName(event.developmentCard);
      played[name] = (played[name] || 0) + 1;
    }
  }
  const rows = Object.entries(devDeckLimits).map(([name, limit]) => {
    const count = played[name] || 0;
    return {
      name,
      played: count,
      limit,
      remaining: Math.max(0, limit - count),
      exhausted: count >= limit,
      known: true,
    };
  });
  for (const [name, count] of Object.entries(played)) {
    if (devDeckLimits[name] !== undefined) continue;
    rows.push({ name, played: count, limit: null, remaining: null, exhausted: false, known: false });
  }
  rows.sort((a, b) => Number(b.exhausted) - Number(a.exhausted) || b.played - a.played || a.name.localeCompare(b.name));
  return {
    bought,
    playedTotal,
    hiddenInHands: Math.max(0, bought - playedTotal),
    rows,
  };
}

function buildWinWatch(players = []) {
  return players.map((player) => {
    const cardsValue = mapCounts(player.cards || {}, defaultResourceMap);
    const plan = bestPointBuildPlan(cardsValue);
    const visiblePoints = player.score?.visiblePoints || 0;
    const hiddenVpRisk = player.score?.hiddenVpRisk || 0;
    const total = visiblePoints + plan.points;
    const totalWithHidden = total + hiddenVpRisk;
    const status = total >= winningPoints
      ? "danger"
      : player.uncertainty
        ? "unknown"
        : totalWithHidden >= winningPoints
          ? "watch"
          : visiblePoints >= 8 || total >= 9 || totalWithHidden >= 9
            ? "close"
            : "stable";
    return {
      player: player.name,
      visiblePoints,
      buildPoints: plan.points,
      hiddenVpRisk,
      total,
      totalWithHidden,
      builds: plan.builds,
      status,
      uncertainty: player.uncertainty || 0,
    };
  }).sort((a, b) => {
    const rank = { danger: 0, watch: 1, unknown: 2, close: 3, stable: 4 };
    return rank[a.status] - rank[b.status] || b.totalWithHidden - a.totalWithHidden || String(a.player).localeCompare(String(b.player));
  });
}
function buildTradeWarnings(events, trackerPlayers, resourceMap, localPlayerName) {
  const scoreState = estimateScoreState(events, trackerPlayers);
  const warnings = [];
  const recentTrades = (events || [])
    .filter((event) => (event.type === "trade_offer" || event.type === "player_trade") && event.player)
    .slice(-12)
    .reverse();

  for (const trade of recentTrades) {
    if (trade.type === "trade_offer") {
      const warning = assessTradeOutcome({
        event: trade,
        playerName: trade.player,
        spentCards: trade.offeredCards,
        gainedCards: trade.wantedCards,
        trackerPlayers,
        resourceMap,
        scoreState,
        localPlayerName,
        label: "Offer",
      });
      if (warning) warnings.push(warning);
      continue;
    }

    const playerWarning = assessTradeOutcome({
      event: trade,
      playerName: trade.player,
      spentCards: trade.givenCards,
      gainedCards: trade.receivedCards,
      trackerPlayers,
      resourceMap,
      scoreState,
      localPlayerName,
      label: "Accepted trade",
      alreadyApplied: true,
    });
    if (playerWarning) warnings.push(playerWarning);

    if (trade.otherPlayer) {
      const otherWarning = assessTradeOutcome({
        event: trade,
        playerName: trade.otherPlayer,
        spentCards: trade.receivedCards,
        gainedCards: trade.givenCards,
        trackerPlayers,
        resourceMap,
        scoreState,
        localPlayerName,
        label: "Accepted trade",
        alreadyApplied: true,
      });
      if (otherWarning) warnings.push(otherWarning);
    }

    if (warnings.length >= 4) break;
  }

  return warnings.slice(0, 4);
}

function buildTradeCheckSummary(events, trackerPlayers, resourceMap) {
  const scoreState = estimateScoreState(events, trackerPlayers);
  const recentTrades = (events || [])
    .filter((event) => (event.type === "trade_offer" || event.type === "player_trade") && event.player)
    .slice(-6)
    .reverse();

  return recentTrades.map((trade) => {
    const checks = [];
    if (trade.type === "trade_offer") {
      checks.push({
        playerName: trade.player,
        spentCards: trade.offeredCards,
        gainedCards: trade.wantedCards,
      });
    } else {
      checks.push({
        playerName: trade.player,
        spentCards: trade.givenCards,
        gainedCards: trade.receivedCards,
      });
      if (trade.otherPlayer) {
        checks.push({
          playerName: trade.otherPlayer,
          spentCards: trade.receivedCards,
          gainedCards: trade.givenCards,
        });
      }
    }

    const best = checks.reduce((out, check) => {
      const player = trackerPlayers[check.playerName];
      if (!player) return out;
      const currentCards = mapCounts(player.cards || {}, resourceMap);
      const afterTrade = trade.type === "player_trade"
        ? currentCards
        : addResourceCounts(
            addResourceCounts(currentCards, mapCounts(check.spentCards, resourceMap), -1),
            mapCounts(check.gainedCards, resourceMap),
            1
          );
      const plan = bestPointBuildPlan(afterTrade);
      const score = scoreState[check.playerName] || { visiblePoints: 2, hiddenVpRisk: 0 };
      const currentPoints = score.visiblePoints || 0;
      const hiddenVpRisk = score.hiddenVpRisk || 0;
      const total = currentPoints + plan.points;
      const totalWithHidden = total + hiddenVpRisk;
      if (!out || totalWithHidden > out.totalWithHidden) {
        return { playerName: check.playerName, currentPoints, hiddenVpRisk, plan, total, totalWithHidden, uncertainty: player.uncertainty || 0 };
      }
      return out;
    }, null);

    const status = !best
      ? "unknown"
      : best.total >= winningPoints
        ? "danger"
        : best.uncertainty
          ? "unknown"
          : best.totalWithHidden >= winningPoints
            ? "watch"
            : "safe";
    const result = best
      ? best.playerName + ": " + (best.total >= winningPoints ? "WIN RISK" : best.uncertainty ? "UNKNOWN (" + best.uncertainty + " hidden cards)" : best.totalWithHidden >= winningPoints ? "HIDDEN VP RISK" : "SAFE") + " (" + best.currentPoints + "+" + best.plan.points + (best.hiddenVpRisk ? "+up to " + best.hiddenVpRisk + " hidden" : "") + " VP)"
      : "not enough tracked card data";
    return {
      line: describeEvent(trade, resourceMap),
      result,
      status,
    };
  });
}

function emptyResourceCounts() {
  return resources.reduce((out, resource) => {
    out[resource] = 0;
    return out;
  }, {});
}

function emptyMappedPlayer(name) {
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

function getMappedPlayer(state, name) {
  if (!name) return null;
  if (!state.players[name]) state.players[name] = emptyMappedPlayer(name);
  return state.players[name];
}

function refreshMappedPlayer(player) {
  if (!player) return;
  player.knownCards = Object.values(player.cards || {}).reduce((sum, amount) => sum + Math.max(0, amount || 0), 0);
  const eventUncertainty = (player.otherUncertainty || 0) + (player.hiddenCards || []).filter((card) => !card.resolvedAs).length;
  player.uncertainty = player.snapshotUnknown == null ? eventUncertainty : player.snapshotUnknown;
}

function addMappedCounts(player, counts, resourceMap, multiplier) {
  if (!player) return;
  const mapped = mapCounts(counts || {}, resourceMap);
  for (const [resource, amount] of Object.entries(mapped)) {
    player.ledger[resource] = (player.ledger[resource] || 0) + amount * multiplier;
    player.cards[resource] = Math.max(0, player.ledger[resource]);
  }
  refreshMappedPlayer(player);
}

function addHidden(player, event) {
  if (!player) return;
  const count = event.hiddenCount || 1;
  for (let index = 0; index < count; index += 1) {
    player.hiddenCards.push({
      id: `hidden-${event.messageSequence || event.frameSequence || event.logId || "event"}-${index}`,
      source: "steal",
      from: event.victim,
      candidates: resources.slice(),
      resolvedAs: null,
    });
  }
  refreshMappedPlayer(player);
}

function resolveForcedHiddenForCost(player, cost) {
  if (!player?.hiddenCards?.length) return;
  const deficits = Object.entries(cost || {})
    .map(([resource, amount]) => [resource, Math.max(0, amount - (player.cards[resource] || 0))])
    .filter(([, amount]) => amount > 0);
  const deficitTotal = deficits.reduce((sum, [, amount]) => sum + amount, 0);
  if (deficitTotal !== 1 || deficits.length !== 1) return;

  const [resource] = deficits[0];
  const eligible = player.hiddenCards.filter((card) => !card.resolvedAs && card.candidates.includes(resource));
  if (eligible.length !== 1) return;

  eligible[0].resolvedAs = resource;
  player.ledger[resource] = (player.ledger[resource] || 0) + 1;
  player.cards[resource] = Math.max(0, player.ledger[resource]);
  player.resolvedHiddenCards.push({ ...eligible[0] });
  refreshMappedPlayer(player);
}

function subtractBuildCost(player, event) {
  const cost = buildCosts[event.type];
  if (!player || !cost) return;
  resolveForcedHiddenForCost(player, cost);
  for (const [resource, amount] of Object.entries(cost)) {
    player.ledger[resource] = (player.ledger[resource] || 0) - amount;
    player.cards[resource] = Math.max(0, player.ledger[resource]);
  }
  refreshMappedPlayer(player);
}

function buildMappedTracker(events, resourceMap) {
  const state = { players: {}, trackableEvents: 0, uncertainEvents: 0 };
  for (const event of events || []) {
    const player = getMappedPlayer(state, event.player);
    if (event.type === "resource_gain" || event.type === "monopoly_gain") {
      state.trackableEvents += 1;
      addMappedCounts(player, event.cards, resourceMap, 1);
      continue;
    }
    if (event.type === "resource_loss" || event.type === "discard") {
      state.trackableEvents += 1;
      addMappedCounts(player, event.cards, resourceMap, -1);
      continue;
    }
    if (event.type === "bank_trade") {
      state.trackableEvents += 1;
      addMappedCounts(player, event.givenCards, resourceMap, -1);
      addMappedCounts(player, event.receivedCards, resourceMap, 1);
      continue;
    }
    if (event.type === "player_trade") {
      state.trackableEvents += 1;
      addMappedCounts(player, event.givenCards, resourceMap, -1);
      addMappedCounts(player, event.receivedCards, resourceMap, 1);
      const other = getMappedPlayer(state, event.otherPlayer);
      addMappedCounts(other, event.receivedCards, resourceMap, -1);
      addMappedCounts(other, event.givenCards, resourceMap, 1);
      continue;
    }
    if (event.type === "steal") {
      state.trackableEvents += 1;
      state.uncertainEvents += 1;
      addHidden(player, event);
      const victim = getMappedPlayer(state, event.victim);
      if (victim) {
        victim.otherUncertainty = (victim.otherUncertainty || 0) + (event.hiddenCount || 1);
        refreshMappedPlayer(victim);
      }
      continue;
    }
    if (buildCosts[event.type]) {
      state.trackableEvents += 1;
      const isFreeProtocolBuild = event.type?.startsWith("build_") && event.raw?.type !== 5;
      if (!isFreeProtocolBuild) subtractBuildCost(player, event);
      if (event.type === "development_card_bought" && player) player.devCardsBought += 1;
      continue;
    }
    if (event.type === "development_card_played") {
      state.trackableEvents += 1;
      if (player) player.devCardsPlayed += 1;
    }
  }
  for (const player of Object.values(state.players)) refreshMappedPlayer(player);
  return state;
}

function calculateResourceRanges(player, handTotal) {
  const ledger = resources.map((resource) => Math.trunc(Number(player.ledger?.[resource] || 0)));
  let hiddenGains = (player.hiddenCards || []).filter((card) => !card.resolvedAs).length;
  let hiddenLosses = Math.max(0, Math.trunc(Number(player.otherUncertainty || 0)));
  const expectedTotal = ledger.reduce((sum, amount) => sum + amount, 0) + hiddenGains - hiddenLosses;
  const drift = handTotal - expectedTotal;
  if (drift > 0) hiddenGains += drift;
  if (drift < 0) hiddenLosses += -drift;

  const minimums = Array(resources.length).fill(Infinity);
  const maximums = Array(resources.length).fill(0);
  let feasibleCount = 0;
  const candidate = Array(resources.length).fill(0);

  function visit(index, remaining) {
    if (index === resources.length - 1) {
      candidate[index] = remaining;
      let requiredGains = 0;
      let requiredLosses = 0;
      for (let cardIndex = 0; cardIndex < resources.length; cardIndex += 1) {
        const delta = candidate[cardIndex] - ledger[cardIndex];
        if (delta > 0) requiredGains += delta;
        if (delta < 0) requiredLosses += -delta;
      }
      if (requiredGains > hiddenGains || requiredLosses > hiddenLosses) return;
      if (hiddenGains - requiredGains !== hiddenLosses - requiredLosses) return;
      feasibleCount += 1;
      for (let cardIndex = 0; cardIndex < resources.length; cardIndex += 1) {
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
  for (let index = 0; index < resources.length; index += 1) {
    ranges[resources[index]] = feasibleCount
      ? { min: minimums[index], max: maximums[index] }
      : { min: 0, max: Math.max(0, handTotal) };
  }
  return { ranges, feasibleCount, hiddenGains, hiddenLosses, drift };
}

function reconcileTrackerWithHands(state, hands, resourceMap) {
  for (const hand of Object.values(hands?.handsByColor || {})) {
    const player = getMappedPlayer(state, hand.player);
    if (!player) continue;
    player.color = Number(hand.color);
    player.colorLabel = globalThis.ColonistWatcherWsCore?.playerColorLabel?.(hand.color) || `Color ${hand.color}`;
    player.handTotal = Number(hand.total || 0);
    player.snapshotAt = hand.capturedAt;

    if (hand.compositionKnown) {
      const exact = mapCounts(hand.cards || {}, resourceMap);
      player.cards = emptyResourceCounts();
      player.ledger = emptyResourceCounts();
      player.cardRanges = {};
      for (const resource of resources) {
        player.cards[resource] = Number(exact[resource] || 0);
        player.ledger[resource] = player.cards[resource];
        player.cardRanges[resource] = { min: player.cards[resource], max: player.cards[resource] };
      }
      player.snapshotUnknown = 0;
      player.exactHand = true;
      player.estimateConflict = 0;
      refreshMappedPlayer(player);
      continue;
    }

    const solution = calculateResourceRanges(player, player.handTotal);
    const guaranteed = emptyResourceCounts();
    for (const resource of resources) guaranteed[resource] = solution.ranges[resource].min;
    const guaranteedTotal = Object.values(guaranteed).reduce((sum, amount) => sum + amount, 0);
    player.exactHand = false;
    player.cardRanges = solution.ranges;
    player.rangeFeasibleCount = solution.feasibleCount;
    player.rangeDrift = solution.drift;
    player.estimateConflict = solution.feasibleCount ? 0 : Math.abs(solution.drift);
    player.cards = guaranteed;
    player.knownCards = guaranteedTotal;
    player.snapshotUnknown = Math.max(0, player.handTotal - player.knownCards);
    refreshMappedPlayer(player);
  }
  return state;
}

function applyAuthoritativePlayers(state, playersByColor = {}) {
  for (const authoritative of Object.values(playersByColor || {})) {
    const player = getMappedPlayer(state, authoritative.name);
    if (!player) continue;
    player.color = Number(authoritative.color);
    player.colorLabel = authoritative.colorLabel;
    player.score = {
      ...(authoritative.score || {}),
      hiddenVpRisk: Number(authoritative.score?.hiddenVpRisk ?? authoritative.score?.hiddenVictoryPoints ?? 0),
    };
    player.developmentCards = authoritative.developmentCards || { total: 0, cards: {} };
  }
  return state;
}

function makeResourceCard(resource, count = 0, compact = false, displayValue = null) {
  const item = document.createElement("div");
  item.className = `resource-card ${resource}${compact ? " compact" : ""}`;
  item.innerHTML = `
    <div class="card-face" aria-hidden="true"><span class="resource-glyph">${resourceMark[resource]}</span></div>
    <div class="resource-copy"><span>${labels[resource]}</span><strong>${displayValue ?? count ?? 0}</strong></div>
  `;
  return item;
}

function renderResourceRow(container, counts = {}, compact = false, ranges = null) {
  container.innerHTML = "";
  for (const resource of resources) {
    const range = ranges?.[resource];
    const displayValue = range
      ? range.min === range.max ? String(range.min) : `${range.min}-${range.max}`
      : null;
    container.append(makeResourceCard(resource, counts[resource], compact, displayValue));
  }
}

function renderMetric(id, value) {
  text(id, value || 0);
}

function formatUpdateAge(value) {
  const time = Date.parse(value || "");
  if (Number.isNaN(time)) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 2) return "Now";
  if (seconds < 60) return seconds + "s ago";
  return Math.round(seconds / 60) + "m ago";
}

function sourceLabel(source) {
  if (source === "extension-storage") return "Extension";
  return titleCase(source || "Storage");
}

function renderMapping(resourceMap) {
  const root = el("mapControls");
  root.innerHTML = "";
  for (const card of cards) {
    const current = resourceMap?.[card] || defaultResourceMap[card];
    const label = document.createElement("label");
    label.className = `map-card ${current}`;

    const top = document.createElement("div");
    top.className = "map-card-top";
    top.innerHTML = `<span>${labels[card]}</span><strong>${resourceMark[current]}</strong>`;

    const select = document.createElement("select");
    select.dataset.card = card;
    for (const resource of resources) {
      const option = document.createElement("option");
      option.value = resource;
      option.textContent = labels[resource];
      if (resource === current) option.selected = true;
      select.append(option);
    }
    select.addEventListener("change", saveMapping);
    label.append(top, select);
    root.append(label);
  }
}

async function saveMapping() {
  const next = {};
  for (const select of document.querySelectorAll("#mapControls select")) next[select.dataset.card] = select.value;
  if (isExtensionPage()) await storageSet({ colonistWatcherResourceMap: next });
  await load();
}

function playerColorValue(color) {
  const verified = { 1: "#d64f45", 2: "#287fc5", 3: "#e78a28", 4: "#3a9b50", 5: "#30353a" };
  const numeric = Number(color);
  if (verified[numeric]) return verified[numeric];
  const hue = Number.isFinite(numeric) ? (numeric * 67 + 19) % 360 : 42;
  return `hsl(${hue} 58% 43%)`;
}

function renderPlayers(players = []) {
  const root = el("players");
  root.innerHTML = "";
  text("uncertain", String(players.reduce((sum, player) => sum + (player.uncertainty || 0), 0)));

  if (!players.length) {
    root.innerHTML = "<div class='empty'>Waiting for player card data. Start a game and the tracker fills in automatically.</div>";
    return;
  }

  for (const player of players) {
    const item = document.createElement("article");
    item.className = `player color-${player.color || "unknown"}`;
    item.style?.setProperty?.("--player-color", playerColorValue(player.color));

    const resourcesRow = document.createElement("div");
    resourcesRow.className = "resource-row";
    renderResourceRow(resourcesRow, player.cards, true, player.cardRanges);

    const resolved = (player.resolvedHiddenCards || []).length;
    const totalCopy = player.handTotal == null
      ? `${player.knownCards || 0} identified cards`
      : player.exactHand
        ? `${player.handTotal} cards, exact hand`
        : `${player.knownCards || 0} identified of ${player.handTotal} cards`;
    item.innerHTML = `
      <div class="player-head">
        <div>
          <strong><span class="player-color-dot" aria-hidden="true"></span>${safeText(player.name)}</strong>
          <span>${safeText(player.colorLabel || "Color unknown")} ? ${safeText(totalCopy)}</span>
        </div>
        <div class="risk-badge ${(player.uncertainty || 0) ? "warn" : "clear"}">${player.uncertainty || 0} unresolved</div>
      </div>
    `;
    item.append(resourcesRow);

    const meta = document.createElement("div");
    meta.className = "player-meta";
    meta.innerHTML = `
      <span>Visible VP <strong>${player.score?.visiblePoints ?? 0}</strong></span>
      <span>Hidden VP <strong>${player.score?.hiddenVpRisk > (player.score?.hiddenVictoryPoints || 0) ? `${player.score?.hiddenVictoryPoints || 0}-${player.score.hiddenVpRisk}` : player.score?.hiddenVictoryPoints ?? 0}</strong></span>
      <span>Hand total <strong>${player.handTotal ?? player.knownCards ?? 0}</strong></span>
      <span>Resolved hidden <strong>${resolved}</strong></span>
      <span>Dev bought <strong>${player.devCardsBought || 0}</strong></span>
      <span>Dev played <strong>${player.devCardsPlayed || 0}</strong></span>
    `;
    item.append(meta);
    root.append(item);
  }
}

function renderWinWatch(items = []) {
  const root = el("winWatch");
  if (!root) return;
  root.innerHTML = "";
  text("winWatchMeta", items.length ? "Current tracked hand can-build risk." : "Waiting for player card data.");
  if (!items.length) {
    root.innerHTML = "<div class='empty'>Win risk appears after player card data is decoded.</div>";
    return;
  }
  for (const item of items) {
    const node = document.createElement("article");
    node.className = `win-watch-card ${item.status}`;
    const label = item.status === "danger"
      ? "WIN NOW"
      : item.status === "watch"
        ? "Hidden VP"
        : item.status === "unknown"
          ? "Unknown"
          : item.status === "close"
            ? "Close"
            : "Stable";
    const builds = (item.builds || []).join(" + ") || "no point build";
    node.innerHTML = `
      <div class="win-watch-top"><strong>${safeText(item.player)}</strong><span>${label}</span></div>
      <div class="win-watch-score">${item.visiblePoints}+${item.buildPoints}${item.hiddenVpRisk ? "+" + item.hiddenVpRisk : ""} VP</div>
      <small>${safeText(builds)}${item.uncertainty ? ` / ${item.uncertainty} unknown` : ""}</small>
    `;
    root.append(node);
  }
}
function renderDevDeckWatch(deck) {
  const root = el("devDeckWatch");
  if (!root) return;
  root.innerHTML = "";
  if (!deck || (!deck.bought && !deck.playedTotal)) {
    text("devDeckMeta", "Waiting for bought or played dev cards.");
    root.innerHTML = "<div class='empty'>Dev card counts appear after buys or plays are decoded.</div>";
    return;
  }
  text("devDeckMeta", deck.bought + " bought / " + deck.playedTotal + " played / " + deck.hiddenInHands + " unplayed in hands");
  for (const item of deck.rows) {
    const node = document.createElement("article");
    node.className = "dev-watch-card " + (item.exhausted ? "exhausted" : item.known ? "known" : "unknown");
    const title = titleCase(item.name);
    const countLine = item.known
      ? item.played + "/" + item.limit + " played"
      : item.played + " played, protocol label unknown";
    const status = item.exhausted
      ? "Exhausted"
      : item.known
        ? item.remaining + " not played"
        : "Needs mapping";
    node.innerHTML = [
      '<div class="dev-watch-top"><strong>' + safeText(title) + '</strong><span>' + safeText(status) + '</span></div>',
      "<small>" + safeText(countLine) + "</small>"
    ].join("");
    root.append(node);
  }
}

function renderTradeWarnings(warnings = []) {
  const root = el("tradeWarnings");
  root.innerHTML = "";
  root.classList.toggle("active", Boolean(warnings.length));
  if (!warnings.length) return;

  for (const warning of warnings) {
    const item = document.createElement("article");
    item.className = `trade-warning ${warning.reachesWin ? "danger" : "watch"}`;
    const builds = (warning.builds || []).join(" + ") || "builds";
    const headline = warning.reachesWin
      ? " can win from this trade"
      : warning.reachesWinWithHidden
        ? " has hidden VP win risk"
        : " gets close from this trade";
    const hiddenCopy = warning.hiddenVpRisk ? ` + up to ${warning.hiddenVpRisk} hidden VP risk` : "";
    item.innerHTML = `
      <strong>${safeText(warning.player)}${headline}</strong>
      <span>${safeText(warning.line)}</span>
      <small>Visible VP ${warning.currentPoints || 0} + ${warning.possiblePoints || 0} via ${safeText(builds)}${hiddenCopy}</small>
    `;
    root.append(item);
  }
}

function renderTradeVerdict(check) {
  const root = el("tradeVerdict");
  if (!root) return;
  const status = check?.status || "idle";
  root.className = `trade-verdict ${status}`;
  if (!check) {
    text("tradeVerdictTitle", "Waiting for trade");
    text("tradeVerdictBody", "Every 0.5 seconds, the dashboard checks the newest trade against tracked cards and VP.");
    return;
  }
  const title = status === "danger"
    ? "WIN RISK"
    : status === "watch"
      ? "HIDDEN VP RISK"
      : status === "safe"
        ? "SAFE"
        : "UNKNOWN";
  text("tradeVerdictTitle", `${title} - ${check.result}`);
  text("tradeVerdictBody", check.line || "Latest trade checked.");
}
function renderEvents(events = []) {
  const root = el("events");
  root.innerHTML = "";
  if (!events.length) {
    root.innerHTML = "<li class='empty'>Waiting for parsed game events.</li>";
    return;
  }

  for (const event of events) {
    const item = document.createElement("li");
    item.className = `event event-${String(event.type || "unknown").replaceAll("_", "-")}`;
    item.innerHTML = `
      <div class="event-type">${titleCase(event.type)}</div>
      <div class="event-line">${safeText(event.line || titleCase(event.type))}</div>
    `;
    root.append(item);
  }
}

function buildExtensionState(data) {
  const resourceMap = { ...defaultResourceMap };
  const rawLogs = data.colonistRawLogs || [];
  const parsedEvents = data.colonistEvents || [];
  const webSocketFrames = data.colonistWebSocketFrames || [];
  const localPlayerName = data.colonistWatcherLocalPlayerName || data.colonistWatcherLiveSnapshot?.localPlayerName || "";
  const playerContext = data.colonistWatcherPlayerContext || {};
  const analysis = globalThis.ColonistWatcherWsCore?.analyzeFrames
    ? globalThis.ColonistWatcherWsCore.analyzeFrames(webSocketFrames, {
        localPlayerName,
        localColor: playerContext.localColor,
        playersByColor: playerContext.playersByColor,
        rawLogs: data.colonistAllRawLogs || rawLogs,
      })
    : { events: parsedEvents, tracker: { players: {} }, decodedCount: 0, localNonEmptyHand: null, hands: { handsByColor: {} } };
  const events = analysis.events?.length ? analysis.events : parsedEvents;
  const byType = countByType(events);
  const tracker = applyAuthoritativePlayers(
    reconcileTrackerWithHands(buildMappedTracker(events, resourceMap), analysis.hands, resourceMap),
    analysis.playersByColor
  );
  const trackerPlayers = tracker.players || {};
  const scoreState = estimateScoreState(events, trackerPlayers);
  const uncertaintyCount = Object.values(trackerPlayers).reduce((sum, player) => sum + Number(player.uncertainty || 0), 0);
  const players = Object.values(trackerPlayers)
    .map((player) => ({ ...player, score: scoreState[player.name] || null }))
    .sort((a, b) => Number(a.color || 99) - Number(b.color || 99) || a.name.localeCompare(b.name));
  const handSource = analysis.localNonEmptyHand || data.colonistWatcherLiveSnapshot?.hand || null;
  const hand = handSource ? { ...handSource, cards: mapCounts(handSource.cards, resourceMap) } : null;

  return {
    ok: true,
    source: "extension-storage",
    version: extensionVersion(),
    resourceMap,
    localPlayerName,
    updatedAt: data.colonistWatcherLiveSnapshotAt || data.colonistWatcherActiveAt || null,
    resetAt: data.colonistWatcherAutoResetAt || null,
    resetReason: data.colonistWatcherAutoResetReason || null,
    counts: {
      rawLogs: rawLogs.length,
      allRawLogs: (data.colonistAllRawLogs || rawLogs).length,
      webSocketFrames: webSocketFrames.length,
      decodedFrames: analysis.decodedCount || 0,
      events: events.length,
      rolls: byType.dice_roll || 0,
      gains: (byType.resource_gain || 0) + (byType.monopoly_gain || 0),
      setupGains: events.filter((event) => event.type === "resource_gain" && event.distributionType === 0).length,
      trades: (byType.player_trade || 0) + (byType.bank_trade || 0),
      builds: (byType.build_road || 0) + (byType.build_settlement || 0) + (byType.build_city || 0),
      uncertain: uncertaintyCount + (byType.unknown_ws_log || 0) + (byType.unknown || 0),
    },
    hand,
    tradeWarnings: buildTradeWarnings(events, trackerPlayers, resourceMap, localPlayerName),
    tradeChecks: buildTradeCheckSummary(events, trackerPlayers, resourceMap),
    devDeck: buildDevDeckWatch(events),
    winWatch: buildWinWatch(players),
    players,
    events: latestEvents(events, resourceMap),
  };
}

async function loadState() {
  if (isExtensionPage()) {
    const data = await storageGet({
      colonistAllRawLogs: [],
      colonistEvents: [],
      colonistRawLogs: [],
      colonistWebSocketFrames: [],
      colonistWatcherActiveAt: null,
      colonistWatcherAutoResetAt: null,
      colonistWatcherAutoResetReason: null,
      colonistWatcherLiveSnapshot: null,
      colonistWatcherLiveSnapshotAt: null,
      colonistWatcherLocalPlayerName: "KabaliKhan",
      colonistWatcherPlayerContext: null,
      colonistWatcherResourceMap: defaultResourceMap,
    });
    return buildExtensionState(data);
  }

  return { ok: false, error: "Open the dashboard from the extension.", resourceMap: defaultResourceMap, counts: {} };
}

function formatResetStatus(resetAt, resetReason) {
  if (!resetAt) return "Never";
  const reason = resetReason === "manual-reset" ? "Manual" : resetReason === "game-start" ? "Auto" : "Reset";
  return `${reason} ${formatUpdateAge(resetAt)}`;
}
function renderStatus(next) {
  const status = el("status");
  const hasGameData = Boolean(next.counts?.events || next.counts?.webSocketFrames);
  const updatedAt = Date.parse(next.updatedAt || "");
  const isFresh = hasGameData && !Number.isNaN(updatedAt) && Date.now() - updatedAt < 15000;
  status.className = "status " + (next.ok && isFresh ? "ok" : next.ok ? "idle" : "bad");
  status.textContent = next.ok && isFresh ? "Live" : next.ok && hasGameData ? "Stale" : next.ok ? "Waiting" : "Missing";
  if (!next.ok) {
    text("subtitle", next.error || "No game loaded");
    return;
  }
  text("subtitle", isFresh ? "Live game stream" : hasGameData ? "Last game stream is idle" : "Waiting for Colonist game activity");
}

function render(next) {
  renderStatus(next);
  if (!next.ok) return;

  text("stateSource", sourceLabel(next.source));
  text("stateUpdated", formatUpdateAge(next.updatedAt));
  text("stateFrames", next.counts.webSocketFrames || 0);
  text("stateEvents", next.counts.events || 0);
  text("stateReset", formatResetStatus(next.resetAt, next.resetReason));
  text("stateVersion", next.version || "Unknown");
  text("headerVersion", next.version || "Unknown");

  renderMetric("rolls", next.counts.rolls);
  renderMetric("gains", next.counts.gains);
  renderMetric("trades", next.counts.trades);
  renderMetric("builds", next.counts.builds);
  renderMetric("uncertain", next.counts.uncertain || 0);
  text("trackerMeta", next.players.length ? `${next.players.length} players / ${next.counts.events} tracked events` : "Waiting for decoded game events.");
  const latestTradeCheck = next.tradeChecks?.[0];
  text("eventMeta", latestTradeCheck ? `Latest trade check: ${latestTradeCheck.result}` : "Latest useful game events.");
    renderWinWatch(next.winWatch || []);
  renderDevDeckWatch(next.devDeck);
  renderTradeVerdict(latestTradeCheck);
  renderTradeWarnings(next.tradeWarnings || []);
  renderPlayers(next.players);
  if (next.hand) {
    text("handMeta", `${next.hand.total} cards`);
    renderResourceRow(el("hand"), next.hand.cards, true);
  } else {
    text("handMeta", "Waiting for snapshot.");
    el("hand").innerHTML = "";
  }
  renderEvents(next.events);
}

async function load() {
  try {
    render(await loadState());
  } catch (error) {
    render({ ok: false, error: String(error && error.message || error), resourceMap: defaultResourceMap });
  }
}

globalThis.ColonistWatcherDashboardTest = {
  buildExtensionState,
  buildMappedTracker,
  reconcileTrackerWithHands,
  calculateResourceRanges,
  playerColorValue,
};

el("refresh").addEventListener("click", load);
load();
setInterval(load, refreshMs);
