const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { verifyNativeAddon } = require("./verify-native.cjs");

const root = join(__dirname, "..");
const addon = join(root, "node_modules", "better-sqlite3");
const electron = require("electron");
const electronVersion = require("electron/package.json").version;

// node-gyp's cleanup can remove this helper directory before electron-rebuild
// verifies it on newer Node releases.
mkdirSync(join(addon, "build", "node_gyp_bins"), { recursive: true });
const rebuild = spawnSync(join(root, "node_modules", ".bin", "electron-rebuild"), [
  "--force",
  "--which-module", "better-sqlite3",
  "--version", electronVersion,
], { cwd: root, encoding: "utf8" });
if (rebuild.stdout) process.stdout.write(rebuild.stdout);
if (rebuild.stderr) process.stderr.write(rebuild.stderr);

if (rebuild.status !== 0) {
  const output = `${rebuild.stdout ?? ""}\n${rebuild.stderr ?? ""}`;
  const knownCleanupFailure = /node_gyp_bins/i.test(output) && /(ENOENT|no such file|cannot find|remove|unlink|rmdir)/i.test(output);
  if (!knownCleanupFailure) {
    throw new Error(`electron-rebuild failed with exit code ${rebuild.status ?? "unknown"}.`);
  }
  // Some node-gyp versions report a cleanup failure after producing the addon.
  // Only accept it when Electron can execute a real SQLite query with that binary.
  verifyNativeAddon(electron, addon, { cwd: root, runtimeName: `Electron ${electronVersion}` });
  console.warn("Ignoring node-gyp's node_gyp_bins cleanup failure because the rebuilt addon passed a SQLite query.");
}
verifyNativeAddon(electron, addon, { cwd: root, runtimeName: `Electron ${electronVersion}` });
