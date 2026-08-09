"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { packager } = require("@electron/packager");
const { flipFuses } = require("@electron/fuses");
const {
  APP_NAME,
  COPYRIGHT,
  HARDENED_FUSES,
  PACKAGER_IGNORE,
} = require("./package-shared.cjs");
const { verifyWindowsPackage } = require("./verify-windows-package.cjs");
const { archiveWindowsPackage } = require("./archive-windows.cjs");

const root = path.join(__dirname, "..");
const supportedArchitectures = new Set(["x64", "arm64"]);

function requestedArchitecture() {
  const argument = process.argv.find((value) => value.startsWith("--arch="));
  const architecture = argument ? argument.slice("--arch=".length) : "x64";
  if (!supportedArchitectures.has(architecture)) {
    throw new Error(`Unsupported Windows architecture: ${architecture}`);
  }
  return architecture;
}

async function main() {
  const arch = requestedArchitecture();
  const outputPaths = await packager({
    dir: root,
    name: APP_NAME,
    appCopyright: COPYRIGHT,
    platform: "win32",
    arch,
    out: path.join(root, "release"),
    overwrite: true,
    prune: true,
    asar: true,
    icon: path.join(root, "assets", "icon.ico"),
    win32metadata: {
      CompanyName: "Pranav Gopalak",
      FileDescription: "Secure Colonist browser with local Catanatron intelligence",
      ProductName: APP_NAME,
      InternalName: "CatanatronColonist",
      OriginalFilename: `${APP_NAME}.exe`,
      "requested-execution-level": "asInvoker",
    },
    ignore: PACKAGER_IGNORE,
  });

  for (const outputPath of outputPaths) {
    const executablePath = path.join(outputPath, `${APP_NAME}.exe`);
    await flipFuses(executablePath, HARDENED_FUSES);
    await fs.writeFile(path.join(outputPath, "BUILD-INFO.json"), `${JSON.stringify({
      app: APP_NAME,
      version: require(path.join(root, "package.json")).version,
      platform: "win32",
      arch,
      portable: true,
      signed: false,
    }, null, 2)}\n`, "utf8");
    await verifyWindowsPackage(outputPath, { expectedArch: arch });
    await archiveWindowsPackage(outputPath, arch);
    console.log(`Packaged, hardened, and verified ${outputPath}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { requestedArchitecture };
