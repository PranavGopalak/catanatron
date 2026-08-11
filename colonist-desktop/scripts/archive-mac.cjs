"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { APP_NAME } = require("./package-shared.cjs");

const root = path.join(__dirname, "..");
const version = require(path.join(root, "package.json")).version;
const execFileAsync = promisify(execFile);

function optionValue(name) {
  const prefix = `${name}=`;
  const option = process.argv.find((argument) => argument.startsWith(prefix));
  return option ? option.slice(prefix.length) : null;
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("The macOS application archive must be created on macOS.");
  }

  const architecture = optionValue("--arch") || process.arch;
  const appPath = path.resolve(
    optionValue("--input") ||
      path.join(
        root,
        "release",
        `${APP_NAME}-darwin-${architecture}`,
        `${APP_NAME}.app`,
      ),
  );
  const archivePath = path.resolve(
    optionValue("--output") ||
      path.join(
        root,
        "release",
        `Catanatron-Colonist-${version}-macOS-${architecture}.zip`,
      ),
  );

  if (!fs.statSync(appPath).isDirectory()) {
    throw new Error(`Packaged application was not found at ${appPath}`);
  }

  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.rmSync(archivePath, { force: true });
  await execFileAsync("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    appPath,
    archivePath,
  ]);

  const checksum = crypto
    .createHash("sha256")
    .update(fs.readFileSync(archivePath))
    .digest("hex");
  const checksumPath = `${archivePath}.sha256`;
  fs.writeFileSync(
    checksumPath,
    `${checksum}  ${path.basename(archivePath)}\n`,
    "utf8",
  );
  console.log(`Archived ${archivePath}`);
  console.log(`SHA256 ${checksum}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
