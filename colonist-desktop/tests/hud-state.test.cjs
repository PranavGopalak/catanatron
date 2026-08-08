"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_HUD_STATE,
  DICE_ODDS,
  MAX_NOTES_LENGTH,
  formatDuration,
  sanitizeHudState,
} = require("../src/hud-state");

test("sanitizes persisted HUD state", () => {
  const state = sanitizeHudState({
    activeTab: "notes",
    collapsed: true,
    hidden: true,
    notes: "hello",
    opacity: 0.72,
    position: { x: 123.5, y: 45 },
    untrusted: "discard me",
  });
  assert.deepEqual(state, {
    version: 1,
    activeTab: "notes",
    collapsed: true,
    hidden: true,
    notes: "hello",
    opacity: 0.72,
    position: { x: 123.5, y: 45 },
  });
});

test("bounds invalid and oversized state", () => {
  const state = sanitizeHudState({
    activeTab: "malicious",
    notes: "x".repeat(MAX_NOTES_LENGTH + 50),
    opacity: 20,
    position: { x: "10", y: Number.NaN },
  });
  assert.equal(state.activeTab, DEFAULT_HUD_STATE.activeTab);
  assert.equal(state.notes.length, MAX_NOTES_LENGTH);
  assert.equal(state.opacity, 1);
  assert.deepEqual(state.position, { x: null, y: 72 });
});

test("uses the complete two-dice probability distribution", () => {
  assert.equal(DICE_ODDS.length, 11);
  assert.equal(DICE_ODDS.reduce((sum, item) => sum + item.combinations, 0), 36);
  const seven = DICE_ODDS.find((item) => item.total === 7);
  assert.equal(seven.total, 7);
  assert.equal(seven.combinations, 6);
  assert(Math.abs(seven.probability - 100 / 6) < 1e-12);
});

test("formats elapsed time predictably", () => {
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(61_999), "01:01");
  assert.equal(formatDuration(-100), "00:00");
});
