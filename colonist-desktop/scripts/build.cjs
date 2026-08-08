"use strict";

const path = require("node:path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");

esbuild.build({
  entryPoints: {
    main: path.join(root, "src", "main.js"),
    preload: path.join(root, "src", "preload.js"),
  },
  outdir: path.join(root, "dist"),
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  loader: { ".css": "text" },
  legalComments: "none",
  sourcemap: false,
  minify: false,
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
