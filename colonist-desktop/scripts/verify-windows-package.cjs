"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");
const ResEdit = require("resedit");
const {
  FuseState,
  FuseV1Options,
  getCurrentFuseWire,
} = require("@electron/fuses");
const { APP_NAME } = require("./package-shared.cjs");

const root = path.join(__dirname, "..");
const expectedVersion = require(path.join(root, "package.json")).version;
const machineByArchitecture = Object.freeze({ x64: 0x8664, arm64: 0xaa64 });

function readPeMachine(executable) {
  const peOffset = executable.readUInt32LE(0x3c);
  assert.equal(executable.subarray(peOffset, peOffset + 4).toString("binary"), "PE\u0000\u0000", "executable should contain a PE signature");
  return executable.readUInt16LE(peOffset + 4);
}

function readVersionStrings(executable) {
  const pe = ResEdit.NtExecutable.from(executable);
  const resources = ResEdit.NtExecutableResource.from(pe);
  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  assert(versions.length > 0, "executable should contain Windows version metadata");
  const languages = versions[0].getAllLanguagesForStringValues();
  assert(languages.length > 0, "version metadata should contain a language table");
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  assert(iconGroups.length > 0, "executable should contain the Catanatron application icon");
  return versions[0].getStringValues(languages[0]);
}

function normalizeAsarPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

async function verifyWindowsPackage(outputPath, { expectedArch = "x64" } = {}) {
  const resolved = path.resolve(outputPath);
  const executablePath = path.join(resolved, `${APP_NAME}.exe`);
  const asarPath = path.join(resolved, "resources", "app.asar");
  const buildInfoPath = path.join(resolved, "BUILD-INFO.json");
  const executable = fs.readFileSync(executablePath);
  assert.equal(executable.subarray(0, 2).toString("ascii"), "MZ", "Windows executable should start with MZ");
  assert.equal(readPeMachine(executable), machineByArchitecture[expectedArch], `executable should target Windows ${expectedArch}`);
  assert(fs.statSync(executablePath).size > 50_000_000, "Windows executable should contain the packaged Electron runtime");
  assert(fs.existsSync(path.join(resolved, "resources.pak")), "Electron runtime resources should exist");
  assert(fs.existsSync(path.join(resolved, "chrome_100_percent.pak")), "Chromium resources should exist");
  assert(fs.existsSync(path.join(resolved, "libEGL.dll")), "ANGLE runtime should exist");

  const packagedFiles = new Set(asar.listPackage(asarPath).map(normalizeAsarPath));
  for (const required of ["/dist/main.cjs", "/dist/preload.cjs", "/package.json", "/assets/icon.png"]) {
    assert(packagedFiles.has(required), `app.asar should contain ${required}`);
  }
  const packagedManifest = JSON.parse(asar.extractFile(asarPath, "package.json").toString("utf8"));
  assert.equal(packagedManifest.version, expectedVersion);
  assert.equal(packagedManifest.main, "dist/main.cjs");

  const versionStrings = readVersionStrings(executable);
  assert.equal(versionStrings.ProductName, APP_NAME);
  assert.equal(versionStrings.FileDescription, "Secure Colonist browser with local Catanatron intelligence");
  assert.equal(versionStrings.OriginalFilename, `${APP_NAME}.exe`);

  const fuses = await getCurrentFuseWire(executablePath);
  const expectedFuses = new Map([
    [FuseV1Options.RunAsNode, FuseState.DISABLE],
    [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
    [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
    [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
    [FuseV1Options.WasmTrapHandlers, FuseState.ENABLE],
  ]);
  for (const [fuse, state] of expectedFuses) assert.equal(fuses[fuse], state, `fuse ${fuse} should have the hardened state`);

  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
  assert.deepEqual(buildInfo, {
    app: APP_NAME,
    version: expectedVersion,
    platform: "win32",
    arch: expectedArch,
    portable: true,
    signed: false,
  });
  console.log(`Verified Windows package ${resolved}`);
  return { executablePath, asarPath, version: expectedVersion, arch: expectedArch };
}

if (require.main === module) {
  const outputPath = process.argv[2] || path.join(root, "release", `${APP_NAME}-win32-x64`);
  const expectedArch = process.argv[3] || "x64";
  verifyWindowsPackage(outputPath, { expectedArch }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { normalizeAsarPath, readPeMachine, verifyWindowsPackage };
