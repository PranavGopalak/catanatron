"use strict";

const path = require("node:path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");

esbuild.build({
  entryPoints: [path.join(root, "src", "preload.js")],
  outfile: path.join(root, "dist", "preload.cjs"),
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
