"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outputPath = path.join(root, "dist", "preload.cjs");
const output = fs.readFileSync(outputPath, "utf8");

assert(output.length > 15000, "bundled preload should contain the complete HUD");
assert(output.includes("Catanatron HUD"), "bundled preload should contain the HUD markup");
assert(output.includes("Manual tools only"), "bundled preload should disclose the manual-only boundary");
assert(!output.includes("page-websocket-hook"), "desktop MVP must not bundle the WebSocket hook");
assert(!output.includes("MutationObserver visible page text"), "desktop MVP must not bundle page capture code");

console.log(`Verified ${path.relative(root, outputPath)} (${output.length} bytes)`);
