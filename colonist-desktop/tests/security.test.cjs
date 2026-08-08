"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  APPLE_AUTH_TIMEOUT_MS,
  createNavigationPolicy,
  displayHost,
  isAllowedAppleAuthUrl,
  isAllowedColonistUrl,
  isAppleAuthStartUrl,
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

test("recognizes only the Colonist Apple authentication entry points", () => {
  assert.equal(isAppleAuthStartUrl("https://colonist.io/auth/apple"), true);
  assert.equal(isAppleAuthStartUrl("https://colonist.io/auth/apple?callbackHash=lobby"), true);
  assert.equal(isAppleAuthStartUrl("https://colonist.io/auth-link/apple"), true);
  assert.equal(isAppleAuthStartUrl("https://colonist.io/auth/google"), false);
  assert.equal(isAppleAuthStartUrl("https://example.com/auth/apple"), false);
});

test("allows only the secure Apple ID authentication host", () => {
  assert.equal(isAllowedAppleAuthUrl("https://appleid.apple.com/auth/authorize"), true);
  assert.equal(isAllowedAppleAuthUrl("http://appleid.apple.com/auth/authorize"), false);
  assert.equal(isAllowedAppleAuthUrl("https://appleid.apple.com.evil.test/auth/authorize"), false);
  assert.equal(isAllowedAppleAuthUrl("https://user:password@appleid.apple.com/auth/authorize"), false);
});

test("opens Apple ID only during a short Colonist initiated authentication flow", () => {
  let currentTime = 1000;
  const policy = createNavigationPolicy({ now: () => currentTime });
  const appleUrl = "https://appleid.apple.com/auth/authorize";

  assert.equal(policy.isAllowed(appleUrl), false);
  policy.noteNavigationStarted("https://colonist.io/auth/apple");
  assert.equal(policy.isAllowed(appleUrl), true);

  currentTime += APPLE_AUTH_TIMEOUT_MS + 1;
  assert.equal(policy.isAllowed(appleUrl), false);

  policy.noteNavigationStarted("https://colonist.io/auth/apple");
  policy.noteNavigationFinished("https://colonist.io/");
  assert.equal(policy.isAllowed(appleUrl), false);
});
