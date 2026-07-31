#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
function jpegDimensions(...parts) {
  const bytes = fs.readFileSync(path.join(root, ...parts));
  assert.strictEqual(bytes.readUInt16BE(0), 0xffd8, `${parts.join("/")} must be a JPEG`);
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  throw new Error(`No JPEG dimensions found for ${parts.join("/")}`);
}

const icon = fs.readFileSync(path.join(root, "assets", "icon-128.png"));
assert.strictEqual(icon.subarray(1, 4).toString("ascii"), "PNG", "store icon must be a PNG");
assert.deepStrictEqual({ width: icon.readUInt32BE(16), height: icon.readUInt32BE(20) }, { width: 128, height: 128 });
assert.deepStrictEqual(jpegDimensions("store-assets", "chrome", "dashboard-1280x800.jpg"), { width: 1280, height: 800 });
assert.deepStrictEqual(jpegDimensions("store-assets", "chrome", "promo-440x280.jpg"), { width: 440, height: 280 });
console.log("chrome store assets smoke test ok");
