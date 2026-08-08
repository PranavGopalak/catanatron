"use strict";

const COLONIST_HOME = "https://colonist.io/";

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

function displayHost(value) {
  const parsed = parseUrl(value);
  return parsed?.hostname || "an external site";
}

module.exports = {
  COLONIST_HOME,
  displayHost,
  isAllowedColonistUrl,
  isColonistHostname,
  parseUrl,
};
