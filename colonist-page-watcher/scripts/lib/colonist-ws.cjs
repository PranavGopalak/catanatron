"use strict";

const wsCore = require("../../src/ws-core.js");

function decodeColonistFrames(frames) {
  const decoded = [];
  const failures = [];

  for (const frame of frames || []) {
    try {
      const item = wsCore.decodeFrame(frame);
      if (item) decoded.push(item);
    } catch (error) {
      failures.push({
        frame,
        error: String(error?.message || error),
      });
    }
  }

  return { decoded, failures };
}

function summarizeDecodedFrames(decodedFrames) {
  const counts = new Map();
  const examples = new Map();

  for (const decoded of decodedFrames || []) {
    const direction = decoded.frame?.direction || "unknown";
    const messageType = decoded.messageType ?? "unknown";
    const key = `${direction}:${messageType}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!examples.has(key)) examples.set(key, decoded);
  }

  return {
    byDirectionType: Array.from(counts.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    ),
    examples,
  };
}

module.exports = { decodeColonistFrames, summarizeDecodedFrames };
