const { app, BrowserWindow, ipcMain, net: electronNet, powerMonitor, session, utilityProcess, safeStorage } = require("electron");
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

let mainWindow;
let serverProcess;
let serverPort;
let isQuitting = false;
let isRestartingServer = false;
const releasesUrl = "https://github.com/JikoSchnee/Study-Desk/releases";
const networkChecks = [
  { id: "network", label: "基础网络", url: "https://www.baidu.com/" },
  { id: "github", label: "GitHub", url: "https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/README.md" },
  { id: "huggingface", label: "Hugging Face", url: "https://huggingface.co/" },
];
const networkTimeoutMs = 8_000;

function userHome() { return path.join(app.getPath("userData"), "runtime"); }
function syncCredentialPath() { return path.join(app.getPath("userData"), "webdav-sync-credential.bin"); }
function supabaseSessionPath() { return path.join(app.getPath("userData"), "supabase-sync-session.bin"); }
function secureValue(file) {
  try { return existsSync(file) && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(readFileSync(file)) : ""; } catch { return ""; }
}
function saveSecureValue(file, value, label) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error(`系统安全存储不可用，无法保存${label}。`);
  if (!value) { if (existsSync(file)) unlinkSync(file); return false; }
  writeFileSync(file, safeStorage.encryptString(value), { mode: 0o600 }); return true;
}
function cloudSyncPassword() {
  try {
    const file = syncCredentialPath();
    if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return "";
    return safeStorage.decryptString(readFileSync(file));
  } catch { return ""; }
}
function saveCloudSyncPassword(value) {
  return saveSecureValue(syncCredentialPath(), value, " WebDAV 密码");
}
function supabaseSession() { return secureValue(supabaseSessionPath()); }
function sendMaximizeState() { mainWindow?.webContents.send("window:maximize-change", mainWindow?.isMaximized() ?? false); }
function compareVersions(left, right) {
  const leftParts = String(left).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    if ((leftParts[index] ?? 0) !== (rightParts[index] ?? 0)) return (leftParts[index] ?? 0) > (rightParts[index] ?? 0) ? 1 : -1;
  }
  return 0;
}
async function fetchLatestRelease() {
  try {
    const response = await electronNet.fetch("https://api.github.com/repos/JikoSchnee/Study-Desk/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Study-Desk" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`GitHub 返回了 ${response.status} 状态。`);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("无法连接 GitHub（10 秒超时）。请检查网络后重试，或直接前往 Releases 下载。");
    throw new Error(`无法连接 GitHub：${error instanceof Error ? error.message : "未知错误"}。请检查网络后重试，或直接前往 Releases 下载。`);
  }
}
function failureKind(error, timedOut) {
  if (timedOut) return ["timeout", `超过 ${networkTimeoutMs / 1_000} 秒未收到响应。`];
  const message = error instanceof Error ? `${error.name} ${error.message}`.toUpperCase() : "";
  if (message.includes("NAME_NOT_RESOLVED") || message.includes("ENOTFOUND")) return ["dns", "域名无法解析（DNS）。"];
  if (message.includes("CERT") || message.includes("SSL")) return ["tls", "HTTPS 证书验证失败，可能被代理或安全软件拦截。"];
  if (message.includes("PROXY") || message.includes("TUNNEL")) return ["proxy", "系统代理无法建立连接、认证或转发请求。"];
  if (message.includes("CONNECTION") || message.includes("NETWORK") || message.includes("UNREACHABLE") || message.includes("TIMEDOUT")) return ["connection", "连接被拒绝、重置或网络不可达。"];
  return ["unknown", "请求未能建立；可能受网络、代理或安全软件影响。"];
}
async function checkElectronNetwork({ id, label, url }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, networkTimeoutMs);
  try {
    const response = await electronNet.fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal, headers: { "User-Agent": "Study-Desk network diagnostic", Accept: "text/html,application/json;q=0.9" } });
    const durationMs = Date.now() - startedAt;
    if (response.status >= 200 && response.status < 400) return { id, label, ok: true, status: response.status, durationMs, detail: `已连接（HTTP ${response.status}）。` };
    return { id, label, ok: false, status: response.status, durationMs, failureKind: "http", detail: `网站返回 HTTP ${response.status}。网络已到达该网站，但请求被其服务拒绝或限制。` };
  } catch (error) {
    const [kind, detail] = failureKind(error, timedOut);
    return { id, label, ok: false, durationMs: Date.now() - startedAt, failureKind: kind, detail };
  } finally {
    clearTimeout(timer);
  }
}
async function desktopNetworkDiagnostics() {
  const checks = await Promise.all(networkChecks.map(checkElectronNetwork));
  const allFailed = checks.every((check) => !check.ok);
  return {
    layer: { id: "electron", label: "Electron 系统网络", transport: "Chromium / Windows 系统代理", checks },
    ...(allFailed ? { guidance: "Electron 系统网络也无法访问。请检查 Windows 防火墙、安全软件、系统代理或企业网络策略。" } : {}),
  };
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

function isServerAvailable(port) {
  return new Promise((resolve) => {
    if (!port) return resolve(false);
    const request = http.get(`http://127.0.0.1:${port}/api/cards?limit=1`, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.once("error", () => resolve(false));
    request.setTimeout(1_500, () => { request.destroy(); resolve(false); });
  });
}

async function startServer(port = null) {
  serverPort = port ?? (process.env.STUDY_DESK_DEV_SERVER === "1" ? Number(process.env.STUDY_DESK_DEV_PORT ?? 3010) : await findPort());
  if (process.env.STUDY_DESK_DEV_SERVER === "1") {
    await waitForServer(serverPort);
    return;
  }
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, "next", "server.js")
    : path.join(app.getAppPath(), ".next", "standalone", "server.js");
  if (!existsSync(serverPath)) throw new Error("未找到应用服务。请先执行 npm run desktop:build，或使用 npm run desktop:dev:fast。");
  const networkHookPath = path.join(__dirname, "network-fetch.cjs");
  if (!existsSync(networkHookPath)) throw new Error("未找到桌面网络组件。请重新安装或重新打包应用。");
  serverProcess = utilityProcess.fork(serverPath, [], {
    env: { ...process.env, PORT: String(serverPort), HOSTNAME: "127.0.0.1", MOCK_INTERVIEW_HOME: userHome(), MOCK_INTERVIEW_SYNC_PASSWORD: cloudSyncPassword(), MOCK_INTERVIEW_SUPABASE_SESSION: supabaseSession(), NODE_ENV: "production" },
    execArgv: ["--require", networkHookPath],
    session: session.defaultSession,
    stdio: ["ignore", "ignore", "pipe"],
    serviceName: "Study Desk Server",
  });
  serverProcess.stderr?.on("data", (message) => console.error(`[next] ${message}`));
  serverProcess.once("exit", (code, signal) => {
    if (isQuitting) return;
    console.error(`[next] local server exited unexpectedly (code: ${code ?? "none"}, signal: ${signal ?? "none"}).`);
    void restartServer();
  });
  await waitForServer(serverPort);
  // Ask the local service to install the user-selected cloud-sync schedule as
  // soon as the desktop application launches. Failure is non-fatal and will be
  // surfaced in the Settings page on the next manual check.
  const syncRequest = http.get(`http://127.0.0.1:${serverPort}/api/cloud-sync`, (response) => response.resume());
  syncRequest.once("error", () => {});
  syncRequest.setTimeout(3_000, () => syncRequest.destroy());
}

async function restartServer() {
  if (isRestartingServer || isQuitting) return;
  isRestartingServer = true;
  const port = serverPort;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:server-error", "本地服务已中断，正在自动恢复。");
  try {
    // Keep the original port so the loaded page, its draft, and its relative API
    // requests remain valid after recovery.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await startServer(port);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:server-recovered");
  } catch (error) {
    console.error("[next] failed to restart local server", error);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:server-error", "本地服务恢复失败，请重启应用后再试。");
  } finally {
    isRestartingServer = false;
  }
}

async function ensureServerAfterWake() {
  if (isQuitting || isRestartingServer || await isServerAvailable(serverPort)) return;
  console.error("[next] local server is unavailable after wake; restarting it.");
  serverProcess?.kill();
  await restartServer();
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
    title: "Study Desk",
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
ipcMain.handle("network:diagnostics", () => desktopNetworkDiagnostics());
ipcMain.handle("cloud-sync:credential-status", () => ({ configured: Boolean(cloudSyncPassword()), secureStorageAvailable: safeStorage.isEncryptionAvailable() }));
ipcMain.handle("cloud-sync:save-credential", async (_event, password) => {
  const configured = saveCloudSyncPassword(typeof password === "string" ? password : "");
  // The Next service is a separate process. Restarting it is the only point at
  // which the decrypted password crosses into its private process environment.
  if (serverProcess) {
    isRestartingServer = true;
    await new Promise((resolve) => serverProcess.once("exit", resolve) && serverProcess.kill());
    isRestartingServer = false;
    await startServer(serverPort);
    mainWindow?.webContents.send("desktop:server-recovered");
  }
  return { configured, secureStorageAvailable: safeStorage.isEncryptionAvailable() };
});
ipcMain.handle("supabase-sync:session-status", () => ({ configured: Boolean(supabaseSession()), secureStorageAvailable: safeStorage.isEncryptionAvailable() }));
ipcMain.handle("supabase-sync:save-session", async (_event, value) => {
  const configured = saveSecureValue(supabaseSessionPath(), typeof value === "string" ? value : "", " Supabase 会话");
  if (serverProcess) {
    isRestartingServer = true;
    await new Promise((resolve) => serverProcess.once("exit", resolve) && serverProcess.kill());
    isRestartingServer = false;
    await startServer(serverPort);
    mainWindow?.webContents.send("desktop:server-recovered");
  }
  return { configured, secureStorageAvailable: safeStorage.isEncryptionAvailable() };
});
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
      url: typeof release.html_url === "string" ? release.html_url : releasesUrl,
      releaseNotes: typeof release.body === "string" && release.body.trim() ? release.body.trim() : "此版本暂未提供更新说明。",
    };
  } catch (error) {
    return { state: "error", currentVersion, message: error instanceof Error ? error.message : "检查更新失败，请直接前往 Releases 下载。", url: releasesUrl };
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
app.on("before-quit", () => { isQuitting = true; serverProcess?.kill(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0 && serverPort) createWindow(); });
powerMonitor.on("resume", () => { void ensureServerAfterWake(); });
