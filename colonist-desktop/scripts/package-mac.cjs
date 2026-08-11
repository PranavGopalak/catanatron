"use strict";

const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { packager } = require("@electron/packager");
const { flipFuses } = require("@electron/fuses");
const {
  APP_ID,
  APP_NAME,
  COPYRIGHT,
  HARDENED_FUSES,
  PACKAGER_IGNORE,
} = require("./package-shared.cjs");

const root = path.join(__dirname, "..");
const execFileAsync = promisify(execFile);

function optionValue(name) {
  const prefix = `${name}=`;
  const option = process.argv.find((argument) => argument.startsWith(prefix));
  return option ? option.slice(prefix.length) : null;
}

async function main() {
  const outputRoot = path.resolve(
    optionValue("--out") || path.join(root, "release"),
  );
  const outputPaths = await packager({
    dir: root,
    name: APP_NAME,
    appBundleId: APP_ID,
    appCategoryType: "public.app-category.board-games",
    appCopyright: COPYRIGHT,
    platform: "darwin",
    arch: process.arch,
    out: outputRoot,
    overwrite: true,
    prune: true,
    asar: true,
    extendInfo: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
      },
    },
    ignore: PACKAGER_IGNORE,
  });

  for (const outputPath of outputPaths) {
    const appPath = path.join(outputPath, `${APP_NAME}.app`);
    await flipFuses(appPath, HARDENED_FUSES);
    await execFileAsync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
    await execFileAsync("codesign", ["--verify", "--deep", "--strict", appPath]);
    console.log(`Packaged and hardened ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
