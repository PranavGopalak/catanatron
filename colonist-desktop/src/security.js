"use strict";

const COLONIST_HOME = "https://colonist.io/";
const APPLE_AUTH_HOST = "appleid.apple.com";
const APPLE_AUTH_TIMEOUT_MS = 5 * 60 * 1000;

function parseUrl(value) {
  try {
    return new URL(String(value));
  } catch (_error) {
    return null;
  }
}

function isColonistHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized === "colonist.io" || normalized.endsWith(".colonist.io");
}

function isAllowedColonistUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "443") return false;
  return isColonistHostname(parsed.hostname);
}

function isAppleAuthStartUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed || !isAllowedColonistUrl(value)) return false;
  return parsed.pathname === "/auth/apple" || parsed.pathname === "/auth-link/apple";
}

function isAllowedAppleAuthUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "443") return false;
  return parsed.hostname.toLowerCase() === APPLE_AUTH_HOST;
}

function createNavigationPolicy({ now = () => Date.now() } = {}) {
  let appleAuthExpiresAt = 0;

  function noteNavigationStarted(url) {
    if (isAppleAuthStartUrl(url)) appleAuthExpiresAt = now() + APPLE_AUTH_TIMEOUT_MS;
  }

  function noteNavigationFinished(url) {
    if (isAllowedColonistUrl(url) && !isAppleAuthStartUrl(url)) appleAuthExpiresAt = 0;
  }

  function isAllowed(url) {
    if (isAllowedColonistUrl(url)) return true;
    return appleAuthExpiresAt > 0 && now() <= appleAuthExpiresAt && isAllowedAppleAuthUrl(url);
  }

  return {
    isAllowed,
    noteNavigationFinished,
    noteNavigationStarted,
  };
}

function displayHost(value) {
  const parsed = parseUrl(value);
  return parsed?.hostname || "an external site";
}

module.exports = {
  APPLE_AUTH_HOST,
  APPLE_AUTH_TIMEOUT_MS,
  COLONIST_HOME,
  createNavigationPolicy,
  displayHost,
  isAllowedAppleAuthUrl,
  isAllowedColonistUrl,
  isAppleAuthStartUrl,
  isColonistHostname,
  parseUrl,
};
