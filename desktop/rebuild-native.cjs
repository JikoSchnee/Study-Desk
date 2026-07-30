const { existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

const root = join(__dirname, "..");
// node-gyp's cleanup can remove this helper directory before electron-rebuild
// verifies it on newer Node releases.
mkdirSync(join(root, "node_modules", "better-sqlite3", "build", "node_gyp_bins"), { recursive: true });
try {
  execFileSync(join(root, "node_modules", ".bin", "electron-rebuild"), ["--force", "--which-module", "better-sqlite3"], { cwd: root, stdio: "inherit" });
} catch (error) {
  // Electron 43's node-gyp can remove node_gyp_bins after producing the binary.
  // Keep the successfully compiled addon, but surface real compilation failures.
  if (!existsSync(join(root, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"))) throw error;
}
