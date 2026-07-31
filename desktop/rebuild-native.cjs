const { mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { verifyNativeAddon } = require("./verify-native.cjs");

const root = join(__dirname, "..");
const addon = join(root, "node_modules", "better-sqlite3");
const electron = require("electron");
const electronVersion = require("electron/package.json").version;
const electronRebuildCli = join(dirname(require.resolve("@electron/rebuild")), "cli.js");

// node-gyp's cleanup can remove this helper directory before electron-rebuild
// verifies it on newer Node releases.
mkdirSync(join(addon, "build", "node_gyp_bins"), { recursive: true });
// Invoke the JavaScript entry point directly. npm's executable shim is a shell
// script on Unix and a .cmd file on Windows, so spawning the extensionless
// node_modules/.bin path is not portable.
const rebuild = spawnSync(process.execPath, [electronRebuildCli,
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
    const failure = rebuild.error
      ? `could not start: ${rebuild.error.message}`
      : `failed with exit code ${rebuild.status ?? "unknown"}${rebuild.signal ? ` (signal ${rebuild.signal})` : ""}`;
    throw new Error(`electron-rebuild ${failure}.`);
  }
  // Some node-gyp versions report a cleanup failure after producing the addon.
  // Only accept it when Electron can execute a real SQLite query with that binary.
  verifyNativeAddon(electron, addon, { cwd: root, runtimeName: `Electron ${electronVersion}` });
  console.warn("Ignoring node-gyp's node_gyp_bins cleanup failure because the rebuilt addon passed a SQLite query.");
}
verifyNativeAddon(electron, addon, { cwd: root, runtimeName: `Electron ${electronVersion}` });
