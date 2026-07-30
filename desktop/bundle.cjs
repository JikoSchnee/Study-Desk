const { cpSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { buildSync } = require("esbuild");

const output = join(__dirname, "dist");
mkdirSync(output, { recursive: true });

buildSync({
  entryPoints: [join(__dirname, "main.cjs")],
  outfile: join(output, "main.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  legalComments: "none",
});

cpSync(join(__dirname, "preload.cjs"), join(output, "preload.cjs"));
