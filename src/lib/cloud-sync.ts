import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createBackup, parseBackup, previewBackup, restoreBackup, type AppBackup } from "@/lib/backup";
import { sqlite } from "@/lib/db";

export type CloudSyncConfig = { enabled: boolean; mode: "automatic" | "manual"; intervalMinutes: 15 | 30 | 60 | 180 | 360 | 720 | 1440; url: string; directory: string; username: string; maxStorageMb: number; overflowPolicy: "delete-oldest" | "pause" };
export type CloudSyncStatus = { available: boolean; passwordConfigured: boolean; lastSyncedAt: string | null; pausedReason: string | null; lastError: string | null; remoteBytes: number; remoteCount: number; lastSummary: string | null };
type RemoteEntry = { id: string; name: string; size: number; createdAt: string };
type Manifest = { version: 1; latest: RemoteEntry | null; snapshots: RemoteEntry[] };

const defaults: CloudSyncConfig = { enabled: true, mode: "automatic", intervalMinutes: 60, url: "", directory: "study-desk", username: "", maxStorageMb: 100, overflowPolicy: "delete-oldest" };
const setting = (key: string) => (sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined)?.value;
const save = (key: string, value: string) => sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
const bool = (value: string | undefined, fallback: boolean) => value === undefined ? fallback : value !== "false";
const number = (value: string | undefined, allowed: number[], fallback: number) => allowed.includes(Number(value)) ? Number(value) : fallback;

export function isCloudSyncAvailable() { return Boolean(process.env.MOCK_INTERVIEW_HOME && process.env.MOCK_INTERVIEW_SYNC_PASSWORD); }
export function getCloudSyncConfig(): CloudSyncConfig { return { enabled: bool(setting("cloudSyncEnabled"), defaults.enabled), mode: setting("cloudSyncMode") === "manual" ? "manual" : "automatic", intervalMinutes: number(setting("cloudSyncIntervalMinutes"), [15, 30, 60, 180, 360, 720, 1440], 60) as CloudSyncConfig["intervalMinutes"], url: setting("cloudSyncUrl") ?? "", directory: setting("cloudSyncDirectory") ?? defaults.directory, username: setting("cloudSyncUsername") ?? "", maxStorageMb: number(setting("cloudSyncMaxStorageMb"), Array.from({ length: 10240 }, (_, i) => i + 1), 100), overflowPolicy: setting("cloudSyncOverflowPolicy") === "pause" ? "pause" : "delete-oldest" }; }
export function saveCloudSyncConfig(input: CloudSyncConfig) { for (const [key, value] of Object.entries({ cloudSyncEnabled: String(input.enabled), cloudSyncMode: input.mode, cloudSyncIntervalMinutes: String(input.intervalMinutes), cloudSyncUrl: input.url.replace(/\/+$/, ""), cloudSyncDirectory: input.directory.replace(/^\/+|\/+$/g, "") || defaults.directory, cloudSyncUsername: input.username, cloudSyncMaxStorageMb: String(input.maxStorageMb), cloudSyncOverflowPolicy: input.overflowPolicy })) save(key, value); if (input.enabled) save("supabaseSyncEnabled", "false"); save("cloudSyncPausedReason", ""); return getCloudSyncConfig(); }
export function getCloudSyncStatus(): CloudSyncStatus { return { available: Boolean(process.env.MOCK_INTERVIEW_HOME), passwordConfigured: Boolean(process.env.MOCK_INTERVIEW_SYNC_PASSWORD), lastSyncedAt: setting("cloudSyncLastSyncedAt") ?? null, pausedReason: setting("cloudSyncPausedReason") || null, lastError: setting("cloudSyncLastError") || null, remoteBytes: Number(setting("cloudSyncRemoteBytes")) || 0, remoteCount: Number(setting("cloudSyncRemoteCount")) || 0, lastSummary: setting("cloudSyncLastSummary") || null }; }

function encode(path: string) { return path.split("/").map(encodeURIComponent).join("/"); }
function endpoint(config: CloudSyncConfig, name = "") { return `${config.url}/${encode(config.directory)}${name ? `/${encode(name)}` : "/"}`; }
function auth(config: CloudSyncConfig) { return `Basic ${Buffer.from(`${config.username}:${process.env.MOCK_INTERVIEW_SYNC_PASSWORD ?? ""}`).toString("base64")}`; }
async function request(config: CloudSyncConfig, name: string, init: RequestInit = {}) { const response = await fetch(endpoint(config, name), { ...init, headers: { Authorization: auth(config), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) }); return response; }
async function ensureDirectory(config: CloudSyncConfig) { const root = await request(config, "", { method: "MKCOL" }); if (![201, 204, 405].includes(root.status)) throw new Error(`WebDAV 目录不可用（HTTP ${root.status}）。`); }
async function manifest(config: CloudSyncConfig): Promise<{ data: Manifest; etag: string | null }> { const response = await request(config, "manifest.json"); if (response.status === 404) return { data: { version: 1, latest: null, snapshots: [] }, etag: null }; if (!response.ok) throw new Error(`无法读取远端清单（HTTP ${response.status}）。`); return { data: JSON.parse(await response.text()) as Manifest, etag: response.headers.get("etag") }; }
async function saveManifest(config: CloudSyncConfig, data: Manifest, etag: string | null) { const response = await request(config, "manifest.json", { method: "PUT", headers: { "Content-Type": "application/json", ...(etag ? { "If-Match": etag } : { "If-None-Match": "*" }) }, body: JSON.stringify(data) }); if (response.status === 412) throw new Error("REMOTE_CHANGED"); if (!response.ok) throw new Error(`无法更新远端清单（HTTP ${response.status}）。`); }
async function upload(config: CloudSyncConfig, backup: AppBackup, existing: Manifest, etag: string | null) {
  const payload = JSON.stringify(backup); const now = new Date().toISOString(); const entry: RemoteEntry = { id: randomUUID(), name: `snapshot-${now.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`, size: Buffer.byteLength(payload), createdAt: now };
  const maxBytes = config.maxStorageMb * 1024 * 1024; const snapshots = [...existing.snapshots, entry];
  if (snapshots.reduce((sum, item) => sum + item.size, 0) > maxBytes && config.overflowPolicy === "pause") { save("cloudSyncPausedReason", "云端同步已暂停：远端空间达到上限。"); throw new Error("云端空间达到上限。"); }
  const removed: RemoteEntry[] = [];
  while (snapshots.length > 1 && snapshots.reduce((sum, item) => sum + item.size, 0) > maxBytes) removed.push(snapshots.shift()!);
  if (entry.size > maxBytes) throw new Error("当前备份超过云端最大空间。");
  const write = await request(config, entry.name, { method: "PUT", headers: { "Content-Type": "application/json", "If-None-Match": "*" }, body: payload }); if (!write.ok) throw new Error(`无法上传快照（HTTP ${write.status}）。`);
  try { await saveManifest(config, { version: 1, latest: entry, snapshots }, etag); }
  catch (error) { await request(config, entry.name, { method: "DELETE" }); throw error; }
  for (const old of removed) { const response = await request(config, old.name, { method: "DELETE" }); if (!response.ok && response.status !== 404) throw new Error(`无法清理旧快照（HTTP ${response.status}）。`); }
  return { manifest: { version: 1, latest: entry, snapshots } as Manifest, uploaded: entry };
}

let timer: ReturnType<typeof setInterval> | null = null; let running = false;
export function ensureCloudSyncSchedule() { if (timer) { clearInterval(timer); timer = null; } const config = getCloudSyncConfig(); if (!isCloudSyncAvailable() || !config.enabled || config.mode !== "automatic") return; timer = setInterval(() => void syncCloud(), config.intervalMinutes * 60_000); setTimeout(() => void syncCloud(), 1_000); }
export async function testCloudSync(config = getCloudSyncConfig()) { if (!process.env.MOCK_INTERVIEW_SYNC_PASSWORD) throw new Error("请先在桌面应用中保存 WebDAV 密码。"); if (!/^https?:\/\//.test(config.url)) throw new Error("请输入有效的 WebDAV 地址。"); await ensureDirectory(config); const current = await manifest(config); return { ok: true, remoteCount: current.data.snapshots.length }; }
export async function syncCloud(): Promise<{ summary: string; preview?: ReturnType<typeof previewBackup> }> { if (running) return { summary: "同步已在进行中。" }; const config = getCloudSyncConfig(); if (!config.enabled) return { summary: "云端同步未启用。" }; if (!process.env.MOCK_INTERVIEW_SYNC_PASSWORD) throw new Error("尚未保存 WebDAV 密码。"); if (setting("cloudSyncPausedReason")) return { summary: setting("cloudSyncPausedReason")! }; running = true;
  try { await ensureDirectory(config); for (let attempt = 0; attempt < 2; attempt += 1) { const remote = await manifest(config); let preview: ReturnType<typeof previewBackup> | undefined; if (remote.data.latest) { const response = await request(config, remote.data.latest.name); if (!response.ok) throw new Error(`无法下载远端快照（HTTP ${response.status}）。`); const before = createBackup(); const incoming = parseBackup(JSON.parse(await response.text())); preview = previewBackup(incoming); restoreBackup(incoming, "merge"); const changed = createHash("sha256").update(JSON.stringify(before)).digest("hex") !== createHash("sha256").update(JSON.stringify(createBackup())).digest("hex"); if (!changed && setting("cloudSyncLastRemoteId") === remote.data.latest.id) { save("cloudSyncLastSyncedAt", new Date().toISOString()); return { summary: "已确认云端与本机一致。", preview }; } }
      try { const result = await upload(config, createBackup(), remote.data, remote.etag); save("cloudSyncLastRemoteId", result.uploaded.id); save("cloudSyncLastSyncedAt", new Date().toISOString()); save("cloudSyncLastError", ""); save("cloudSyncLastSummary", remote.data.latest ? `已自动合并并上传：${preview?.cardConflicts ?? 0} 个卡片冲突。` : "已上传首份云端快照。"); save("cloudSyncRemoteBytes", String(result.manifest.snapshots.reduce((sum, item) => sum + item.size, 0))); save("cloudSyncRemoteCount", String(result.manifest.snapshots.length)); return { summary: setting("cloudSyncLastSummary")!, preview }; } catch (error) { if (error instanceof Error && error.message === "REMOTE_CHANGED" && attempt === 0) continue; throw error; }
    } throw new Error("远端清单持续变化，请稍后重试。");
  } catch (error) { const message = error instanceof Error ? error.message : "云端同步失败。"; save("cloudSyncLastError", message); throw error; } finally { running = false; }
}
