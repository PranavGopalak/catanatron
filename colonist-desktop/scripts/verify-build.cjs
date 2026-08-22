"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const outputPath = path.join(root, "dist", "preload.cjs");
const mainOutputPath = path.join(root, "dist", "main.cjs");
const shellOutputPath = path.join(root, "dist", "shell.html");
const output = fs.readFileSync(outputPath, "utf8");
const mainOutput = fs.readFileSync(mainOutputPath, "utf8");
const shellOutput = fs.readFileSync(shellOutputPath, "utf8");
const pngIconPath = path.join(root, "assets", "icon.png");
const windowsIconPath = path.join(root, "assets", "icon.ico");

assert.equal(fs.readFileSync(pngIconPath).subarray(1, 4).toString("ascii"), "PNG", "runtime icon should be a PNG");
assert.equal(fs.readFileSync(windowsIconPath).readUInt16LE(2), 1, "Windows icon should be an ICO resource");

assert(output.length > 15000, "bundled preload should contain the complete browser sidebar");
assert(output.includes("Collapse Catanatron sidebar"), "bundled preload should contain the app-owned sidebar markup");
assert(output.includes("tracker-player-list"), "bundled preload should contain the left resource knowledge list");
assert(output.includes("bindPlayersToNativeIdentities"), "bundled preload should bind tracker data to native Colonist identities");
assert(output.includes("probability is not yet defensible"), "bundled preload should explain when percentages are unavailable");
assert(output.includes('ipcRenderer.send("game:surface-state"'), "bundled preload should forward bounded native identity state");
assert(output.includes('ipcRenderer.send("browser-shell:set-collapsed"'), "bundled preload should resize the app-owned browser surface");
assert(output.includes("gameSurfaceSnapshot"), "bundled preload should observe game identity without rewriting native player rows");
assert(!output.includes("catanatron-native-intelligence"), "bundled preload must not inject a second intelligence panel into Colonist");
assert(!output.includes("hud-launcher"), "bundled preload must not include a floating HUD launcher");
assert(!output.includes("data-drag-handle"), "bundled preload must not include a draggable overlay handle");
assert(!output.includes("catanatron-hand-strip"), "bundled preload must leave native player hands unchanged");
assert(!output.includes("original.appendChild(strip)"), "bundled preload must not inject into native player rows");
assert(output.includes("Authorized experiment"), "bundled preload should disclose the experimental counting boundary");
assert(output.includes("Ctrl + Shift + H"), "bundled preload should contain the Windows shortcut label");
assert(!output.includes("page-websocket-hook"), "desktop MVP must not bundle the WebSocket hook");
assert(!output.includes("MutationObserver visible page text"), "desktop MVP must not bundle page capture code");
assert(mainOutput.includes("Network.webSocketFrameReceived"), "main bundle should include browser-process WebSocket capture");
assert(mainOutput.includes("new WebContentsView"), "main bundle should isolate Colonist in its own secured page surface");
assert(mainOutput.includes("addChildView"), "main bundle should compose the game beside app-owned browser chrome");
assert(mainOutput.includes("shellWidthFor"), "main bundle should reserve responsive space for the app-owned sidebar");
assert(mainOutput.includes("gameView.setBounds"), "main bundle should resize the Colonist surface without page overlays");
assert(mainOutput.includes("buildCounterState"), "main bundle should include normalized card counting");
assert(mainOutput.includes("buildDevDeckWatch"), "main bundle should include development deck inference");
assert(mainOutput.includes("buildWinWatch"), "main bundle should include point build risk inference");
assert(mainOutput.includes("setAppUserModelId"), "main bundle should set a stable Windows application identity");
assert(mainOutput.includes('"assets", "icon.png"'), "main bundle should use the Windows runtime icon");
assert(shellOutput.includes("Content-Security-Policy"), "browser shell should define a restrictive CSP");
assert(shellOutput.includes("default-src 'none'"), "browser shell should deny network content by default");

console.log(`Verified ${path.relative(root, outputPath)} (${output.length} bytes)`);
console.log(`Verified ${path.relative(root, mainOutputPath)} (${mainOutput.length} bytes)`);
console.log(`Verified ${path.relative(root, shellOutputPath)} (${shellOutput.length} bytes)`);
