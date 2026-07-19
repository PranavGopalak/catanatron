#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

assert.strictEqual(manifest.manifest_version, 3);
assert.strictEqual(manifest.name, "Colonist Page Watcher");
assert(manifest.permissions.includes("storage"), "storage permission is required" );
assert(manifest.permissions.includes("unlimitedStorage"), "long games require durable local frame storage" );
assert(manifest.permissions.includes("unlimitedStorage"), "long games require durable local frame storage");
assert(manifest.permissions.includes("tabs"), "tabs permission is required to auto-open the extension dashboard");
assert(!manifest.permissions.includes("nativeMessaging"), "nativeMessaging should not be required for extension-only runtime");
assert(manifest.host_permissions.includes("https://colonist.io/*"), "colonist.io host permission is required");
assert(manifest.host_permissions.includes("https://*.colonist.io/*"), "colonist subdomain host permission is required");
assert(!manifest.host_permissions.some((permission) => permission.startsWith("http://localhost") || permission.startsWith("http://127.0.0.1")), "localhost permissions should not be required for extension dashboard");
assert(manifest.background?.scripts?.includes("src/background.js"), "Firefox background script is required for auto-open dashboard");
assert.strictEqual(manifest.action.default_popup, "src/popup.html");
assert.strictEqual(manifest.icons?.["48"], "assets/icon-48.png", "extension should define branded icons");
assert.strictEqual(manifest.action.default_icon?.["32"], "assets/icon-32.png", "browser action should define an icon");
assert(manifest.browser_specific_settings?.gecko?.id, "Firefox gecko id is required for local storage continuity");
assert(manifest.browser_specific_settings?.gecko?.strict_min_version, "Firefox strict_min_version should be explicit");
assert.deepStrictEqual(
  manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
  ["none"],
  "Firefox AMO requires an explicit no-data-collection declaration"
);

const contentScript = manifest.content_scripts?.[0];
assert(contentScript, "content script is required");
assert(contentScript.matches.includes("https://colonist.io/*"), "content script must match colonist.io");
assert(contentScript.matches.includes("https://*.colonist.io/*"), "content script must match colonist subdomains");
assert(contentScript.js.includes("src/core.js"), "content script should load core.js first");
assert(contentScript.js.includes("src/ws-core.js"), "content script should load ws-core.js for auto new-game detection");
assert(contentScript.js.includes("src/content.js"), "content script should load content.js");
assert(contentScript.js.indexOf("src/ws-core.js") < contentScript.js.indexOf("src/content.js"), "ws-core.js must load before content.js");
assert.strictEqual(contentScript.run_at, "document_start", "WebSocket hook needs document_start");

const resources = manifest.web_accessible_resources?.[0];
assert(resources?.resources?.includes("src/page-websocket-hook.js"), "page WebSocket hook must be web-accessible");
assert(resources?.matches?.includes("https://colonist.io/*"), "hook resource must match colonist.io");
assert(resources?.matches?.includes("https://*.colonist.io/*"), "hook resource must match colonist subdomains");

console.log("manifest smoke test ok");

