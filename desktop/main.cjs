const { app, BrowserWindow, dialog, ipcMain, net: electronNet, powerMonitor, session, shell, utilityProcess, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } = require("node:fs");
const { randomBytes } = require("node:crypto");
const transferContainer = require("./backup-container.cjs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

let mainWindow;
let serverProcess;
let serverPort;
let isQuitting = false;
let isRestartingServer = false;
let pendingProtocolUrl = null;
let pendingBackupImport = null;
const localIpcToken = process.env.STUDY_DESK_LOCAL_IPC_TOKEN || randomBytes(32).toString("base64url");
const releasesUrl = "https://github.com/JikoSchnee/Study-Desk/releases";
const networkChecks = [
  { id: "network", label: "基础网络", url: "https://www.baidu.com/" },
  { id: "github", label: "GitHub", url: "https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/README.md" },
  { id: "huggingface", label: "Hugging Face", url: "https://huggingface.co/" },
];
const networkTimeoutMs = 8_000;
const updaterSupported = process.platform === "win32" && app.isPackaged;
let updateStatus = null;
let updateCheckPromise = null;

function releaseNotes(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) return value.map((item) => typeof item?.note === "string" ? item.note : "").filter(Boolean).join("\n\n") || "此版本暂未提供更新说明。";
  return "此版本暂未提供更新说明。";
}
function emitUpdateStatus(next) {
  updateStatus = next;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updates:status", next);
  return next;
}
function updaterError(error) {
  return emitUpdateStatus({ state: "error", currentVersion: app.getVersion(), message: `更新失败：${error instanceof Error ? error.message : "未知错误"}`, url: releasesUrl });
}
function configureAutoUpdater() {
  if (!updaterSupported) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("update-available", (info) => emitUpdateStatus({ state: "available", currentVersion: app.getVersion(), latestVersion: info.version, url: releasesUrl, releaseNotes: releaseNotes(info.releaseNotes) }));
  autoUpdater.on("update-not-available", (info) => emitUpdateStatus({ state: "current", currentVersion: app.getVersion(), latestVersion: info.version, url: releasesUrl, releaseNotes: releaseNotes(info.releaseNotes) }));
  autoUpdater.on("download-progress", (progress) => emitUpdateStatus({ state: "downloading", currentVersion: app.getVersion(), latestVersion: updateStatus?.latestVersion ?? "", url: releasesUrl, releaseNotes: updateStatus?.releaseNotes ?? "此版本暂未提供更新说明。", percent: Math.min(100, Math.max(0, progress.percent)) }));
  autoUpdater.on("update-downloaded", (info) => emitUpdateStatus({ state: "downloaded", currentVersion: app.getVersion(), latestVersion: info.version, url: releasesUrl, releaseNotes: releaseNotes(info.releaseNotes) }));
  autoUpdater.on("error", updaterError);
}
async function checkForDesktopUpdate() {
  if (!updaterSupported) return null;
  if (updateCheckPromise) return updateCheckPromise;
  updateCheckPromise = autoUpdater.checkForUpdates().then(() => updateStatus).catch((error) => updaterError(error)).finally(() => { updateCheckPromise = null; });
  return updateCheckPromise;
}

function userHome() { return path.join(app.getPath("userData"), "runtime"); }
function supabaseSessionPath() { return path.join(app.getPath("userData"), "supabase-sync-session.bin"); }
function secureValue(file) {
  try { return existsSync(file) && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(readFileSync(file)) : ""; } catch { return ""; }
}
function saveSecureValue(file, value, label) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error(`系统安全存储不可用，无法保存${label}。`);
  if (!value) { if (existsSync(file)) unlinkSync(file); return false; }
  writeFileSync(file, safeStorage.encryptString(value), { mode: 0o600 }); return true;
}
function supabaseSession() { return secureValue(supabaseSessionPath()); }
function emailFromAccessToken(token) { try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).email ?? null; } catch { return null; } }
function validSupabaseSession(value) { return Boolean(value && typeof value.access_token === "string" && typeof value.refresh_token === "string"); }
function supabaseSessionStatus() {
  const value = supabaseSession();
  try {
    const session = value ? JSON.parse(value) : null;
    return { configured: Boolean(value), signedIn: Boolean(session?.access_token), email: session?.user?.email ?? (session?.access_token ? emailFromAccessToken(session.access_token) : null), secureStorageAvailable: safeStorage.isEncryptionAvailable() };
  } catch { return { configured: false, signedIn: false, email: null, secureStorageAvailable: safeStorage.isEncryptionAvailable() }; }
}
async function acceptSupabaseMagicLink(value) {
  try {
    const callback = new URL(value);
    if (callback.protocol !== "study-desk:" || callback.hostname !== "auth" || callback.pathname !== "/callback") return;
    const params = new URLSearchParams(callback.hash.slice(1));
    const access_token = params.get("access_token"); const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) throw new Error(params.get("error_description") ?? "Magic Link 未返回有效登录会话。");
    saveSecureValue(supabaseSessionPath(), JSON.stringify({ access_token, refresh_token, user: { email: emailFromAccessToken(access_token) } }), " Supabase 会话");
    if (serverProcess) { isRestartingServer = true; await new Promise((resolve) => serverProcess.once("exit", resolve) && serverProcess.kill()); isRestartingServer = false; await startServer(serverPort); }
    if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send("supabase-sync:magic-link", { ok: true, message: "Magic Link 登录成功。" }); }
  } catch (error) { mainWindow?.webContents.send("supabase-sync:magic-link", { ok: false, message: error instanceof Error ? error.message : "Magic Link 登录失败。" }); }
}
async function acceptStudyDeskLink(value) {
  let callback;
  try { callback = new URL(value); } catch { return; }
  if (callback.protocol !== "study-desk:") return;
  if (callback.hostname === "auth" && callback.pathname === "/callback") {
    await acceptSupabaseMagicLink(value);
    return;
  }
  const practice = callback.hostname === "community" ? callback.pathname.match(/^\/practice\/([a-z0-9-]+)$/i) : null;
  if (!practice || !mainWindow || mainWindow.isDestroyed() || !serverPort) return;
  const target = `http://127.0.0.1:${serverPort}/community/practice/${encodeURIComponent(practice[1])}`;
  await mainWindow.loadURL(target);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function registerDeepLinkProtocol() {
  // In development Electron is launched through its binary plus this script,
  // so both are required for macOS to route study-desk:// links back here.
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient("study-desk", process.execPath, [path.resolve(process.argv[1])]);
    return;
  }
  app.setAsDefaultProtocolClient("study-desk");
}
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
    env: { ...process.env, ...transferContainer.keyRing().environment, STUDY_DESK_LOCAL_IPC_TOKEN: localIpcToken, PORT: String(serverPort), HOSTNAME: "127.0.0.1", MOCK_INTERVIEW_HOME: userHome(), MOCK_INTERVIEW_SUPABASE_SESSION: supabaseSession(), NODE_ENV: "production" },
    execArgv: ["--require", networkHookPath],
    session: session.defaultSession,
    stdio: ["ignore", "ignore", "pipe"],
    serviceName: "Study Desk Server",
  });
  serverProcess.stderr?.on("data", (message) => console.error(`[next] ${message}`));
  serverProcess.on("message", (message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "supabase-sync:session-refreshed" && validSupabaseSession(message.session)) {
      try {
        saveSecureValue(supabaseSessionPath(), JSON.stringify(message.session), " Supabase 会话");
        mainWindow?.webContents.send("supabase-sync:session-change", supabaseSessionStatus());
      } catch (error) { console.error("[supabase] failed to securely persist refreshed session", error); }
    }
    if (message.type === "supabase-sync:session-expired") {
      try { saveSecureValue(supabaseSessionPath(), "", " Supabase 会话"); } catch (error) { console.error("[supabase] failed to clear expired session", error); }
      mainWindow?.webContents.send("supabase-sync:session-change", supabaseSessionStatus());
    }
  });
  serverProcess.once("exit", (code, signal) => {
    if (isQuitting) return;
    console.error(`[next] local server exited unexpectedly (code: ${code ?? "none"}, signal: ${signal ?? "none"}).`);
    void restartServer();
  });
  await waitForServer(serverPort);
  // Ask the local service to install the account cloud-sync schedule as
  // soon as the desktop application launches. Failure is non-fatal and will be
  // surfaced in the Settings page on the next manual check.
  const syncRequest = http.request(`http://127.0.0.1:${serverPort}/api/supabase-sync`, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": 21 } }, (response) => response.resume());
  syncRequest.write('{"action":"schedule"}');
  syncRequest.end();
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

async function localBackupApi(pathname, init = {}) {
  if (!serverPort) throw new Error("本地数据服务尚未启动。 ");
  const response = await electronNet.fetch(`http://127.0.0.1:${serverPort}${pathname}`, { ...init, headers: { "X-Study-Desk-IPC": localIpcToken, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
  const body = await response.text();
  let data; try { data = JSON.parse(body); } catch { throw new Error(`本地数据服务返回无效响应（HTTP ${response.status}）。`); }
  if (!response.ok) throw new Error(data.error || `本地数据服务请求失败（HTTP ${response.status}）。`);
  return data;
}

ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:toggle-maximize", () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize(); });
ipcMain.handle("window:close", () => mainWindow?.close());
ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
ipcMain.handle("network:diagnostics", () => desktopNetworkDiagnostics());
ipcMain.handle("backup:export", async () => {
  const backup = await localBackupApi("/api/backup");
  const result = await dialog.showSaveDialog(mainWindow, { title: "导出加密迁移文件", defaultPath: `study-desk-${new Date().toISOString().slice(0, 10)}.studydesk`, filters: [{ name: "Study Desk 加密迁移文件", extensions: ["studydesk"] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  writeFileSync(result.filePath, transferContainer.encrypt(backup), { mode: 0o600 });
  return { canceled: false, fileName: path.basename(result.filePath) };
});
ipcMain.handle("backup:choose-import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "导入 Study Desk 迁移文件", properties: ["openFile"], filters: [{ name: "Study Desk 迁移文件", extensions: ["studydesk", "json"] }] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const raw = readFileSync(result.filePaths[0]);
  const legacyText = raw.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  const legacy = legacyText.startsWith("{");
  let backup;
  if (legacy) { try { backup = JSON.parse(legacyText); } catch { throw new Error("旧版 JSON 备份无效。 "); } }
  else backup = transferContainer.decrypt(raw);
  const preview = await localBackupApi("/api/backup/import", { method: "POST", body: JSON.stringify({ action: "preview", backup }) });
  pendingBackupImport = backup;
  return { canceled: false, legacy, preview: preview.preview };
});
ipcMain.handle("backup:restore", async (_event, mode) => {
  if (!pendingBackupImport) throw new Error("请先选择并验证迁移文件。 ");
  if (mode !== "merge" && mode !== "replace") throw new Error("恢复模式无效。 ");
  const result = await localBackupApi("/api/backup/import", { method: "POST", body: JSON.stringify({ action: "restore", backup: pendingBackupImport, mode }) });
  pendingBackupImport = null;
  return result;
});
ipcMain.handle("backup:show-recovery-points", async () => {
  const directory = path.join(userHome(), "data", "backups");
  mkdirSync(directory, { recursive: true });
  const error = await shell.openPath(directory);
  if (error) throw new Error(`无法打开加密恢复点目录：${error}`);
  return { directory };
});
ipcMain.handle("supabase-sync:session-status", () => supabaseSessionStatus());
ipcMain.handle("supabase-sync:save-session", async (_event, value) => {
  const configured = saveSecureValue(supabaseSessionPath(), typeof value === "string" ? value : "", " Supabase 会话");
  if (serverProcess) {
    isRestartingServer = true;
    await new Promise((resolve) => serverProcess.once("exit", resolve) && serverProcess.kill());
    isRestartingServer = false;
    await startServer(serverPort);
    mainWindow?.webContents.send("desktop:server-recovered");
  }
  const status = supabaseSessionStatus();
  mainWindow?.webContents.send("supabase-sync:session-change", status);
  return { configured, secureStorageAvailable: safeStorage.isEncryptionAvailable() };
});
ipcMain.handle("updates:check", async () => {
  const currentVersion = app.getVersion();
  if (updaterSupported) return await checkForDesktopUpdate();
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
ipcMain.handle("updates:status", () => updateStatus);
ipcMain.handle("updates:download", async () => {
  if (!updaterSupported) throw new Error("应用内更新仅在已安装的 Windows 客户端中可用。");
  if (updateStatus?.state === "downloaded") return updateStatus;
  if (updateStatus?.state !== "available" && updateStatus?.state !== "downloading") throw new Error("请先检查并确认有可用更新。");
  try { await autoUpdater.downloadUpdate(); return updateStatus; } catch (error) { return updaterError(error); }
});
ipcMain.handle("updates:install", () => {
  if (!updaterSupported) throw new Error("应用内更新仅在已安装的 Windows 客户端中可用。");
  if (updateStatus?.state !== "downloaded") throw new Error("更新尚未下载完成。");
  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
});
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

// macOS delivers a custom-protocol launch through this event. Register it
// before Electron becomes ready so links opened during startup are not lost.
app.on("open-url", (event, url) => { event.preventDefault(); if (app.isReady()) void acceptStudyDeskLink(url); else pendingProtocolUrl = url; });

app.on("second-instance", (_event, commandLine) => {
  const callback = commandLine.find((item) => item.startsWith("study-desk://")); if (callback) void acceptStudyDeskLink(callback);
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  configureAutoUpdater();
  registerDeepLinkProtocol();
  try { await startServer(); createWindow(); if (pendingProtocolUrl) { const callback = pendingProtocolUrl; pendingProtocolUrl = null; void acceptStudyDeskLink(callback); } if (updaterSupported) void checkForDesktopUpdate(); }
  catch (error) { console.error(error); app.quit(); }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { isQuitting = true; serverProcess?.kill(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0 && serverPort) createWindow(); });
powerMonitor.on("resume", () => { void ensureServerAfterWake(); });
