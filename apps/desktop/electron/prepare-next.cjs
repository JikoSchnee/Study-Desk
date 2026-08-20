const { cpSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const standalone = join(root, ".next", "standalone");
const application = join(standalone, "apps", "desktop");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");

if (!existsSync(join(application, "server.js"))) {
  throw new Error("Next standalone output was not found. Run `npm run build` first.");
}

mkdirSync(join(application, ".next"), { recursive: true });
cpSync(staticDir, join(application, ".next", "static"), { recursive: true });
if (existsSync(publicDir)) cpSync(publicDir, join(application, "public"), { recursive: true });
