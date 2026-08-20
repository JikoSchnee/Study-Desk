const { spawn } = require("node:child_process");
const http = require("node:http");
const { join } = require("node:path");

const desktopRoot = join(__dirname, "..");
const workspaceRoot = join(__dirname, "..", "..", "..");
const port = Number(process.env.STUDY_DESK_DEV_PORT ?? 3010);
const node = process.execPath;
const next = require.resolve("next/dist/bin/next");
const electron = require("electron");
let nextProcess;
let electronProcess;

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const attempt = () => {
      const request = http.get(`http://127.0.0.1:${port}/settings`, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) resolve();
        else retry();
      });
      const retry = () => { request.destroy(); if (Date.now() >= deadline) reject(new Error(`Next 开发服务器未在 ${port} 端口准备就绪。`)); else setTimeout(attempt, 250); };
      request.once("error", retry);
      request.setTimeout(1_500, retry);
    };
    attempt();
  });
}
function stop(child) { if (child && !child.killed) child.kill(); }

async function main() {
  nextProcess = spawn(node, [next, "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: desktopRoot, stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } });
  await waitForServer();
  electronProcess = spawn(electron, [workspaceRoot], { cwd: workspaceRoot, stdio: "inherit", env: { ...process.env, STUDY_DESK_DEV_SERVER: "1", STUDY_DESK_DEV_PORT: String(port), NODE_ENV: "development" } });
  electronProcess.once("exit", (code) => { stop(nextProcess); process.exit(code ?? 0); });
}
process.once("SIGINT", () => { stop(electronProcess); stop(nextProcess); });
main().catch((error) => { console.error(error.message); stop(nextProcess); process.exit(1); });
