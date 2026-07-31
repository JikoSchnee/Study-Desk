const { existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

const root = join(__dirname, "..");
const addon = join(root, "node_modules", "better-sqlite3");
const binary = join(addon, "build", "Release", "better_sqlite3.node");
const electron = require("electron");

function verifyElectronAddon(modulePath) {
  // Loading the module with Electron is the reliable ABI check. Merely checking
  // that the .node file exists can leave a Node-built addon in a desktop build.
  execFileSync(electron, ["-e", "require(process.argv[1])", modulePath], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
}

// node-gyp's cleanup can remove this helper directory before electron-rebuild
// verifies it on newer Node releases.
mkdirSync(join(addon, "build", "node_gyp_bins"), { recursive: true });
try {
  execFileSync(join(root, "node_modules", ".bin", "electron-rebuild"), ["--force", "--which-module", "better-sqlite3"], { cwd: root, stdio: "inherit" });
} catch (error) {
  // Electron 43's node-gyp can remove node_gyp_bins after producing the binary.
  // Accept that specific cleanup failure only when Electron can load the result.
  if (!existsSync(binary)) throw error;
  try { verifyElectronAddon(addon); } catch { throw error; }
}
verifyElectronAddon(addon);
