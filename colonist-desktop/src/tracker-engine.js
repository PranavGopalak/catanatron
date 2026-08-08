"use strict";

const wsCore = require("../../colonist-page-watcher/src/ws-core.js");
const { buildCounterState, emptyCounterState } = require("./tracker-state");

const MAX_FRAMES = 20000;
const ANALYSIS_DELAY_MS = 450;
const GAME_START_DEBOUNCE_MS = 10000;

function decodedContainsGameStart(decoded) {
  const logState = decoded?.payload?.gameState?.gameLogState || decoded?.payload?.diff?.gameLogState;
  return Object.values(logState || {}).some((entry) => Number(entry?.text?.type) === 2);
}

class TrackerEngine {
  constructor({ onUpdate = () => {}, now = () => Date.now(), analysisDelayMs = ANALYSIS_DELAY_MS } = {}) {
    this.onUpdate = onUpdate;
    this.now = now;
    this.analysisDelayMs = analysisDelayMs;
    this.frames = [];
    this.sequence = 0;
    this.localPlayerName = "";
    this.analysisTimer = null;
    this.lastGameStartAt = 0;
    this.snapshot = emptyCounterState();
  }

  setLocalPlayerName(value) {
    this.localPlayerName = String(value || "").trim().slice(0, 32);
    if (this.frames.length) this.scheduleAnalysis();
  }

  addFrame(candidate) {
    const frame = { ...candidate, webSocketSequence: ++this.sequence };
    try {
      const decoded = wsCore.decodeFrame(frame);
      if (decodedContainsGameStart(decoded) && this.now() - this.lastGameStartAt > GAME_START_DEBOUNCE_MS) {
        this.reset("game-start");
        this.lastGameStartAt = this.now();
        frame.webSocketSequence = ++this.sequence;
      }
    } catch (_error) {}
    this.frames.push(frame);
    if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
    this.scheduleAnalysis();
  }

  scheduleAnalysis() {
    if (this.analysisTimer) return;
    this.analysisTimer = setTimeout(() => this.analyzeNow(), this.analysisDelayMs);
  }

  analyzeNow() {
    clearTimeout(this.analysisTimer);
    this.analysisTimer = null;
    const analysis = wsCore.analyzeFrames(this.frames, { localPlayerName: this.localPlayerName });
    this.snapshot = buildCounterState(analysis, {
      frames: this.frames.length,
      updatedAt: new Date(this.now()).toISOString(),
      resetAt: this.snapshot.resetAt,
      resetReason: this.snapshot.resetReason,
    });
    this.onUpdate(this.snapshot);
    return this.snapshot;
  }

  reset(reason = "manual") {
    clearTimeout(this.analysisTimer);
    this.analysisTimer = null;
    this.frames = [];
    this.sequence = 0;
    this.snapshot = {
      ...emptyCounterState(),
      resetAt: new Date(this.now()).toISOString(),
      resetReason: reason,
    };
    this.onUpdate(this.snapshot);
    return this.snapshot;
  }

  dispose() {
    clearTimeout(this.analysisTimer);
    this.analysisTimer = null;
    this.frames = [];
  }
}

module.exports = {
  ANALYSIS_DELAY_MS,
  GAME_START_DEBOUNCE_MS,
  MAX_FRAMES,
  TrackerEngine,
  decodedContainsGameStart,
};
