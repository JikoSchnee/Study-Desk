const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const verificationScript = `
const Database = require(process.argv[1]);
const database = new Database(":memory:");
try {
  const row = database.prepare("SELECT 1 AS ok").get();
  if (!row || row.ok !== 1) throw new Error("SQLite verification query returned an unexpected result.");
} finally {
  database.close();
}
`;

function verifyNativeAddon(runtime, modulePath, options = {}) {
  const runtimeName = options.runtimeName ?? runtime;
  execFileSync(runtime, ["-e", verificationScript, modulePath], {
    cwd: options.cwd,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  console.log(`Verified better-sqlite3 with ${runtimeName}: ${modulePath}`);
}

function verifyBuildOutputs() {
  const root = join(__dirname, "..");
  const sourceModule = join(root, "node_modules", "better-sqlite3");
  const standaloneModule = join(root, ".next", "standalone", "node_modules", "better-sqlite3");
  verifyNativeAddon(process.execPath, sourceModule, { cwd: root, runtimeName: `Node ${process.versions.node} (ABI ${process.versions.modules})` });
  verifyNativeAddon(require("electron"), standaloneModule, { cwd: root, runtimeName: `Electron ${require("electron/package.json").version}` });
}

if (require.main === module) verifyBuildOutputs();

module.exports = { verificationScript, verifyBuildOutputs, verifyNativeAddon };
