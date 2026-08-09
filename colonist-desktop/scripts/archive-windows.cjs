"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { APP_NAME } = require("./package-shared.cjs");

const execFileAsync = promisify(execFile);
const root = path.join(__dirname, "..");

async function archiveWindowsPackage(outputPath, architecture = "x64") {
  const resolved = path.resolve(outputPath);
  const releaseDirectory = path.dirname(resolved);
  const archivePath = path.join(releaseDirectory, `${APP_NAME}-win32-${architecture}-portable.zip`);
  const checksumPath = `${archivePath}.sha256`;
  await fs.rm(archivePath, { force: true });
  await fs.rm(checksumPath, { force: true });
  await execFileAsync("tar", ["-a", "-cf", archivePath, "-C", releaseDirectory, path.basename(resolved)]);
  const archive = await fs.readFile(archivePath);
  if (archive.length < 50_000_000) throw new Error("Windows portable archive is unexpectedly small");
  const checksum = crypto.createHash("sha256").update(archive).digest("hex");
  await fs.writeFile(checksumPath, `${checksum}  ${path.basename(archivePath)}\n`, "utf8");
  console.log(`Archived ${archivePath}`);
  console.log(`SHA256 ${checksum}`);
  return { archivePath, checksumPath, checksum };
}

if (require.main === module) {
  const architecture = process.argv[3] || "x64";
  const outputPath = process.argv[2] || path.join(root, "release", `${APP_NAME}-win32-${architecture}`);
  archiveWindowsPackage(outputPath, architecture).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { archiveWindowsPackage };
