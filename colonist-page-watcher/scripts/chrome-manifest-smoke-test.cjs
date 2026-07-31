#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const firefox = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const chrome = JSON.parse(fs.readFileSync(path.join(root, "manifest.chrome.json"), "utf8"));

for (const field of ["manifest_version", "name", "version", "description", "host_permissions", "content_scripts", "action", "web_accessible_resources", "icons"]) {
  assert.deepStrictEqual(chrome[field], firefox[field], `Chrome and Firefox ${field} must stay aligned`);
}
assert.deepStrictEqual(chrome.background, { service_worker: "src/background.js" });
assert(!chrome.browser_specific_settings, "Chrome package must not include Firefox-only settings");
assert(!chrome.permissions.includes("activeTab"), "Chrome should not request redundant activeTab access");
assert(chrome.permissions.includes("storage") && chrome.permissions.includes("unlimitedStorage"), "Chrome needs durable local tracker storage");
assert(!chrome.permissions.includes("tabs"), "Colonist host access is sufficient; Chrome should not request broad tabs metadata");
assert.strictEqual(chrome.icons["128"], "assets/icon-128.png");
assert(fs.existsSync(path.join(root, "assets", "icon-128.png")), "Chrome 128px icon is required");

console.log("chrome manifest smoke test ok");
