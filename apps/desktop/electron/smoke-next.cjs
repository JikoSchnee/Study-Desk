const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { createServer } = require("node:net");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const serverPath = join(root, ".next", "standalone", "apps", "desktop", "server.js");
const runtimeHome = mkdtempSync(join(tmpdir(), "study-desk-desktop-smoke-"));

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("Unable to allocate a smoke-test port.")));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3_000).then(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }),
  ]);
}

async function jsonFrom(path, port) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(10_000) });
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error(`${path} returned ${contentType || "an unknown content type"} (HTTP ${response.status}): ${body.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(body); }
  catch { throw new Error(`${path} returned invalid JSON (HTTP ${response.status}): ${body.slice(0, 200)}`); }
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  const port = await availablePort();
  const child = spawn(require("electron"), [serverPath], {
    cwd: join(root, ".next", "standalone"),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      MOCK_INTERVIEW_HOME: runtimeHome,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_000) });
        response.body?.cancel();
        if (response.status < 500) { ready = true; break; }
      } catch {}
      await delay(250);
    }
    if (!ready) throw new Error(`Standalone server failed to start.\n${stderr}`);

    const dashboard = await jsonFrom("/api/dashboard", port);
    if (!Array.isArray(dashboard.tasks) || !dashboard.totals) throw new Error("/api/dashboard returned an incomplete payload.");
    const cards = await jsonFrom("/api/cards?limit=1", port);
    if (!Array.isArray(cards.cards) || typeof cards.total !== "number") throw new Error("/api/cards returned an incomplete payload.");
    const modelStatus = await jsonFrom("/api/settings/prewarm", port);
    if (typeof modelStatus.state !== "string" || typeof modelStatus.onnxState !== "string") throw new Error("/api/settings/prewarm returned an incomplete payload.");
    console.log("Desktop standalone smoke test passed: dashboard, cards, and embedding status returned JSON.");
  } finally {
    await stopProcess(child);
    rmSync(runtimeHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  rmSync(runtimeHome, { recursive: true, force: true });
  process.exitCode = 1;
});
