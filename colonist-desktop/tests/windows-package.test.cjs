"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  FuseV1Options,
} = require("@electron/fuses");
const { HARDENED_FUSES } = require("../scripts/package-shared.cjs");
const {
  normalizeAsarPath,
  readPeMachine,
} = require("../scripts/verify-windows-package.cjs");

const root = path.join(__dirname, "..");

function peHeader(machine) {
  const buffer = Buffer.alloc(128);
  buffer.write("MZ", 0, "ascii");
  buffer.writeUInt32LE(64, 0x3c);
  buffer.write("PE\u0000\u0000", 64, "binary");
  buffer.writeUInt16LE(machine, 68);
  return buffer;
}

test("recognizes x64 and arm64 Windows executable headers", () => {
  assert.equal(readPeMachine(peHeader(0x8664)), 0x8664);
  assert.equal(readPeMachine(peHeader(0xaa64)), 0xaa64);
});

test("normalizes archive entries from Windows and POSIX hosts", () => {
  assert.equal(normalizeAsarPath("\\dist\\main.cjs"), "/dist/main.cjs");
  assert.equal(normalizeAsarPath("dist\\preload.cjs"), "/dist/preload.cjs");
  assert.equal(normalizeAsarPath("/assets/icon.png"), "/assets/icon.png");
});

test("defines every production Electron fuse explicitly", () => {
  assert.equal(HARDENED_FUSES.strictlyRequireAllFuses, true);
  for (const fuse of Object.values(FuseV1Options).filter((value) => Number.isInteger(value))) {
    assert.equal(typeof HARDENED_FUSES[fuse], "boolean", `fuse ${fuse} should be explicit`);
  }
});

test("generates native Windows icons and an isolated launch smoke test", () => {
  const png = fs.readFileSync(path.join(root, "assets", "icon.png"));
  const ico = fs.readFileSync(path.join(root, "assets", "icon.ico"));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);

  const smoke = fs.readFileSync(path.join(root, "scripts", "smoke-windows.ps1"), "utf8");
  assert(smoke.includes("--user-data-dir"));
  assert(smoke.includes("MainWindowHandle"));
  assert(smoke.includes("VersionInfo"));
  assert(smoke.includes("windows-smoke.json"));
});

test("keeps macOS packaging relocatable and archives the app bundle safely", () => {
  const packager = fs.readFileSync(
    path.join(root, "scripts", "package-mac.cjs"),
    "utf8",
  );
  const archive = fs.readFileSync(
    path.join(root, "scripts", "archive-mac.cjs"),
    "utf8",
  );
  assert(packager.includes('optionValue("--out")'));
  assert(archive.includes("--sequesterRsrc"));
  assert(archive.includes("--keepParent"));
  assert(archive.includes("sha256"));
});

test("creates native direct installers for macOS and Windows", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const dmg = fs.readFileSync(
    path.join(root, "scripts", "create-mac-dmg.cjs"),
    "utf8",
  );
  const installerSmoke = fs.readFileSync(
    path.join(root, "scripts", "smoke-windows-installer.ps1"),
    "utf8",
  );
  assert.equal(manifest.build.nsis.oneClick, true);
  assert.equal(manifest.build.nsis.perMachine, false);
  assert.equal(manifest.build.nsis.allowElevation, false);
  assert.equal(manifest.build.nsis.createDesktopShortcut, true);
  assert.equal(manifest.build.nsis.createStartMenuShortcut, true);
  assert.match(manifest.build.nsis.artifactName, /Setup\.\$\{ext\}$/);
  assert(dmg.includes('fs.symlinkSync("/Applications"'));
  assert(dmg.includes('"hdiutil", ["verify"'));
  assert(dmg.includes('!== "koly"'));
  assert(installerSmoke.includes('ArgumentList "/S"'));
  assert(installerSmoke.includes("$manifest.name"));
  assert(installerSmoke.includes("$manifest.build.productName"));
  assert(installerSmoke.includes("smoke-windows.ps1"));
  assert(installerSmoke.includes('"Uninstall " + $productName + ".exe"'));
});
