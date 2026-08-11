"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
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
    throw new Error("The DMG must be created and verified on macOS.");
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
  const outputPath = path.resolve(
    optionValue("--output") ||
      path.join(
        root,
        "release",
        `Catanatron-Colonist-${version}-macOS-${architecture}.dmg`,
      ),
  );
  if (!fs.statSync(appPath).isDirectory()) {
    throw new Error(`Packaged application was not found at ${appPath}`);
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "catanatron-dmg-"));
  try {
    const stagedApp = path.join(staging, `${APP_NAME}.app`);
    await execFileAsync("ditto", [appPath, stagedApp]);
    fs.symlinkSync("/Applications", path.join(staging, "Applications"));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.rmSync(outputPath, { force: true });
    await execFileAsync("hdiutil", [
      "create",
      "-volname",
      APP_NAME,
      "-srcfolder",
      staging,
      "-ov",
      "-format",
      "UDZO",
      outputPath,
    ]);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  await execFileAsync("hdiutil", ["verify", outputPath]);
  const image = fs.readFileSync(outputPath);
  if (image.length < 50_000_000) {
    throw new Error("The macOS disk image is unexpectedly small.");
  }
  if (image.subarray(image.length - 512, image.length - 508).toString("ascii") !== "koly") {
    throw new Error("The macOS disk image is missing its UDIF trailer.");
  }
  const checksum = crypto.createHash("sha256").update(image).digest("hex");
  fs.writeFileSync(
    `${outputPath}.sha256`,
    `${checksum}  ${path.basename(outputPath)}\n`,
    "utf8",
  );
  console.log(`Created ${outputPath}`);
  console.log(`SHA256 ${checksum}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
