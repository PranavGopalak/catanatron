"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.join(__dirname, "..");
const outputDirectory = path.join(root, "assets");
const sizes = [16, 24, 32, 48, 64, 128, 256];

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let result = value;
  for (let bit = 0; bit < 8; bit += 1) result = (result & 1) ? 0xedb88320 ^ (result >>> 1) : result >>> 1;
  return result >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function pixel(size, x, y) {
  const scale = size / 256;
  const dx = x + 0.5 - size / 2;
  const dy = y + 0.5 - size / 2;
  const distance = Math.hypot(dx, dy) / scale;
  if (distance > 122) return [0, 0, 0, 0];
  if (distance > 112) return [236, 247, 252, 255];
  if (distance > 104) return [39, 126, 170, 255];
  const angle = Math.atan2(dy, dx);
  if (distance >= 48 && distance <= 77 && Math.abs(angle) > 0.62) return [255, 255, 255, 255];
  if (distance < 104) return [242, 139, 38, 255];
  return [39, 126, 170, 255];
}

function createPng(size) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      const [red, green, blue, alpha] = pixel(size, x, y);
      scanlines[offset] = red;
      scanlines[offset + 1] = green;
      scanlines[offset + 2] = blue;
      scanlines[offset + 3] = alpha;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(images.length * 16);
  let offset = header.length + directory.length;
  images.forEach(({ size, png }, index) => {
    const entry = index * 16;
    directory[entry] = size === 256 ? 0 : size;
    directory[entry + 1] = size === 256 ? 0 : size;
    directory[entry + 2] = 0;
    directory[entry + 3] = 0;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, directory, ...images.map(({ png }) => png)]);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const images = sizes.map((size) => ({ size, png: createPng(size) }));
fs.writeFileSync(path.join(outputDirectory, "icon.png"), images.at(-1).png);
fs.writeFileSync(path.join(outputDirectory, "icon.ico"), createIco(images));
console.log(`Generated ${path.relative(root, path.join(outputDirectory, "icon.png"))} and ${path.relative(root, path.join(outputDirectory, "icon.ico"))}`);
