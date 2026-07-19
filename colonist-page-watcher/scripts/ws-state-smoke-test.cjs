#!/usr/bin/env node
const assert = require("assert");
const path = require("path");
require(path.join(__dirname, "..", "src", "ws-core.js"));
const api = globalThis.ColonistWatcherWsCore;

const frame = (sequence, payload) => ({
  sequence,
  messageType: 91,
  payload,
  frame: { capturedAt: `2026-07-10T22:00:${String(sequence).padStart(2, "0")}.000Z`, webSocketSequence: sequence },
});

const decoded = [
  frame(1, {
    diff: {
      playerStates: {
        1: { resourceCards: { cards: [0, 0, 0] } },
        2: { resourceCards: { cards: [0, 0] } },
        5: { resourceCards: { cards: [1, 3] } },
      },
      mechanicDevelopmentCardsState: {
        bankDevelopmentCards: { cards: Array(24).fill(10) },
        players: { 2: { developmentCards: { cards: [10] } } },
      },
      gameLogState: {
        1: { text: { type: 20, playerColor: 2, cardEnum: 11 } },
      },
    },
  }),
];

const result = api.analyzeDecodedFrames(decoded, {
  localPlayerName: "KabaliKhan",
  playerNamesByColor: { 2: "ketstown" },
});
assert.strictEqual(result.context.localColor, 5);
assert.strictEqual(result.localNonEmptyHand.player, "KabaliKhan");
assert.strictEqual(result.localNonEmptyHand.total, 2);
assert.strictEqual(result.hands.handsByColor["1"].total, 3);
assert.strictEqual(result.hands.handsByColor["1"].compositionKnown, false);
assert.strictEqual(result.developmentCardPurchaseEvents.length, 1);
assert.strictEqual(result.developmentCardPurchaseEvents[0].player, "ketstown");
const knight = result.events.find((event) => event.type === "development_card_played");
assert(knight, "Knight play should be emitted");
assert.strictEqual(knight.developmentCard, "knight");
assert.strictEqual(knight.player, "ketstown");
console.log("ws state smoke test ok");

const emptyParticipantResult = api.analyzeDecodedFrames([
  {
    payload: { gameState: { playerStates: { 1: {}, 2: {}, 3: {}, 5: {} } } },
    frame: { webSocketSequence: 1, capturedAt: "2026-01-01T00:00:00.000Z" },
    sequence: 1,
  },
], { localPlayerName: "KabaliKhan" });
assert.deepStrictEqual(
  Object.keys(emptyParticipantResult.playersByColor).sort(),
  ["1", "2", "3", "5"],
  "all server-declared players must render before they have cards, points, or events"
);