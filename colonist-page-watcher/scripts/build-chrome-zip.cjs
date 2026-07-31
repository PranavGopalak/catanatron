#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const chromeManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.chrome.json"), "utf8"));
const version = process.argv[2] || chromeManifest.version;
if (version !== chromeManifest.version) throw new Error(`Requested version ${version} does not match Chrome manifest ${chromeManifest.version}`);

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function collectFiles(directory, prefix) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .flatMap((entry) => {
      const filePath = path.join(directory, entry.name);
      const archivePath = `${prefix}/${entry.name}`;
      return entry.isDirectory() ? collectFiles(filePath, archivePath) : [{ filePath, archivePath }];
    });
}

const entries = [
  { archivePath: "manifest.json", data: Buffer.from(JSON.stringify(chromeManifest, null, 2) + "\n") },
  ...["src", "dashboard", "assets"].flatMap((directory) => collectFiles(path.join(root, directory), directory)),
].map((entry) => ({ ...entry, data: entry.data || fs.readFileSync(entry.filePath) }));

const localParts = [];
const centralParts = [];
let offset = 0;
// A fixed archive timestamp keeps release hashes reproducible across validation runs.
const stamp = dosDateTime(new Date(2026, 0, 1, 0, 0, 0));

for (const entry of entries) {
  const name = Buffer.from(entry.archivePath.replaceAll(path.sep, "/"));
  const compressed = zlib.deflateRawSync(entry.data, { level: 9 });
  const checksum = crc32(entry.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(stamp.time, 10);
  local.writeUInt16LE(stamp.date, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(entry.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  localParts.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(stamp.time, 12);
  central.writeUInt16LE(stamp.date, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(entry.data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);
  offset += local.length + name.length + compressed.length;
}

const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });
const output = path.join(dist, `colonist-page-watcher-chrome-${version}.zip`);
fs.writeFileSync(output, Buffer.concat([...localParts, centralDirectory, end]));
console.log(output);
