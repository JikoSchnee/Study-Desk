const { app, BrowserWindow, ipcMain, utilityProcess } = require("electron");
const { existsSync } = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");

let mainWindow;
let serverProcess;
let serverPort;

function userHome() { return path.join(app.getPath("userData"), "runtime"); }
function sendMaximizeState() { mainWindow?.webContents.send("window:maximize-change", mainWindow?.isMaximized() ?? false); }
function compareVersions(left, right) {
  const leftParts = String(left).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    if ((leftParts[index] ?? 0) !== (rightParts[index] ?? 0)) return (leftParts[index] ?? 0) > (rightParts[index] ?? 0) ? 1 : -1;
  }
  return 0;
}
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = https.get("https://api.github.com/repos/JikoSchnee/Study-Desk/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Study-Desk" },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`GitHub 返回了 ${response.statusCode ?? "未知"} 状态。`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error("无法读取 GitHub 的版本信息。")); }
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error("检查更新超时。")));
    request.on("error", reject);
  });
}

function findPort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close(() => resolve(address.port));
    });
  });
}

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const attempt = () => {
      const request = http.get(`http://127.0.0.1:${port}/`, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) resolve();
        else retry();
      });
      request.on("error", retry);
      request.setTimeout(1_500, () => { request.destroy(); retry(); });
    };
    const retry = () => Date.now() >= deadline ? reject(new Error("本地应用服务启动超时。")) : setTimeout(attempt, 250);
    attempt();
  });
}

async function startServer() {
  serverPort = await findPort();
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, "next", "server.js")
    : path.join(app.getAppPath(), ".next", "standalone", "server.js");
  if (!existsSync(serverPath)) throw new Error("未找到应用服务。请先执行 npm run desktop:build。");
  serverProcess = utilityProcess.fork(serverPath, [], {
    env: { ...process.env, PORT: String(serverPort), HOSTNAME: "127.0.0.1", MOCK_INTERVIEW_HOME: userHome(), NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
    serviceName: "Study Desk Server",
  });
  serverProcess.stderr?.on("data", (message) => console.error(`[next] ${message}`));
  serverProcess.once("exit", (code) => { if (code && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:server-error", "本地服务意外退出。"); });
  await waitForServer(serverPort);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 920,
    minHeight: 680,
    show: false,
    frame: process.platform !== "win32",
    backgroundColor: "#ffffff",
    title: "八股训练台",
    // Match the compact desktop layout users get after zooming out twice.
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false, zoomFactor: 0.8 },
  });
  mainWindow.on("maximize", sendMaximizeState);
  mainWindow.on("unmaximize", sendMaximizeState);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
}

ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:toggle-maximize", () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
ipcMain.handle("window:close", () => mainWindow?.close());
ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
ipcMain.handle("updates:check", async () => {
  const currentVersion = app.getVersion();
  try {
    const release = await fetchLatestRelease();
    if (!release?.tag_name) throw new Error("GitHub 未返回有效的版本号。");
    const latestVersion = String(release.tag_name).replace(/^v/, "");
    return {
      state: compareVersions(latestVersion, currentVersion) > 0 ? "available" : "current",
      currentVersion,
      latestVersion,
      url: typeof release.html_url === "string" ? release.html_url : "https://github.com/JikoSchnee/Study-Desk/releases",
    };
  } catch (error) {
    return { state: "error", currentVersion, message: error instanceof Error ? error.message : "检查更新失败。" };
  }
});
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  try { await startServer(); createWindow(); }
  catch (error) { console.error(error); app.quit(); }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { serverProcess?.kill(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0 && serverPort) createWindow(); });
