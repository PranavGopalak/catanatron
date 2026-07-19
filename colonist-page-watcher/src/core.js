(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.ColonistWatcherCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const RESOURCE_NAMES = ["brick", "lumber", "ore", "grain", "wool"];
  const RESOURCE_ALIASES = {
    brick: "brick",
    bricks: "brick",
    lumber: "lumber",
    wood: "lumber",
    ore: "ore",
    ores: "ore",
    grain: "grain",
    wheat: "grain",
    wool: "wool",
    sheep: "wool",
  };
  const RESOURCE_WORDS = Object.keys(RESOURCE_ALIASES);
  const DEVELOPMENT_CARD_WORDS = [
    "knight",
    "victory point",
    "road building",
    "year of plenty",
    "monopoly",
  ];
  const BUILD_WORDS = ["road", "settlement", "city"];
  const BUILD_COSTS = {
    build_road: { brick: 1, lumber: 1 },
    build_settlement: { brick: 1, lumber: 1, grain: 1, wool: 1 },
    build_city: { ore: 3, grain: 2 },
    development_card_bought: { ore: 1, grain: 1, wool: 1 },
  };

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function normalizeResourceName(value) {
    return RESOURCE_ALIASES[String(value || "").toLowerCase()];
  }

  function extractResources(line) {
    const lower = String(line || "").toLowerCase();
    return unique(
      RESOURCE_WORDS.filter((resource) => lower.includes(resource)).map(
        (resource) => normalizeResourceName(resource)
      )
    );
  }

  function extractDevelopmentCard(line) {
    const lower = String(line || "").toLowerCase();
    return DEVELOPMENT_CARD_WORDS.find((card) => lower.includes(card));
  }

  function extractBuild(line) {
    const lower = String(line || "").toLowerCase();
    return BUILD_WORDS.find((build) => lower.includes(build));
  }

  function extractPlayer(line) {
    const patterns = [
      /^(.+?)\s+(?:rolled|rolls|received|receives|got|gets|gained|gains|built|builds|placed|places|bought|buys|purchased|traded|trades|gave|gives|discarded|discards|stole|steals|moved|moves|played|plays|used|uses|wants)\b/i,
      /^(.+?)'s turn\b/i,
      /^turn:\s*(.+)$/i,
      /^([^:]{1,32}):\s+.+$/i,
    ];

    for (const pattern of patterns) {
      const match = String(line || "").match(pattern);
      if (match?.[1]) {
        return match[1].replace(/[:,.-]+$/, "").trim();
      }
    }

    return undefined;
  }

  function classifyLine(line) {
    const text = String(line || "");
    const lower = text.toLowerCase();
    const resources = extractResources(text);
    const developmentCard = extractDevelopmentCard(text);
    const player = extractPlayer(text);
    const diceIconMatch = text.match(/^(.+?)\s+(?:rolled|rolls)\s+dice_(\d)\s+dice_(\d)\b/i);
    const diceMatch =
      text.match(/(.+?)\s+(?:rolled|rolls)\s+(?:a\s+)?(\d{1,2})\b/i) ||
      text.match(/(?:dice|roll|rolled):\s*(\d{1,2})\b/i) ||
      text.match(/\b(\d{1,2})\s+was rolled\b/i);

    if (diceIconMatch) {
      const firstDie = Number(diceIconMatch[2]);
      const secondDie = Number(diceIconMatch[3]);
      return {
        type: "dice_roll",
        player: diceIconMatch[1].trim(),
        value: firstDie + secondDie,
        dice: [firstDie, secondDie],
      };
    }

    if (diceMatch) {
      return {
        type: "dice_roll",
        player: diceMatch.length > 2 ? diceMatch[1].trim() : player,
        value: Number(diceMatch[diceMatch.length - 1]),
      };
    }

    if (/\b(game over|won the game|wins the game|victory)\b/i.test(text)) {
      return { type: "game_end", player };
    }
    if (/\b(game started|started the game|initial placement|setup phase)\b/i.test(text)) {
      return { type: "game_start", player };
    }
    if (/\b(longest road)\b/i.test(text)) return { type: "longest_road", player };
    if (/\b(largest army)\b/i.test(text)) return { type: "largest_army", player };
    if (/\bjoined|left|reconnected|disconnected\b/i.test(text)) return { type: "player_status", player };
    if (/^([^:]{1,32}):\s+.+$/i.test(text)) return { type: "chat", player };
    if (/\bended turn|ends turn|end turn|next turn|turn started|starts turn|turn:\b/i.test(text)) {
      return { type: "turn", player };
    }
    if (/\bplayed|plays|used|uses|activated|activates\b/i.test(text) && developmentCard) {
      return { type: "development_card_played", player, developmentCard };
    }
    if (/\b(bought|buys|purchased|takes)\b.*\bdevelopment card\b/i.test(text)) {
      return { type: "development_card_bought", player };
    }

    const build = extractBuild(text);
    if (/\b(built|builds|placed|places|upgraded|upgrades)\b/i.test(text) && build) {
      return { type: `build_${build}`, player, build };
    }
    if (/\btraded with the bank|trades with the bank|maritime trade|port trade|4:1|3:1|2:1\b/i.test(text)) {
      return { type: "bank_trade", player, resources };
    }
    if (/\b(traded|trades|gave|gives|offered|offers|accepted|accepts)\b/i.test(text)) {
      return { type: "player_trade", player, resources };
    }
    if (/\b(discarded|discards)\b/i.test(text)) {
      return { type: "discard", player, resources };
    }
    if (/\b(stole|steals|stolen)\b/i.test(text)) {
      return { type: "steal", player, resources };
    }
    if (/\b(robber|blocked|moved the robber|moves the robber)\b/i.test(text)) {
      return { type: "robber", player };
    }
    if (/\b(received|receives|got|gets|gained|gains|collected|collects)\b/i.test(text)) {
      return { type: "resource_gain", player, resources };
    }
    if (resources.length && /\bfrom\b/i.test(text)) {
      return { type: "resource_gain", player, resources };
    }

    return lower.includes("turn") ? { type: "turn", player } : { type: "unknown" };
  }

  function emptyResources() {
    return RESOURCE_NAMES.reduce((resources, name) => {
      resources[name] = 0;
      return resources;
    }, {});
  }

  function createTrackerState() {
    return {
      players: {},
      trackableEvents: 0,
      uncertainEvents: 0,
      unassignedEvents: 0,
      notes: [],
    };
  }

  function normalizePlayerName(name, options = {}) {
    const value = String(name || "").trim();
    const localPlayerName = String(options.localPlayerName || "").trim();
    if (localPlayerName && /^you$/i.test(value)) return localPlayerName;
    return value;
  }

  function getPlayer(state, name) {
    if (!name) return null;
    const key = String(name).trim();
    if (!key) return null;
    if (!state.players[key]) {
      state.players[key] = {
        name: key,
        resources: emptyResources(),
        devCardsBought: 0,
        devCardsPlayed: 0,
        knownCards: 0,
        uncertainty: 0,
      };
    }
    return state.players[key];
  }

  function refreshKnownCards(player) {
    player.knownCards = RESOURCE_NAMES.reduce(
      (total, resource) => total + player.resources[resource],
      0
    );
  }

  function addResourceDeltas(player, deltas, multiplier) {
    for (const resource of RESOURCE_NAMES) {
      const amount = deltas[resource] || 0;
      if (!amount) continue;
      player.resources[resource] = Math.max(
        0,
        player.resources[resource] + amount * multiplier
      );
    }
    refreshKnownCards(player);
  }

  function subtractCost(player, cost) {
    let missing = 0;
    for (const resource of RESOURCE_NAMES) {
      const amount = cost[resource] || 0;
      if (!amount) continue;
      const nextValue = player.resources[resource] - amount;
      if (nextValue < 0) {
        missing += Math.abs(nextValue);
        player.resources[resource] = 0;
      } else {
        player.resources[resource] = nextValue;
      }
    }
    if (missing) player.uncertainty += missing;
    refreshKnownCards(player);
  }

  function extractResourceDeltas(line, resources) {
    const deltas = emptyResources();
    const lower = String(line || "").toLowerCase();
    const seen = new Set();
    const resourcePattern = Object.keys(RESOURCE_ALIASES).join("|");
    const countFirst = new RegExp(`\\b(\\d+)\\s+(${resourcePattern})\\b`, "gi");
    const resourceFirst = new RegExp(`\\b(${resourcePattern})\\s*(?:x|:)?\\s*(\\d+)\\b`, "gi");

    for (const match of lower.matchAll(countFirst)) {
      const resource = normalizeResourceName(match[2]);
      if (!resource) continue;
      deltas[resource] += Number(match[1]);
      seen.add(resource);
    }
    for (const match of lower.matchAll(resourceFirst)) {
      const resource = normalizeResourceName(match[1]);
      if (!resource) continue;
      deltas[resource] += Number(match[2]);
      seen.add(resource);
    }
    for (const resource of resources || []) {
      const normalized = normalizeResourceName(resource) || resource;
      if (RESOURCE_NAMES.includes(normalized) && !seen.has(normalized)) {
        deltas[normalized] += 1;
      }
    }
    return deltas;
  }

  function hasAnyDelta(deltas) {
    return RESOURCE_NAMES.some((resource) => deltas[resource] > 0);
  }

  function applyTrackerEvent(state, event, options = {}) {
    const type = event.type || "unknown";
    const isTrackable = [
      "resource_gain",
      "build_road",
      "build_settlement",
      "build_city",
      "development_card_bought",
      "development_card_played",
      "discard",
      "steal",
      "player_trade",
      "bank_trade",
    ].includes(type);
    if (!isTrackable) return state;

    const player = getPlayer(state, normalizePlayerName(event.player, options));
    state.trackableEvents += 1;
    if (!player) {
      state.unassignedEvents += 1;
      state.uncertainEvents += 1;
      return state;
    }
    if (type === "resource_gain") {
      const deltas = extractResourceDeltas(event.line, event.resources);
      if (hasAnyDelta(deltas)) addResourceDeltas(player, deltas, 1);
      else {
        player.uncertainty += 1;
        state.uncertainEvents += 1;
      }
      return state;
    }
    if (BUILD_COSTS[type]) {
      subtractCost(player, BUILD_COSTS[type]);
      if (type === "development_card_bought") player.devCardsBought += 1;
      return state;
    }
    if (type === "development_card_played") {
      player.devCardsPlayed += 1;
      return state;
    }
    if (type === "discard") {
      const deltas = extractResourceDeltas(event.line, event.resources);
      if (hasAnyDelta(deltas)) addResourceDeltas(player, deltas, -1);
      else {
        player.uncertainty += 1;
        state.uncertainEvents += 1;
      }
      return state;
    }
    if (type === "steal") {
      const deltas = extractResourceDeltas(event.line, event.resources);
      if (hasAnyDelta(deltas)) addResourceDeltas(player, deltas, 1);
      player.uncertainty += 1;
      state.uncertainEvents += 1;
      return state;
    }
    if (type === "player_trade" || type === "bank_trade") {
      player.uncertainty += 1;
      state.uncertainEvents += 1;
    }
    return state;
  }

  function chronologicalEvents(events) {
    return (events || []).slice().sort((a, b) => {
      const aTime = Date.parse(a.capturedAt || "");
      const bTime = Date.parse(b.capturedAt || "");
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
      return aTime - bTime;
    });
  }

  function buildTracker(events, options = {}) {
    let state = createTrackerState();
    for (const event of chronologicalEvents(events)) {
      if (event.type === "game_start") state = createTrackerState();
      applyTrackerEvent(state, event, options);
    }
    return state;
  }

  function summarizeEvents(events, rawLogs) {
    const byType = events.reduce((counts, event) => {
      const type = event.type || "unknown";
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
    const knownCount = events.filter((event) => event.type !== "unknown").length;
    const unknownCount = events.length - knownCount;
    const unknownRate = events.length ? unknownCount / events.length : 1;
    const buildCount = events.filter((event) => event.type?.startsWith("build_")).length;
    const tradeCount = events.filter((event) => ["player_trade", "bank_trade", "trade"].includes(event.type)).length;
    const developmentCardCount =
      (byType.development_card || 0) +
      (byType.development_card_bought || 0) +
      (byType.development_card_played || 0);
    const coveredGroups = [
      byType.dice_roll,
      byType.resource_gain,
      tradeCount,
      byType.robber,
      byType.steal,
      byType.discard,
      developmentCardCount,
      buildCount,
    ].filter(Boolean).length;
    const missingGroups = [
      ["dice rolls", byType.dice_roll],
      ["resource gains", byType.resource_gain],
      ["trades", tradeCount],
      ["robber", byType.robber],
      ["steals", byType.steal],
      ["discards", byType.discard],
      ["dev cards", developmentCardCount],
      ["builds", buildCount],
    ]
      .filter(([, count]) => !count)
      .map(([label]) => label);
    const rawTotal = rawLogs?.length || 0;
    return {
      byType,
      buildCount,
      coveredGroups,
      developmentCardCount,
      enough: rawTotal >= 40 && (byType.dice_roll || 0) >= 4 && (byType.resource_gain || 0) >= 4 && coveredGroups >= 5 && unknownRate <= 0.35,
      enoughRawEvidence: rawTotal >= 40,
      knownCount,
      missingGroups,
      rawTotal,
      total: events.length,
      tradeCount,
      unknownCount,
      unknownRate,
    };
  }


  function normalizePattern(line) {
    return String(line || "")
      .replace(/#[A-Za-z0-9_-]+/g, "#ID")
      .replace(/\b\d+\b/g, "#")
      .replace(/\b(brick|bricks|wood|lumber|ore|ores|grain|wheat|wool|sheep)\b/gi, "RESOURCE")
      .replace(/^[A-Z][A-Za-z0-9_ -]{1,24}\b(?=\s)/, "PLAYER")
      .replace(/\s+/g, " ")
      .trim();
  }

  function unknownPatternCandidates(events, limit = 20) {
    const groups = new Map();
    for (const event of events || []) {
      if (event.type !== "unknown") continue;
      const pattern = normalizePattern(event.line);
      if (!groups.has(pattern)) {
        groups.set(pattern, { count: 0, pattern, examples: [] });
      }
      const group = groups.get(pattern);
      group.count += 1;
      if (group.examples.length < 3 && !group.examples.includes(event.line)) {
        group.examples.push(event.line);
      }
    }
    return Array.from(groups.values())
      .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
      .slice(0, limit);
  }
  function eventsFromRawLogs(rawLogs) {
    return (rawLogs || []).map((log) => ({
      id: log.id,
      sessionId: log.sessionId,
      sequence: log.sequence,
      line: log.line,
      source: log.source,
      url: log.url,
      capturedAt: log.capturedAt,
      ...classifyLine(log.line),
    }));
  }

  return {
    BUILD_COSTS,
    RESOURCE_NAMES,
    classifyLine,
    buildTracker,
    chronologicalEvents,
    createTrackerState,
    eventsFromRawLogs,
    extractResourceDeltas,
    normalizePattern,
    normalizePlayerName,
    summarizeEvents,
    unknownPatternCandidates,
  };
});