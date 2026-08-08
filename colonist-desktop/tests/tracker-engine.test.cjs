"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { encode } = require("@msgpack/msgpack");
const { TrackerEngine } = require("../src/tracker-engine");

function encodedFrame(sequence, payload) {
  const bytes = encode({ data: { type: 91, payload, sequence } });
  return {
    capturedAt: `2026-08-08T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    direction: "in",
    url: "wss://colonist.io/game",
    kind: "arraybuffer",
    base64: Buffer.from(bytes).toString("base64"),
    size: bytes.length,
  };
}

test("decodes captured frames into a normalized counter snapshot", () => {
  const currentTime = Date.parse("2026-08-08T00:01:00.000Z");
  const engine = new TrackerEngine({ now: () => currentTime, analysisDelayMs: 60000 });
  engine.setLocalPlayerName("You");
  engine.addFrame(encodedFrame(1, {
    playerUserStates: [
      { selectedColor: 1, username: "Avery" },
      { selectedColor: 5, username: "You" },
    ],
    playerColor: 5,
    gameState: {
      playerStates: {
        1: { resourceCards: { cards: [0, 0, 0] }, victoryPointsState: { 0: 3 } },
        5: { resourceCards: { cards: [1, 3] }, victoryPointsState: { 0: 4 } },
      },
      gameLogState: {
        1: { text: { type: 10, playerColor: 5, firstDice: 3, secondDice: 5 } },
      },
    },
  }));

  const snapshot = engine.analyzeNow();
  assert.equal(snapshot.counts.frames, 1);
  assert.equal(snapshot.counts.decoded, 1);
  assert.equal(snapshot.players.length, 2);
  assert.equal(snapshot.hand.player, "You");
  assert.deepEqual(snapshot.hand.cards, { brick: 0, lumber: 1, ore: 0, grain: 0, wool: 1 });
  engine.dispose();
});

test("resets prior frames when a new game start appears", () => {
  let currentTime = Date.parse("2026-08-08T00:02:00.000Z");
  const engine = new TrackerEngine({ now: () => currentTime, analysisDelayMs: 60000 });
  engine.addFrame(encodedFrame(1, { gameState: { playerStates: { 1: { resourceCards: { cards: [0] } } } } }));
  currentTime += 11000;
  engine.addFrame(encodedFrame(2, { diff: { gameLogState: { 2: { text: { type: 2 } } } } }));
  assert.equal(engine.frames.length, 1);
  assert.equal(engine.snapshot.resetReason, "game-start");
  engine.dispose();
});

test("throttles analysis without postponing an already scheduled update", () => {
  const engine = new TrackerEngine({ analysisDelayMs: 60000 });
  engine.scheduleAnalysis();
  const scheduledTimer = engine.analysisTimer;

  engine.scheduleAnalysis();

  assert.equal(engine.analysisTimer, scheduledTimer);
  engine.dispose();
});
