#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const dist = path.join(root, "dist");
const artifacts = [
  `colonist-page-watcher-${manifest.version}.xpi`,
  `colonist-page-watcher-source-${manifest.version}.zip`,
];

function fileRecord(fileName) {
  const filePath = path.join(dist, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Missing release artifact: ${fileName}`);
  const bytes = fs.readFileSync(filePath);
  return {
    file: fileName,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

const metadata = {
  name: manifest.name,
  version: manifest.version,
  generatedAt: new Date().toISOString(),
  artifacts: artifacts.map(fileRecord),
  notes: "Install the Mozilla-signed XPI in Firefox Release for persistent add-on use.",
};

fs.writeFileSync(path.join(dist, "release-metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
console.log(JSON.stringify(metadata, null, 2));