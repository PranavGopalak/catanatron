"use strict";

const SHELL_EXPANDED_WIDTH = 372;
const SHELL_COLLAPSED_WIDTH = 58;
const SHELL_AUTO_COLLAPSE_WIDTH = 1080;

function shellWidthFor(windowWidth, collapsed) {
  const width = Number(windowWidth);
  if (!Number.isFinite(width) || width <= 0) return SHELL_COLLAPSED_WIDTH;
  return collapsed === true || width < SHELL_AUTO_COLLAPSE_WIDTH
    ? SHELL_COLLAPSED_WIDTH
    : SHELL_EXPANDED_WIDTH;
}

function sanitizeGameSurface(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const identities = Array.isArray(source.identities) ? source.identities.slice(0, 8) : [];
  return {
    active: source.active === true,
    identities: identities.map((identity) => ({
      color: String(identity?.color || "").slice(0, 8),
      name: String(identity?.name || "").trim().slice(0, 64),
    })),
  };
}

module.exports = {
  SHELL_AUTO_COLLAPSE_WIDTH,
  SHELL_COLLAPSED_WIDTH,
  SHELL_EXPANDED_WIDTH,
  sanitizeGameSurface,
  shellWidthFor,
};
