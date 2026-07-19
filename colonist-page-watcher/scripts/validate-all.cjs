#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const latestExport = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads", "colonist-watcher", "latest.json");

const commands = [
  ["node", ["--check", "src/core.js"]],
  ["node", ["--check", "src/ws-core.js"]],
  ["node", ["--check", "src/content.js"]],
  ["node", ["--check", "src/background.js"]],
  ["node", ["--check", "src/page-websocket-hook.js"]],
  ["node", ["--check", "src/popup.js"]],
  ["node", ["--check", "scripts/analyze-logs.cjs"]],
  ["node", ["--check", "scripts/core-smoke-test.cjs"]],
  ["node", ["--check", "scripts/manifest-smoke-test.cjs"]],
  ["node", ["--check", "scripts/background-smoke-test.cjs"]],
  ["node", ["--check", "scripts/dashboard-smoke-test.cjs"]],
  ["node", ["--check", "scripts/dashboard-render-smoke-test.cjs"]],
  ["node", ["--check", "scripts/popup-smoke-test.cjs"]],
  ["node", ["--check", "scripts/protocol-smoke-test.cjs"]],
  ["node", ["--check", "scripts/ws-state-smoke-test.cjs"]],
  ["node", ["--check", "scripts/hidden-inference-smoke-test.cjs"]],
  ["node", ["--check", "scripts/release-audit.cjs"]],
  ["node", ["--check", "scripts/amo-source-smoke-test.cjs"]],
  ["node", ["--check", "scripts/release-metadata-smoke-test.cjs"]],
  ["node", ["--check", "dashboard/app.js"]],
  ["node", ["scripts/core-smoke-test.cjs"]],
  ["node", ["scripts/manifest-smoke-test.cjs"]],
  ["node", ["scripts/background-smoke-test.cjs"]],
  ["node", ["scripts/dashboard-smoke-test.cjs"]],
  ["node", ["scripts/dashboard-render-smoke-test.cjs"]],
  ["node", ["scripts/ws-state-smoke-test.cjs"]],
  ["node", ["scripts/hidden-inference-smoke-test.cjs"]],
  ["node", ["scripts/release-audit.cjs"]],
  ["node", ["scripts/amo-source-smoke-test.cjs"]],
  ["node", ["scripts/release-metadata-smoke-test.cjs"]],
  ["node", ["scripts/analyze-logs.cjs", "scripts/sample-export.json"]],
];

if (fs.existsSync(latestExport)) {
  commands.push(["node", ["scripts/dashboard-render-smoke-test.cjs", latestExport]]);
  commands.push(["node", ["scripts/popup-smoke-test.cjs", latestExport]]);
  commands.push(["node", ["scripts/protocol-smoke-test.cjs", latestExport]]);
  commands.push(["node", ["scripts/analyze-logs.cjs", latestExport, "--player", "KabaliKhan", "--suggest-resource-maps"]]);
} else {
  console.log("Skipping latest export checks; not found: " + latestExport);
}

for (const [command, args] of commands) {
  const printable = [command, ...args].join(" ");
  console.log("\n> " + printable);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error("\nValidation failed: " + printable);
    process.exit(result.status || 1);
  }
}

console.log("\nall validation checks passed");

