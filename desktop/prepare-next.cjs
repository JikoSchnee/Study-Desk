const { cpSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const standalone = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");

if (!existsSync(join(standalone, "server.js"))) {
  throw new Error("Next standalone output was not found. Run `npm run build` first.");
}

mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(staticDir, join(standalone, ".next", "static"), { recursive: true });
if (existsSync(publicDir)) cpSync(publicDir, join(standalone, "public"), { recursive: true });
