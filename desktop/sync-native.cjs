const { cpSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

const root = join(__dirname, "..");
const source = join(root, "node_modules", "better-sqlite3", "build");
const targetModule = join(root, ".next", "standalone", "node_modules", "better-sqlite3");
const target = join(targetModule, "build");

if (!existsSync(source) || !existsSync(target)) throw new Error("better-sqlite3 build output is missing.");
cpSync(source, target, { recursive: true });

// Check the exact copy that electron-builder places in resources/next.
execFileSync(require("electron"), ["-e", "require(process.argv[1])", targetModule], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
});
