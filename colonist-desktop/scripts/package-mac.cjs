"use strict";

const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { packager } = require("@electron/packager");
const {
  flipFuses,
  FuseVersion,
  FuseV1Options,
} = require("@electron/fuses");

const root = path.join(__dirname, "..");
const execFileAsync = promisify(execFile);

async function main() {
  const outputPaths = await packager({
    dir: root,
    name: "Catanatron Colonist",
    appBundleId: "dev.pranavg.catanatron.colonist",
    appCategoryType: "public.app-category.board-games",
    platform: "darwin",
    arch: process.arch,
    out: path.join(root, "release"),
    overwrite: true,
    prune: true,
    asar: true,
    extendInfo: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
      },
    },
    ignore: [
      /^\/release($|\/)/,
      /^\/tests($|\/)/,
    ],
  });

  for (const outputPath of outputPaths) {
    const appPath = path.join(outputPath, "Catanatron Colonist.app");
    await flipFuses(appPath, {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    });
    await execFileAsync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
    await execFileAsync("codesign", ["--verify", "--deep", "--strict", appPath]);
    console.log(`Packaged and hardened ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
