const { cpSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(root, "node_modules", "better-sqlite3", "build");
const target = join(root, ".next", "standalone", "node_modules", "better-sqlite3", "build");

if (!existsSync(source) || !existsSync(target)) throw new Error("better-sqlite3 build output is missing.");
cpSync(source, target, { recursive: true });
