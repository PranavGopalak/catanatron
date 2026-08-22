"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SHELL_COLLAPSED_WIDTH,
  SHELL_EXPANDED_WIDTH,
  sanitizeGameSurface,
  shellWidthFor,
} = require("../src/browser-shell-layout");

test("reserves a first-party browser rail without crushing narrow windows", () => {
  assert.equal(shellWidthFor(1480, false), SHELL_EXPANDED_WIDTH);
  assert.equal(shellWidthFor(1080, false), SHELL_EXPANDED_WIDTH);
  assert.equal(shellWidthFor(1079, false), SHELL_COLLAPSED_WIDTH);
  assert.equal(shellWidthFor(1480, true), SHELL_COLLAPSED_WIDTH);
  assert.equal(shellWidthFor(Number.NaN, false), SHELL_COLLAPSED_WIDTH);
});

test("bounds native player identity messages from the remote game page", () => {
  const surface = sanitizeGameSurface({
    active: true,
    identities: Array.from({ length: 10 }, (_, index) => ({
      color: `color-${index}-too-long`,
      name: `  Player ${index} ${"x".repeat(80)}  `,
      ignored: "not forwarded",
    })),
  });
  assert.equal(surface.active, true);
  assert.equal(surface.identities.length, 8);
  assert.equal(surface.identities[0].color.length, 8);
  assert.equal(surface.identities[0].name.length, 64);
  assert.deepEqual(Object.keys(surface.identities[0]), ["color", "name"]);
});
