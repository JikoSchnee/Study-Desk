const { cpSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { buildSync } = require("esbuild");

const output = join(__dirname, "dist");
mkdirSync(output, { recursive: true });
// Development only. Release packaging refuses to run without an explicit key.
const developmentTransferKey = "REREREREREREREREREREREREREREREREREREREREREQ=";

buildSync({
  entryPoints: [join(__dirname, "main.cjs")],
  outfile: join(output, "main.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  legalComments: "none",
  define: {
    __STUDY_DESK_TRANSFER_KEY_CURRENT__: JSON.stringify(process.env.STUDY_DESK_TRANSFER_KEY_CURRENT || developmentTransferKey),
    __STUDY_DESK_TRANSFER_KEY_PREVIOUS__: JSON.stringify(process.env.STUDY_DESK_TRANSFER_KEY_PREVIOUS || ""),
    __STUDY_DESK_TRANSFER_KEY_VERSION__: JSON.stringify(process.env.STUDY_DESK_TRANSFER_KEY_VERSION || "1"),
  },
});

cpSync(join(__dirname, "preload.cjs"), join(output, "preload.cjs"));
cpSync(join(__dirname, "network-fetch.cjs"), join(output, "network-fetch.cjs"));
