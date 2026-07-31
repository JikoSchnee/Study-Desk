const { cpSync, existsSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { verifyNativeAddon } = require("./verify-native.cjs");

const root = join(__dirname, "..");
const source = join(root, "node_modules", "better-sqlite3", "build");
const targetModule = join(root, ".next", "standalone", "node_modules", "better-sqlite3");
const target = join(targetModule, "build");

if (!existsSync(source) || !existsSync(target)) throw new Error("better-sqlite3 build output is missing.");
// Recreate the directory instead of overwriting files in place. This guarantees
// that restoring the root Node addon cannot mutate a linked standalone binary.
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

// Check the exact copy that electron-builder places in resources/next.
verifyNativeAddon(require("electron"), targetModule, { cwd: root, runtimeName: "Electron standalone" });
