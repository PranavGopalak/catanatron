"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { HudStateStore } = require("../src/state-store");

test("writes, reads, and resets state atomically", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catanatron-hud-test-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new HudStateStore(directory);

  assert.equal(store.read().notes, "");
  const written = await store.write({ notes: "private note", opacity: 0.8 });
  assert.equal(written.notes, "private note");
  assert.equal(store.read().opacity, 0.8);
  assert.equal(fs.existsSync(path.join(directory, "hud-state.json.tmp")), false);

  const reset = await store.reset();
  assert.equal(reset.notes, "");
  assert.equal(store.read().opacity, 0.96);
});

test("serializes overlapping writes in call order", async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catanatron-hud-queue-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new HudStateStore(directory);

  await Promise.all([
    store.write({ notes: "first" }),
    store.write({ notes: "second" }),
    store.write({ notes: "last" }),
  ]);
  assert.equal(store.read().notes, "last");
});
