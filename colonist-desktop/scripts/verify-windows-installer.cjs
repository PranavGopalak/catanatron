"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ResEdit = require("resedit");
const { APP_NAME } = require("./package-shared.cjs");

const root = path.join(__dirname, "..");
const version = require(path.join(root, "package.json")).version;

function readVersionStrings(executable) {
  const pe = ResEdit.NtExecutable.from(executable);
  const resources = ResEdit.NtExecutableResource.from(pe);
  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  assert(versions.length > 0, "installer should contain Windows version metadata");
  const languages = versions[0].getAllLanguagesForStringValues();
  assert(languages.length > 0, "installer metadata should contain a language table");
  return versions[0].getStringValues(languages[0]);
}

function verifyWindowsInstaller(installerPath) {
  const resolved = path.resolve(installerPath);
  const executable = fs.readFileSync(resolved);
  assert.equal(executable.subarray(0, 2).toString("ascii"), "MZ");
  assert(executable.length > 50_000_000, "Windows installer is unexpectedly small");
  const strings = readVersionStrings(executable);
  assert.match(strings.ProductName || strings.FileDescription || "", /Catanatron Colonist/i);
  assert.match(strings.ProductVersion || strings.FileVersion || "", new RegExp(`^${version.replaceAll(".", "\\.")}`));
  const checksum = crypto.createHash("sha256").update(executable).digest("hex");
  const checksumPath = `${resolved}.sha256`;
  fs.writeFileSync(checksumPath, `${checksum}  ${path.basename(resolved)}\n`, "utf8");
  console.log(`Verified Windows installer ${resolved}`);
  console.log(`SHA256 ${checksum}`);
  return { installerPath: resolved, checksumPath, checksum, versionStrings: strings };
}

if (require.main === module) {
  const installerPath =
    process.argv[2] ||
    path.join(
      root,
      "release",
      "installer",
      `Catanatron-Colonist-${version}-Windows-x64-Setup.exe`,
    );
  try {
    verifyWindowsInstaller(installerPath);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { readVersionStrings, verifyWindowsInstaller };
