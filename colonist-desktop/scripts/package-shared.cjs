"use strict";

const {
  FuseVersion,
  FuseV1Options,
} = require("@electron/fuses");

const APP_NAME = "Catanatron Colonist";
const APP_ID = "dev.pranavg.catanatron.colonist";
const COPYRIGHT = "Copyright (c) 2026 Pranav Gopalak";
const PACKAGER_IGNORE = [
  /^\/release($|\/)/,
  /^\/scripts($|\/)/,
  /^\/tests($|\/)/,
];
const HARDENED_FUSES = Object.freeze({
  version: FuseVersion.V1,
  strictlyRequireAllFuses: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  [FuseV1Options.WasmTrapHandlers]: true,
});

module.exports = {
  APP_ID,
  APP_NAME,
  COPYRIGHT,
  HARDENED_FUSES,
  PACKAGER_IGNORE,
};
