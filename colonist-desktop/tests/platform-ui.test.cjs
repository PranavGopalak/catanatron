"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { platformUi } = require("../src/platform-ui");

test("uses native shortcut labels and storage language on macOS", () => {
  assert.deepEqual(platformUi("darwin"), {
    deviceNoun: "Mac",
    shortcutLabel: "Command + Shift + H",
    shortcutGlyphs: "⌘ ⇧ H",
  });
});

test("uses native shortcut labels and storage language on Windows", () => {
  assert.deepEqual(platformUi("win32"), {
    deviceNoun: "PC",
    shortcutLabel: "Ctrl + Shift + H",
    shortcutGlyphs: "Ctrl ⇧ H",
  });
});

test("uses a safe generic fallback on other desktop platforms", () => {
  assert.deepEqual(platformUi("linux"), {
    deviceNoun: "computer",
    shortcutLabel: "Ctrl + Shift + H",
    shortcutGlyphs: "Ctrl ⇧ H",
  });
});
