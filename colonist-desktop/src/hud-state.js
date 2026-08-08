"use strict";

const MAX_NOTES_LENGTH = 12000;
const MAX_PLAYER_NAME_LENGTH = 32;
const HUD_TABS = new Set(["cards", "timer", "odds", "notes", "settings"]);

const DEFAULT_HUD_STATE = Object.freeze({
  version: 1,
  activeTab: "cards",
  collapsed: false,
  hidden: false,
  localPlayerName: "",
  notes: "",
  opacity: 0.96,
  position: Object.freeze({ x: null, y: 72 }),
  trackingEnabled: false,
});

const DICE_ODDS = Object.freeze(
  [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((combinations, index) => ({
    total: index + 2,
    combinations,
    probability: (combinations / 36) * 100,
  }))
);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeHudState(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const position = source.position && typeof source.position === "object" ? source.position : {};
  const opacity = typeof source.opacity === "number" && Number.isFinite(source.opacity)
    ? clamp(source.opacity, 0.55, 1)
    : DEFAULT_HUD_STATE.opacity;

  return {
    version: 1,
    activeTab: HUD_TABS.has(source.activeTab) ? source.activeTab : DEFAULT_HUD_STATE.activeTab,
    collapsed: source.collapsed === true,
    hidden: source.hidden === true,
    localPlayerName: typeof source.localPlayerName === "string" ? source.localPlayerName.trim().slice(0, MAX_PLAYER_NAME_LENGTH) : "",
    notes: typeof source.notes === "string" ? source.notes.slice(0, MAX_NOTES_LENGTH) : "",
    opacity,
    position: {
      x: finiteOrNull(position.x),
      y: finiteOrNull(position.y) ?? DEFAULT_HUD_STATE.position.y,
    },
    trackingEnabled: source.trackingEnabled === true,
  };
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

module.exports = {
  DEFAULT_HUD_STATE,
  DICE_ODDS,
  MAX_NOTES_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  clamp,
  formatDuration,
  sanitizeHudState,
};
