(function (root, factory) {
  root.ColonistWatcherWsCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CARD_LABELS = {
    0: "hidden_resource_card",
    1: "card_1",
    2: "card_2",
    3: "card_3",
    4: "card_4",
    5: "card_5",
    9: "unknown_resource_card",
    10: "development_card_back",
    11: "knight",
    12: "victory point",
    13: "monopoly",
    14: "road building",
    15: "year of plenty",
  };
  const PIECE_LABELS = { 0: "road", 2: "settlement", 3: "city", 5: "robber" };
  const PLAYER_COLORS = { 1: "Red", 2: "Blue", 3: "Orange", 4: "Green", 5: "Black" };

  function cardLabel(cardEnum) {
    return CARD_LABELS[cardEnum] || `card_${cardEnum}`;
  }

  function cardsToCounts(cardEnums) {
    const counts = {};
    for (const cardEnum of cardEnums || []) {
      const label = cardLabel(cardEnum);
      counts[label] = (counts[label] || 0) + 1;
    }
    return counts;
  }

  function base64ToBytes(base64) {
    const binary = atob(base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function readUInt(bytes, offset, length) {
    let value = 0;
    for (let index = 0; index < length; index += 1) value = value * 256 + bytes[offset + index];
    return value;
  }

  function readInt(bytes, offset, length) {
    const unsigned = readUInt(bytes, offset, length);
    const sign = 2 ** (length * 8 - 1);
    return unsigned >= sign ? unsigned - 2 ** (length * 8) : unsigned;
  }

  function readFloat(bytes, offset, length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, length);
    return length === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
  }

  function decode(bytes, offset) {
    const marker = bytes[offset++];
    if (marker <= 0x7f) return [marker, offset];
    if (marker >= 0xe0) return [marker - 0x100, offset];
    if ((marker & 0xe0) === 0xa0) return readString(bytes, offset, marker & 0x1f);
    if ((marker & 0xf0) === 0x90) return readArray(bytes, offset, marker & 0x0f);
    if ((marker & 0xf0) === 0x80) return readMap(bytes, offset, marker & 0x0f);

    switch (marker) {
      case 0xc0: return [null, offset];
      case 0xc2: return [false, offset];
      case 0xc3: return [true, offset];
      case 0xc4: return readBinary(bytes, offset + 1, bytes[offset]);
      case 0xc5: return readBinary(bytes, offset + 2, readUInt(bytes, offset, 2));
      case 0xc6: return readBinary(bytes, offset + 4, readUInt(bytes, offset, 4));
      case 0xca: return [readFloat(bytes, offset, 4), offset + 4];
      case 0xcb: return [readFloat(bytes, offset, 8), offset + 8];
      case 0xcc: return [bytes[offset], offset + 1];
      case 0xcd: return [readUInt(bytes, offset, 2), offset + 2];
      case 0xce: return [readUInt(bytes, offset, 4), offset + 4];
      case 0xcf: return [readUInt(bytes, offset, 8), offset + 8];
      case 0xd0: return [readInt(bytes, offset, 1), offset + 1];
      case 0xd1: return [readInt(bytes, offset, 2), offset + 2];
      case 0xd2: return [readInt(bytes, offset, 4), offset + 4];
      case 0xd3: return [readInt(bytes, offset, 8), offset + 8];
      case 0xd9: return readString(bytes, offset + 1, bytes[offset]);
      case 0xda: return readString(bytes, offset + 2, readUInt(bytes, offset, 2));
      case 0xdb: return readString(bytes, offset + 4, readUInt(bytes, offset, 4));
      case 0xdc: return readArray(bytes, offset + 2, readUInt(bytes, offset, 2));
      case 0xdd: return readArray(bytes, offset + 4, readUInt(bytes, offset, 4));
      case 0xde: return readMap(bytes, offset + 2, readUInt(bytes, offset, 2));
      case 0xdf: return readMap(bytes, offset + 4, readUInt(bytes, offset, 4));
      default: throw new Error(`Unsupported MessagePack marker 0x${marker.toString(16)}`);
    }
  }

  function readString(bytes, offset, length) {
    return [new TextDecoder().decode(bytes.slice(offset, offset + length)), offset + length];
  }

  function readBinary(bytes, offset, length) {
    return [{ __type: "binary", length }, offset + length];
  }

  function readArray(bytes, offset, length) {
    const value = [];
    for (let index = 0; index < length; index += 1) {
      let item;
      [item, offset] = decode(bytes, offset);
      value.push(item);
    }
    return [value, offset];
  }

  function readMap(bytes, offset, length) {
    const value = {};
    for (let index = 0; index < length; index += 1) {
      let key;
      let item;
      [key, offset] = decode(bytes, offset);
      [item, offset] = decode(bytes, offset);
      value[String(key)] = item;
    }
    return [value, offset];
  }

  function findStart(bytes) {
    for (let offset = 0; offset < bytes.length; offset += 1) {
      try {
        const [value] = decode(bytes, offset);
        if (value && typeof value === "object") return offset;
      } catch (_error) {}
    }
    return 0;
  }

  function decodeFrame(frame) {
    if (!frame?.base64) return null;
    const bytes = base64ToBytes(frame.base64);
    const start = frame.direction === "out" ? findStart(bytes) : 0;
    const [value] = decode(bytes, start);
    return {
      frame,
      value,
      messageType: value?.data?.type ?? value?.type,
      payload: value?.data?.payload ?? value?.payload,
      sequence: value?.data?.sequence ?? value?.sequence,
    };
  }

  function decodeFrames(frames) {
    const decoded = [];
    for (const frame of frames || []) {
      try {
        const item = decodeFrame(frame);
        if (item) decoded.push(item);
      } catch (_error) {}
    }
    return decoded;
  }

  function buildContext(decodedFrames, options = {}) {
    const context = {
      playersByColor: { ...(options.playersByColor || {}) },
      localColor: undefined,
      colors: { ...PLAYER_COLORS },
    };
    for (const decoded of decodedFrames || []) {
      const payload = decoded.payload;
      if (!payload || typeof payload !== "object") continue;
      const users = payload.playerUserStates || [];
      for (const user of users) {
        if (user?.selectedColor !== undefined) context.playersByColor[String(user.selectedColor)] = user;
      }
      if (users.length && payload.playerColor !== undefined) context.localColor = Number(payload.playerColor);
      const states = readPlayerStates(payload);
      for (const [color, state] of Object.entries(states || {})) {
        const cards = state?.resourceCards?.cards;
        if (Array.isArray(cards) && cards.some((card) => Number(card) > 0)) context.localColor = Number(color);
      }
    }

    for (const [color, username] of Object.entries(options.playerNamesByColor || {})) {
      if (!username) continue;
      context.playersByColor[String(color)] = {
        ...(context.playersByColor[String(color)] || {}),
        selectedColor: Number(color),
        username,
      };
    }
    const recoveredNames = recoverPlayerNames(decodedFrames, options.rawLogs || [], { localPlayerName: options.localPlayerName, localColor: context.localColor });
    for (const [color, username] of Object.entries(recoveredNames)) {
      if (!username) continue;
      context.playersByColor[String(color)] = {
        ...(context.playersByColor[String(color)] || {}),
        selectedColor: Number(color),
        username,
      };
    }

    const localPlayerName = String(options.localPlayerName || "").trim();
    if (localPlayerName) {
      const namedLocal = Object.entries(context.playersByColor).find(([, player]) =>
        String(player?.username || "").localeCompare(localPlayerName, undefined, { sensitivity: "accent" }) === 0
      );
      if (namedLocal) context.localColor = Number(namedLocal[0]);
    }
    if (context.localColor === undefined && options.localColor !== undefined) {
      const storedPlayer = options.playersByColor?.[String(options.localColor)];
      if (!localPlayerName || String(storedPlayer?.username || "") === localPlayerName) {
        context.localColor = Number(options.localColor);
      }
    }
    if (context.localColor !== undefined && localPlayerName) {
      const key = String(context.localColor);
      context.playersByColor[key] = {
        ...(context.playersByColor[key] || {}),
        selectedColor: Number(context.localColor),
        username: localPlayerName,
      };
    }
    return context;
  }

  function rawLogLines(rawLogs) {
    return (rawLogs || []).map((entry) => String(entry?.line || entry || "")).filter(Boolean);
  }

  function recoverPlayerNames(decodedFrames, rawLogs, anchor = {}) {
    const lines = rawLogLines(rawLogs);
    const roster = [];
    for (const line of lines) {
      const matches = Array.from(line.matchAll(/\b([A-Za-z0-9_-]{2,24})\s+0\s+0\s+0\s+0\s+0\b/g));
      if (matches.length < 2) continue;
      for (const match of matches) if (!roster.includes(match[1])) roster.push(match[1]);
      break;
    }
    if (roster.length < 2) return {};
    const firstPlacer = lines
      .map((line) => line.match(/\b([A-Za-z0-9_-]{2,24})\s+is\s+Placing\s+Settlement\b/i))
      .find(Boolean)?.[1];

    const setupColors = [];
    for (const log of extractLogs(decodedFrames)) {
      const text = log.text || {};
      if ((text.type !== 4 && text.type !== 5) || text.pieceEnum !== 2 || text.playerColor === undefined) continue;
      const color = Number(text.playerColor);
      if (!setupColors.includes(color)) setupColors.push(color);
      if (setupColors.length === roster.length) break;
    }
    if (setupColors.length !== roster.length) return {};
    let rosterOffset = -1;
    if (firstPlacer && roster.includes(firstPlacer)) {
      rosterOffset = roster.indexOf(firstPlacer);
    } else {
      const localNameIndex = roster.indexOf(String(anchor.localPlayerName || ""));
      const localColorIndex = setupColors.indexOf(Number(anchor.localColor));
      if (localNameIndex >= 0 && localColorIndex >= 0) {
        rosterOffset = (localNameIndex - localColorIndex + roster.length) % roster.length;
      }
    }
    if (rosterOffset < 0) return {};
    const orderedRoster = setupColors.map((_, index) => roster[(index + rosterOffset) % roster.length]);
    return Object.fromEntries(setupColors.map((color, index) => [String(color), orderedRoster[index]]));
  }

  function playerName(context, color) {
    return context.playersByColor[String(color)]?.username || `${PLAYER_COLORS[color] || "Color " + color} player`;
  }

  function readPlayerStates(payload) {
    return payload?.gameState?.playerStates || payload?.diff?.playerStates || null;
  }

  function isNewerHand(candidate, current) {
    if (!current) return true;
    const candidateSequence = Number(candidate.messageSequence || candidate.frameSequence || 0);
    const currentSequence = Number(current.messageSequence || current.frameSequence || 0);
    if (candidateSequence || currentSequence) return candidateSequence > currentSequence;
    return Date.parse(candidate.capturedAt || "") > Date.parse(current.capturedAt || "");
  }

  function extractHands(decodedFrames, context) {
    const handsByColor = {};
    const latestNonEmptyHandsByColor = {};
    for (const decoded of decodedFrames || []) {
      const states = readPlayerStates(decoded.payload);
      if (!states || typeof states !== "object") continue;
      for (const [color, state] of Object.entries(states)) {
        const cards = state?.resourceCards?.cards;
        if (!Array.isArray(cards)) continue;
        const hand = {
          color: Number(color),
          player: playerName(context, color),
          cards: cardsToCounts(cards),
          rawCards: cards.slice(),
          total: cards.length,
          capturedAt: decoded.frame?.capturedAt,
          frameSequence: decoded.frame?.webSocketSequence,
          messageSequence: decoded.sequence,
          isLocal: Number(color) === Number(context.localColor),
          compositionKnown: cards.some((card) => Number(card) > 0),
        };
        const colorKey = String(color);
        if (isNewerHand(hand, handsByColor[colorKey])) handsByColor[colorKey] = hand;
        if (hand.total > 0 && isNewerHand(hand, latestNonEmptyHandsByColor[colorKey])) latestNonEmptyHandsByColor[colorKey] = hand;
      }
    }
    const localHand = context.localColor === undefined ? null : handsByColor[String(context.localColor)] || null;
    const localNonEmptyHand = context.localColor === undefined ? null : latestNonEmptyHandsByColor[String(context.localColor)] || null;
    return { handsByColor, latestNonEmptyHandsByColor, localHand, localNonEmptyHand };
  }

  function extractAuthoritativePlayers(decodedFrames, context, hands) {
    const scoreComponentsByColor = {};
    const developmentCardsByColor = {};
    const observedColors = new Set();
    const ordered = (decodedFrames || []).slice().sort((a, b) => Number(a.frame?.webSocketSequence || 0) - Number(b.frame?.webSocketSequence || 0));
    for (const decoded of ordered) {
      const states = readPlayerStates(decoded.payload);
      for (const [color, state] of Object.entries(states || {})) {
        observedColors.add(String(color));
        if (state?.victoryPointsState && typeof state.victoryPointsState === "object") {
          scoreComponentsByColor[color] = { ...(scoreComponentsByColor[color] || {}), ...state.victoryPointsState };
        }
      }
      for (const item of Array.isArray(decoded.payload) ? decoded.payload : []) {
        if (item?.owner !== undefined) observedColors.add(String(item.owner));
      }
      const logState = decoded.payload?.gameState?.gameLogState || decoded.payload?.diff?.gameLogState;
      for (const entry of Object.values(logState || {})) {
        const text = entry?.text || {};
        for (const key of ["playerColor", "playerColorThief", "playerColorVictim", "playerColorCreator", "acceptingPlayerColor"]) {
          if (text[key] !== undefined) observedColors.add(String(text[key]));
        }
      }
      const mechanic = decoded.payload?.gameState?.mechanicDevelopmentCardsState || decoded.payload?.diff?.mechanicDevelopmentCardsState;
      for (const [color, state] of Object.entries(mechanic?.players || {})) {
        observedColors.add(String(color));
        const cards = state?.developmentCards?.cards;
        if (Array.isArray(cards)) developmentCardsByColor[color] = cards.slice();
      }
    }

    const colors = new Set([...Object.keys(context.playersByColor || {}), ...Object.keys(hands?.handsByColor || {}), ...Object.keys(scoreComponentsByColor), ...Object.keys(developmentCardsByColor), ...observedColors]);
    const playersByColor = {};
    for (const color of colors) {
      const components = scoreComponentsByColor[color] || {};
      const settlements = Number(components[0] || 0);
      const cities = Number(components[1] || 0);
      const hiddenVictoryPoints = Number(components[2] || 0);
      const largestArmy = Number(components[3] || 0);
      const longestRoad = Number(components[4] || 0);
      const visiblePoints = settlements + cities * 2 + largestArmy * 2 + longestRoad * 2;
      const developmentCards = developmentCardsByColor[color] || [];
      const developmentCompositionKnown = developmentCards.some((card) => Number(card) > 0 && Number(card) !== 10);
      const hiddenVpRisk = developmentCompositionKnown ? hiddenVictoryPoints : developmentCards.length;
      playersByColor[color] = {
        color: Number(color),
        colorLabel: PLAYER_COLORS[color] || `Color ${color}`,
        name: playerName(context, color),
        score: {
          authoritative: Object.keys(components).length > 0,
          visiblePoints,
          hiddenVictoryPoints,
          hiddenVpRisk,
          totalPoints: visiblePoints + hiddenVictoryPoints,
          settlements,
          cities,
          largestArmy,
          longestRoad,
          raw: { ...components },
        },
        developmentCards: {
          total: developmentCards.length,
          compositionKnown: developmentCompositionKnown,
          cards: cardsToCounts(developmentCards),
          rawCards: developmentCards.slice(),
        },
      };
    }
    return { playersByColor, scoreComponentsByColor, developmentCardsByColor };
  }

  function extractLogs(decodedFrames) {
    const logs = [];
    for (const decoded of decodedFrames || []) {
      const state = decoded.payload?.gameState?.gameLogState || decoded.payload?.diff?.gameLogState;
      if (!state) continue;
      for (const [logId, entry] of Object.entries(state)) {
        if (!entry) continue;
        logs.push({ logId: Number(logId), entry, text: entry.text || {}, decoded });
      }
    }
    return logs.sort((a, b) => a.logId - b.logId);
  }

  function translateLog(log, context) {
    const text = log.text;
    const base = {
      logId: log.logId,
      protocolType: text.type,
      raw: text,
      source: "websocket",
      capturedAt: log.decoded?.frame?.capturedAt,
      frameSequence: log.decoded?.frame?.webSocketSequence,
      messageSequence: log.decoded?.sequence,
    };
    if (text.type === 10) return { ...base, type: "dice_roll", player: playerName(context, text.playerColor), value: text.firstDice + text.secondDice, dice: [text.firstDice, text.secondDice] };
    if (text.type === 47) return { ...base, type: "resource_gain", player: playerName(context, text.playerColor), cards: cardsToCounts(text.cardsToBroadcast) };
    if (text.type === 4 || text.type === 5) {
      const piece = PIECE_LABELS[text.pieceEnum] || `piece_${text.pieceEnum}`;
      return { ...base, type: piece === "road" ? "build_road" : piece === "settlement" ? "build_settlement" : piece === "city" ? "build_city" : "build_piece", player: playerName(context, text.playerColor), piece };
    }
    if (text.type === 14 || text.type === 15 || text.type === 55) return { ...base, type: text.type === 55 ? "discard" : "resource_loss", player: playerName(context, text.playerColor), cards: cardsToCounts(text.cardEnums) };
    if (text.type === 16) return { ...base, type: "steal", player: playerName(context, text.playerColorThief), victim: playerName(context, text.playerColorVictim), hiddenCount: text.cardBacks?.length || 1 };
    if (text.type === 20) return { ...base, type: "development_card_played", player: playerName(context, text.playerColor), developmentCard: cardLabel(text.cardEnum) };
    if (text.type === 21) return { ...base, type: "development_card_effect", player: playerName(context, text.playerColor), cards: cardsToCounts(text.cardEnums), effect: "resource selection" };
    if (text.type === 86) return { ...base, type: "monopoly_gain", player: playerName(context, text.playerColor), cards: { [cardLabel(text.cardEnum)]: Number(text.amountStolen || 0) }, amountStolen: Number(text.amountStolen || 0) };
    if (text.type === 45) return { ...base, type: "game_won", player: playerName(context, text.playerColor) };
    if (text.type === 58) return { ...base, type: "robber", player: playerName(context, text.playerColor) };
    if (text.type === 66) return { ...base, type: text.achievementEnum === 0 ? "longest_road" : text.achievementEnum === 1 ? "largest_army" : "achievement", player: playerName(context, text.playerColor), achievementEnum: text.achievementEnum };
    if (text.type === 68) return { ...base, type: text.achievementEnum === 0 ? "longest_road" : text.achievementEnum === 1 ? "largest_army" : "achievement", player: playerName(context, text.playerColorNew), previousPlayer: playerName(context, text.playerColorOld), achievementEnum: text.achievementEnum };
    if (text.type === 22) return { ...base, type: "player_status", player: playerName(context, text.playerColor) };
    if (text.type === 0 || text.type === 24 || text.type === 73 || text.type === 139) return { ...base, type: "system_event", player: text.playerColor === undefined ? undefined : playerName(context, text.playerColor) };
    if (text.type === 115 || text.type === 116) return { ...base, type: text.type === 116 ? "bank_trade" : "player_trade", player: playerName(context, text.playerColor), otherPlayer: text.acceptingPlayerColor === undefined ? undefined : playerName(context, text.acceptingPlayerColor), givenCards: cardsToCounts(text.givenCardEnums), receivedCards: cardsToCounts(text.receivedCardEnums) };
    if (text.type === 117 || text.type === 118) return { ...base, type: "trade_offer", player: playerName(context, text.playerColor ?? text.playerColorCreator), offeredCards: cardsToCounts(text.offeredCardEnums), wantedCards: cardsToCounts(text.wantedCardEnums) };
    if (text.type === 11 || text.type === 49) return { ...base, type: "robber", player: text.playerColor === undefined ? undefined : playerName(context, text.playerColor) };
    if (text.type === 44) return { ...base, type: "turn" };
    if (text.type === 2) return { ...base, type: "game_start" };
    if (text.type === 1) return { ...base, type: "player_status", player: playerName(context, text.playerColor) };
    return { ...base, type: "unknown_ws_log" };
  }

  function extractDistributionEvents(decodedFrames, context) {
    const grouped = new Map();
    for (const decoded of decodedFrames || []) {
      if (decoded.messageType !== 28 || !Array.isArray(decoded.payload)) continue;
      for (const item of decoded.payload) {
        if (!item || item.owner === undefined || item.card === undefined) continue;
        const key = [
          decoded.sequence ?? "",
          decoded.frame?.webSocketSequence ?? "",
          item.owner,
          item.distributionType ?? "",
        ].join("|");
        if (!grouped.has(key)) {
          grouped.set(key, {
            type: "resource_gain",
            source: "websocket-distribution",
            protocolType: 28,
            player: playerName(context, item.owner),
            cards: {},
            distributionType: item.distributionType,
            tileIndexes: [],
            capturedAt: decoded.frame?.capturedAt,
            frameSequence: decoded.frame?.webSocketSequence,
            messageSequence: decoded.sequence,
            raw: [],
          });
        }
        const event = grouped.get(key);
        const card = cardLabel(item.card);
        event.cards[card] = (event.cards[card] || 0) + 1;
        if (item.tileIndex !== undefined) event.tileIndexes.push(item.tileIndex);
        event.raw.push(item);
      }
    }
    return Array.from(grouped.values()).sort((a, b) =>
      (a.messageSequence || 0) - (b.messageSequence || 0) ||
      (a.frameSequence || 0) - (b.frameSequence || 0) ||
      String(a.player || "").localeCompare(String(b.player || ""))
    );
  }

  function extractDevelopmentCardPurchaseEvents(decodedFrames, context) {
    const events = [];
    let previousRemaining = 25;
    const ordered = (decodedFrames || []).slice().sort((a, b) =>
      Number(a.sequence ?? a.frame?.webSocketSequence ?? 0) - Number(b.sequence ?? b.frame?.webSocketSequence ?? 0)
    );
    for (const decoded of ordered) {
      const mechanic = decoded.payload?.gameState?.mechanicDevelopmentCardsState || decoded.payload?.diff?.mechanicDevelopmentCardsState;
      const bankCards = mechanic?.bankDevelopmentCards?.cards;
      if (!Array.isArray(bankCards)) continue;
      const remaining = bankCards.length;
      const purchaseCount = Math.max(0, previousRemaining - remaining);
      previousRemaining = Math.min(previousRemaining, remaining);
      if (!purchaseCount) continue;
      const playerColors = Object.keys(mechanic.players || {}).filter((color) =>
        Array.isArray(mechanic.players[color]?.developmentCards?.cards)
      );
      const color = playerColors.length === 1 ? playerColors[0] : undefined;
      for (let index = 0; index < purchaseCount; index += 1) {
        events.push({
          type: "development_card_bought",
          source: "websocket-development-state",
          protocolType: decoded.messageType,
          player: color === undefined ? undefined : playerName(context, color),
          playerColor: color === undefined ? undefined : Number(color),
          bankRemaining: remaining,
          capturedAt: decoded.frame?.capturedAt,
          frameSequence: decoded.frame?.webSocketSequence,
          messageSequence: decoded.sequence,
          raw: mechanic,
        });
      }
    }
    return events;
  }

  function sortProtocolEvents(events) {
  return (events || []).slice().sort((a, b) =>
    (a.messageSequence || 0) - (b.messageSequence || 0) ||
    (a.frameSequence || 0) - (b.frameSequence || 0) ||
    (a.logId || 0) - (b.logId || 0) ||
    String(a.player || "").localeCompare(String(b.player || ""))
  );
}

function addCounts(player, counts, multiplier) {
    for (const [card, amount] of Object.entries(counts || {})) {
      player.cards[card] = Math.max(0, (player.cards[card] || 0) + amount * multiplier);
    }
    player.knownCards = Object.values(player.cards).reduce((sum, amount) => sum + amount, 0);
  }

  function getPlayer(state, name) {
    if (!name) return null;
    if (!state.players[name]) state.players[name] = { name, cards: {}, knownCards: 0, uncertainty: 0, devCardsPlayed: 0 };
    return state.players[name];
  }

  function buildTracker(events) {
    const state = { players: {}, trackableEvents: 0, uncertainEvents: 0 };
    for (const event of events || []) {
      const player = getPlayer(state, event.player);
      if (event.type === "resource_gain" || event.type === "monopoly_gain") { state.trackableEvents += 1; addCounts(player, event.cards, 1); }
      else if (event.type === "resource_loss" || event.type === "discard") { state.trackableEvents += 1; addCounts(player, event.cards, -1); }
      else if (event.type === "bank_trade") { state.trackableEvents += 1; addCounts(player, event.givenCards, -1); addCounts(player, event.receivedCards, 1); }
      else if (event.type === "player_trade") { state.trackableEvents += 1; addCounts(player, event.givenCards, -1); addCounts(player, event.receivedCards, 1); const other = getPlayer(state, event.otherPlayer); addCounts(other, event.receivedCards, -1); addCounts(other, event.givenCards, 1); }
      else if (event.type === "steal") { state.trackableEvents += 1; state.uncertainEvents += 1; if (player) player.uncertainty += event.hiddenCount || 1; const victim = getPlayer(state, event.victim); if (victim) victim.uncertainty += event.hiddenCount || 1; }
      else if (event.type === "development_card_played") { state.trackableEvents += 1; if (player) player.devCardsPlayed += 1; }
    }
    return state;
  }

  function analyzeDecodedFrames(decoded, options = {}) {
    const context = buildContext(decoded, options);
    const logEvents = extractLogs(decoded).map((log) => translateLog(log, context));
    const distributionEvents = extractDistributionEvents(decoded, context);
    const developmentCardPurchaseEvents = extractDevelopmentCardPurchaseEvents(decoded, context);
    const events = sortProtocolEvents(
      logEvents
        .filter((event) => event.type !== "resource_gain")
        .concat(distributionEvents.length ? distributionEvents : logEvents.filter((event) => event.type === "resource_gain"))
        .concat(developmentCardPurchaseEvents)
    );
    const tracker = buildTracker(events);
    const hands = extractHands(decoded, context);
    const authoritative = extractAuthoritativePlayers(decoded, context, hands);
    return {
      decodedCount: decoded.length,
      context,
      events,
      logEvents,
      distributionEvents,
      developmentCardPurchaseEvents,
      tracker,
      hands,
      localHand: hands.localHand,
      localNonEmptyHand: hands.localNonEmptyHand,
      authoritative,
      playersByColor: authoritative.playersByColor,
    };
  }

  function analyzeFrames(frames, options = {}) {
    return analyzeDecodedFrames(decodeFrames(frames), options);
  }

  return { analyzeFrames, analyzeDecodedFrames, cardLabel, cardsToCounts, playerColorLabel: (color) => PLAYER_COLORS[color] || `Color ${color}` };
});
