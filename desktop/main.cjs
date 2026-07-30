const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

let mainWindow;
let serverProcess;
let serverPort;
let availableUpdate;
let downloadedUpdate;
let updateSettings = {};

function userHome() { return path.join(app.getPath("userData"), "runtime"); }
function updateSettingsPath() { return path.join(app.getPath("userData"), "updater.json"); }
function loadUpdateSettings() {
  try { updateSettings = JSON.parse(readFileSync(updateSettingsPath(), "utf8")); }
  catch { updateSettings = {}; }
}
function saveUpdateSettings() { writeFileSync(updateSettingsPath(), JSON.stringify(updateSettings, null, 2)); }
function sendUpdate(status) { mainWindow?.webContents.send("updater:status", status); }
function sendMaximizeState() { mainWindow?.webContents.send("window:maximize-change", mainWindow?.isMaximized() ?? false); }

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
  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(serverPort), HOSTNAME: "127.0.0.1", MOCK_INTERVIEW_HOME: userHome(), NODE_ENV: "production" },
    stdio: "pipe",
    windowsHide: true,
  });
  serverProcess.stderr.on("data", (message) => console.error(`[next] ${message}`));
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
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  mainWindow.on("maximize", sendMaximizeState);
  mainWindow.on("unmaximize", sendMaximizeState);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
}

function configureUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("checking-for-update", () => sendUpdate({ state: "checking" }));
  autoUpdater.on("update-not-available", () => sendUpdate({ state: "not-available" }));
  autoUpdater.on("update-available", (info) => {
    availableUpdate = info;
    if (updateSettings.ignoredVersion === info.version) return;
    sendUpdate({ state: "available", version: info.version, notes: typeof info.releaseNotes === "string" ? info.releaseNotes : "" });
    if (updateSettings.deferredVersion === info.version) void autoUpdater.downloadUpdate();
  });
  autoUpdater.on("download-progress", (progress) => sendUpdate({ state: "downloading", percent: Math.round(progress.percent), transferred: progress.transferred, total: progress.total }));
  autoUpdater.on("update-downloaded", (info) => { downloadedUpdate = info; updateSettings.deferredVersion = undefined; saveUpdateSettings(); sendUpdate({ state: "downloaded", version: info.version, notes: typeof info.releaseNotes === "string" ? info.releaseNotes : "" }); });
  autoUpdater.on("error", (error) => sendUpdate({ state: "error", message: error.message }));
  setTimeout(() => { void autoUpdater.checkForUpdates(); }, 8_000);
  setInterval(() => { void autoUpdater.checkForUpdates(); }, 6 * 60 * 60 * 1_000);
}

ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:toggle-maximize", () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
ipcMain.handle("window:close", () => mainWindow?.close());
ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
ipcMain.handle("updater:check", async () => { if (!app.isPackaged) return { state: "development" }; return autoUpdater.checkForUpdates(); });
ipcMain.handle("updater:download", () => autoUpdater.downloadUpdate());
ipcMain.handle("updater:defer", () => { if (availableUpdate) { updateSettings.deferredVersion = availableUpdate.version; saveUpdateSettings(); } });
ipcMain.handle("updater:ignore", () => { if (availableUpdate) { updateSettings.ignoredVersion = availableUpdate.version; updateSettings.deferredVersion = undefined; saveUpdateSettings(); sendUpdate({ state: "ignored", version: availableUpdate.version }); } });
ipcMain.handle("updater:install", () => { if (downloadedUpdate) autoUpdater.quitAndInstall(); });

app.whenReady().then(async () => {
  loadUpdateSettings();
  try { await startServer(); createWindow(); configureUpdater(); }
  catch (error) { console.error(error); app.quit(); }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { serverProcess?.kill(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0 && serverPort) createWindow(); });
