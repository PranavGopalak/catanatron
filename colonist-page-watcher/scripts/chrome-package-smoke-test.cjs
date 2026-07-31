#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.chrome.json"), "utf8"));
const zipPath = path.join(root, "dist", `colonist-page-watcher-chrome-${manifest.version}.zip`);
assert(fs.existsSync(zipPath), "Chrome Web Store ZIP must exist");
const archive = fs.readFileSync(zipPath);
const bytes = archive.toString("latin1");
for (const expected of ["manifest.json", "src/background.js", "src/content.js", "src/page-websocket-hook.js", "src/popup.html", "dashboard/index.html", "dashboard/app.js", "assets/icon-128.png"]) {
  assert(bytes.includes(expected), `Chrome ZIP must contain ${expected}`);
}
assert(!bytes.includes("browser_specific_settings"), "Chrome ZIP manifest must not contain Firefox-only settings");
assert.strictEqual(archive.readUInt32LE(0), 0x04034b50, "Chrome ZIP must start with a local file header");
const method = archive.readUInt16LE(8);
const compressedSize = archive.readUInt32LE(18);
const fileNameLength = archive.readUInt16LE(26);
const extraLength = archive.readUInt16LE(28);
const fileName = archive.subarray(30, 30 + fileNameLength).toString("utf8");
assert.strictEqual(fileName, "manifest.json", "manifest.json must be the first root entry");
const dataStart = 30 + fileNameLength + extraLength;
const compressed = archive.subarray(dataStart, dataStart + compressedSize);
const manifestText = method === 8 ? zlib.inflateRawSync(compressed).toString("utf8") : compressed.toString("utf8");
const packagedManifest = JSON.parse(manifestText);
assert.deepStrictEqual(packagedManifest.background, { service_worker: "src/background.js" }, "Chrome ZIP must declare a service worker");
assert(!packagedManifest.browser_specific_settings, "Chrome ZIP manifest must omit Firefox-only settings");
console.log("chrome package smoke test ok");
