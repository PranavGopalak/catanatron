#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const metadataPath = path.join(root, "dist", "release-metadata.json");
if (!fs.existsSync(metadataPath)) throw new Error("release-metadata.json is missing; run scripts/write-release-metadata.cjs after building artifacts");

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
if (metadata.version !== manifest.version) throw new Error(`metadata version ${metadata.version} does not match manifest ${manifest.version}`);
if (!Array.isArray(metadata.artifacts) || metadata.artifacts.length < 2) throw new Error("metadata must list XPI and source ZIP artifacts");

for (const artifact of metadata.artifacts) {
  const filePath = path.join(root, "dist", artifact.file || "");
  if (!fs.existsSync(filePath)) throw new Error(`metadata artifact missing on disk: ${artifact.file}`);
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (artifact.bytes !== bytes.length) throw new Error(`${artifact.file} byte count is stale`);
  if (artifact.sha256 !== sha256) throw new Error(`${artifact.file} sha256 is stale`);
}

const files = metadata.artifacts.map((artifact) => artifact.file).sort();
if (!files.includes(`colonist-page-watcher-${manifest.version}.xpi`)) throw new Error("metadata must include XPI");
if (!files.includes(`colonist-page-watcher-source-${manifest.version}.zip`)) throw new Error("metadata must include AMO source ZIP");

console.log("release metadata smoke test ok");