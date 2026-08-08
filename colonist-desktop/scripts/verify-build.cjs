"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outputPath = path.join(root, "dist", "preload.cjs");
const mainOutputPath = path.join(root, "dist", "main.cjs");
const output = fs.readFileSync(outputPath, "utf8");
const mainOutput = fs.readFileSync(mainOutputPath, "utf8");

assert(output.length > 15000, "bundled preload should contain the complete HUD");
assert(output.includes("Catanatron HUD"), "bundled preload should contain the HUD markup");
assert(output.includes("catanatron-intelligence-rail"), "bundled preload should contain the immersive intelligence rail");
assert(output.includes("catanatron-hand-strip"), "bundled preload should contain inline hand annotations");
assert(output.includes("Cannot have:"), "bundled preload should expose impossible resource deductions");
assert(output.includes("Authorized experiment"), "bundled preload should disclose the experimental counting boundary");
assert(!output.includes("page-websocket-hook"), "desktop MVP must not bundle the WebSocket hook");
assert(!output.includes("MutationObserver visible page text"), "desktop MVP must not bundle page capture code");
assert(mainOutput.includes("Network.webSocketFrameReceived"), "main bundle should include browser-process WebSocket capture");
assert(mainOutput.includes("buildCounterState"), "main bundle should include normalized card counting");
assert(mainOutput.includes("buildDevDeckWatch"), "main bundle should include development deck inference");
assert(mainOutput.includes("buildWinWatch"), "main bundle should include point build risk inference");

console.log(`Verified ${path.relative(root, outputPath)} (${output.length} bytes)`);
console.log(`Verified ${path.relative(root, mainOutputPath)} (${mainOutput.length} bytes)`);
