import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createBackup, parseBackup, previewBackup, restoreBackup } from "@/lib/backup";
import { sqlite } from "@/lib/db";
import { ensureCloudSyncSchedule, getCloudSyncConfig } from "@/lib/cloud-sync";
import { followingSyncAt, scheduledSyncAt, syncDelay } from "@/lib/sync-schedule";

type Session = { access_token: string; refresh_token: string; user: { email?: string | null } };
export type SupabaseSyncStatus = { configured: boolean; enabled: boolean; signedIn: boolean; email: string | null; lastSyncedAt: string | null; nextSyncAt: string | null; lastError: string | null; summary: string | null; pendingChoice: boolean };
export type SupabaseHistoryRecord = { id: string; version: number; createdAt: string; preview: ReturnType<typeof previewBackup> };
export type SupabaseHistoryDiff = { record: SupabaseHistoryRecord; local: ReturnType<typeof previewBackup>; tables: Array<{ name: string; local: number; history: number; delta: number }> };

const setting = (key: string) => (sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined)?.value;
const save = (key: string, value: string) => sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
const config = () => ({ url: setting("supabaseSyncUrl") ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", key: setting("supabaseSyncAnonKey") ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" });
const configured = () => Boolean(config().url && config().key);
function savedSession(): Session | null { try { return process.env.MOCK_INTERVIEW_SUPABASE_SESSION ? JSON.parse(process.env.MOCK_INTERVIEW_SUPABASE_SESSION) as Session : null; } catch { return null; } }
function client(token?: string) { const c = config(); if (!c.url || !c.key) throw new Error("尚未配置 Supabase。请设置 SUPABASE_URL 与 SUPABASE_ANON_KEY。"); return createClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false }, global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined }); }
function sessionFrom(value?: string) { if (value) { try { return JSON.parse(value) as Session; } catch { throw new Error("Supabase 登录会话无效，请重新登录。"); } } return savedSession(); }
function accessTokenExpiresSoon(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
    return !payload.exp || payload.exp * 1_000 <= Date.now() + 60_000;
  } catch { return true; }
}
function notifyDesktopSession(message: { type: "supabase-sync:session-refreshed"; session: Session } | { type: "supabase-sync:session-expired" }) {
  const parentPort = (process as NodeJS.Process & { parentPort?: { postMessage(message: unknown): void } }).parentPort;
  parentPort?.postMessage(message);
}
export function friendlySupabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/jwt\s*(expired|malformed|invalid)|invalid jwt|refresh token|session.*(expired|not found)|token.*expired/i.test(message)) return "登录已失效，请重新登录。";
  return message || "Supabase 同步失败。";
}
async function refreshSession(session: Session) {
  if (!session.refresh_token) throw new Error("登录已失效，请重新登录。");
  const { data, error } = await client().auth.refreshSession({ refresh_token: session.refresh_token });
  if (error || !data.session?.access_token || !data.session.refresh_token) {
    process.env.MOCK_INTERVIEW_SUPABASE_SESSION = "";
    notifyDesktopSession({ type: "supabase-sync:session-expired" });
    throw new Error("登录已失效，请重新登录。");
  }
  const renewed: Session = { access_token: data.session.access_token, refresh_token: data.session.refresh_token, user: { email: data.session.user?.email ?? session.user?.email ?? null } };
  process.env.MOCK_INTERVIEW_SUPABASE_SESSION = JSON.stringify(renewed);
  notifyDesktopSession({ type: "supabase-sync:session-refreshed", session: renewed });
  return renewed;
}
async function requireSession(value?: string) {
  const session = sessionFrom(value);
  if (!session?.access_token) throw new Error("请先登录 Supabase。");
  // A renderer-provided legacy session is used only for that request. The
  // persisted desktop session is renewed in-process and handed directly to
  // Electron's main process, never to the renderer.
  if (value || !accessTokenExpiresSoon(session.access_token)) return session;
  try { return await refreshSession(session); } catch (error) { throw new Error(friendlySupabaseError(error)); }
}
function historyPreview(row: { id: string; version: number; created_at: string; backup: unknown }): SupabaseHistoryRecord { return { id: row.id, version: Number(row.version), createdAt: row.created_at, preview: previewBackup(parseBackup(row.backup)) }; }
async function pruneHistory(api: ReturnType<typeof client>) { const { data, error } = await api.from("study_desk_sync_history").select("id").order("created_at", { ascending: false }).range(getCloudSyncConfig().historyLimit, 1000); if (error) throw new Error(error.message); if (data?.length) { const { error: pruneError } = await api.from("study_desk_sync_history").delete().in("id", data.map((item) => item.id as string)); if (pruneError) throw new Error(pruneError.message); } }
async function writeBackup(api: ReturnType<typeof client>, expectedVersion: number, backup: ReturnType<typeof createBackup>) { const { data, error } = await api.rpc("replace_study_desk_sync_document", { expected_version: expectedVersion, next_backup: backup }); if (error) { if (error.message.includes("SYNC_VERSION_CONFLICT")) throw new Error("云端数据刚刚被另一台设备更新，请刷新同步记录后重试。"); throw new Error(error.message); } return Number(data); }

export function getSupabaseSyncStatus(): SupabaseSyncStatus {
  const session = savedSession();
  return { configured: configured(), enabled: setting("supabaseSyncEnabled") === "true", signedIn: Boolean(session?.access_token), email: session?.user?.email ?? setting("supabaseSyncEmail") ?? null, lastSyncedAt: setting("supabaseSyncLastSyncedAt") ?? null, nextSyncAt: setting("supabaseSyncNextSyncAt") || null, lastError: setting("supabaseSyncLastError") || null, summary: setting("supabaseSyncLastSummary") || null, pendingChoice: setting("supabaseSyncPendingChoice") === "true" };
}
export function saveSupabaseProjectConfig(url: string, key: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("请输入有效的 Supabase 项目地址。"); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) throw new Error("Supabase 项目地址必须使用 HTTPS（本地开发地址除外）。");
  if (!key.trim()) throw new Error("请输入 Supabase anon key。");
  save("supabaseSyncUrl", parsed.toString().replace(/\/$/, ""));
  save("supabaseSyncAnonKey", key.trim());
  return getSupabaseSyncStatus();
}
export function setSupabaseEnabled(enabled: boolean) { save("supabaseSyncEnabled", String(enabled)); if (enabled) save("cloudSyncEnabled", "false"); ensureCloudSyncSchedule(); const status = getSupabaseSyncStatus(); ensureSupabaseSyncSchedule(); return status; }
export async function requestMagicLink(email: string) { const { error } = await client().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: "study-desk://auth/callback" } }); if (error) throw new Error(error.message); return { ok: true }; }
export async function remotePreview(sessionValue?: string) {
  const session = await requireSession(sessionValue);
  const { data, error } = await client(session.access_token).from("study_desk_sync_documents").select("version, backup, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  return { local: previewBackup(createBackup()), remote: data ? { version: data.version as number, updatedAt: data.updated_at as string, preview: previewBackup(parseBackup(data.backup)) } : null };
}
export async function listSupabaseHistory(sessionValue?: string) {
  const session = await requireSession(sessionValue);
  const { data, error } = await client(session.access_token).from("study_desk_sync_history").select("id, version, created_at, backup").order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  return { records: (data ?? []).map((row) => historyPreview(row as { id: string; version: number; created_at: string; backup: unknown })) };
}
export async function getSupabaseHistoryDiff(id: string, sessionValue?: string): Promise<SupabaseHistoryDiff> {
  const session = await requireSession(sessionValue);
  const { data, error } = await client(session.access_token).from("study_desk_sync_history").select("id, version, created_at, backup").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("找不到该同步记录，或你无权访问它。");
  const record = historyPreview(data as { id: string; version: number; created_at: string; backup: unknown }); const local = previewBackup(createBackup());
  return { record, local, tables: Object.keys(local.counts).map((name) => ({ name, local: local.counts[name] ?? 0, history: record.preview.counts[name] ?? 0, delta: (record.preview.counts[name] ?? 0) - (local.counts[name] ?? 0) })) };
}
export async function restoreSupabaseHistory(id: string, sessionValue?: string) {
  const session = await requireSession(sessionValue); const api = client(session.access_token);
  const { data: history, error: historyError } = await api.from("study_desk_sync_history").select("id, version, created_at, backup").eq("id", id).maybeSingle();
  if (historyError) throw new Error(historyError.message);
  if (!history) throw new Error("找不到该同步记录，或你无权访问它。");
  const target = parseBackup(history.backup); const safetyBackup = createBackup();
  const { data: current, error: currentError } = await api.from("study_desk_sync_documents").select("version").maybeSingle();
  if (currentError) throw new Error(currentError.message);
  const safetyVersion = await writeBackup(api, Number(current?.version ?? 0), safetyBackup);
  await writeBackup(api, safetyVersion, target);
  restoreBackup(target, "replace");
  await pruneHistory(api);
  save("supabaseSyncPendingChoice", "false"); save("supabaseSyncLastSyncedAt", new Date().toISOString()); save("supabaseSyncLastError", ""); save("supabaseSyncLastSummary", `已恢复 ${new Date(history.created_at as string).toLocaleString()} 的云端历史版本；恢复前的本机数据已保存为历史版本。`); scheduleNextSupabaseSync();
  return { summary: setting("supabaseSyncLastSummary")!, status: getSupabaseSyncStatus() };
}
let syncing = false;
export async function syncSupabase(choice: "merge" | "remote" | "local" = "merge", sessionValue?: string) {
  if (syncing) return { summary: "Supabase 同步已在进行中。", version: null };
  syncing = true;
  try {
  const session = await requireSession(sessionValue);
  if (!getSupabaseSyncStatus().enabled) throw new Error("Supabase 同步未启用。");
  const api = client(session.access_token); const { data, error } = await api.from("study_desk_sync_documents").select("version, backup, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  if (data && choice !== "local") {
    const incoming = parseBackup(data.backup);
    if (choice === "remote") restoreBackup(incoming, "replace"); else restoreBackup(incoming, "merge");
  }
  const next = createBackup(); const expectedVersion = data?.version ?? 0;
  let written: number; try { written = await writeBackup(api, expectedVersion, next); } catch (error) { if (error instanceof Error && error.message.includes("另一台设备")) save("supabaseSyncPendingChoice", "true"); throw error; }
  await pruneHistory(api);
  save("supabaseSyncPendingChoice", "false"); save("supabaseSyncLastSyncedAt", new Date().toISOString()); save("supabaseSyncLastError", ""); save("supabaseSyncLastSummary", data ? `已${choice === "remote" ? "采用云端数据" : choice === "local" ? "上传本机数据" : "合并"}并同步完整学习数据。` : "已上传首份 Supabase 云端数据。");
  return { summary: setting("supabaseSyncLastSummary")!, version: written as number | null };
  } catch (error) {
    const message = friendlySupabaseError(error);
    save("supabaseSyncLastError", message);
    throw new Error(message);
  } finally { syncing = false; scheduleNextSupabaseSync(); }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleNextSupabaseSync() { const preferences = getCloudSyncConfig(); const status = getSupabaseSyncStatus(); if (!status.enabled || !status.signedIn || !status.configured || preferences.mode !== "automatic") return; save("supabaseSyncNextSyncAt", followingSyncAt(preferences.intervalMinutes)); ensureSupabaseSyncSchedule(); }
export function ensureSupabaseSyncSchedule() {
  if (timer) { clearTimeout(timer); timer = null; }
  const status = getSupabaseSyncStatus();
  const preferences = getCloudSyncConfig();
  if (!status.enabled || !status.signedIn || !status.configured || preferences.mode !== "automatic") return;
  const next = scheduledSyncAt({ savedAt: setting("supabaseSyncNextSyncAt"), lastSyncedAt: setting("supabaseSyncLastSyncedAt"), intervalMinutes: preferences.intervalMinutes }); save("supabaseSyncNextSyncAt", next);
  timer = setTimeout(() => void syncSupabase().catch(() => {}), syncDelay(next));
}
