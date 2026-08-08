"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  displayHost,
  isAllowedColonistUrl,
  isColonistHostname,
} = require("../src/security");

test("allows only secure Colonist hosts", () => {
  assert.equal(isAllowedColonistUrl("https://colonist.io/"), true);
  assert.equal(isAllowedColonistUrl("https://colonist.io/game/abc"), true);
  assert.equal(isAllowedColonistUrl("https://play.colonist.io/room"), true);
  assert.equal(isAllowedColonistUrl("https://COLONIST.IO/"), true);
});

test("rejects deceptive, insecure, credentialed, and unrelated URLs", () => {
  const rejected = [
    "http://colonist.io/",
    "https://colonist.io.evil.example/",
    "https://evilcolonist.io/",
    "https://user:password@colonist.io/",
    "https://colonist.io:444/",
    "javascript:alert(1)",
    "about:blank",
    "file:///tmp/example",
    "not a url",
  ];
  for (const url of rejected) assert.equal(isAllowedColonistUrl(url), false, url);
});

test("normalizes host checks and produces safe display names", () => {
  assert.equal(isColonistHostname("GAME.COLONIST.IO"), true);
  assert.equal(isColonistHostname("colonist.io.attacker.test"), false);
  assert.equal(displayHost("https://example.com/path?q=secret"), "example.com");
  assert.equal(displayHost("bad url"), "an external site");
});
