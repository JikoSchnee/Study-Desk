import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createBackup, parseBackup, previewBackup, restoreBackup } from "@/lib/backup";
import { sqlite } from "@/lib/db";

type Session = { access_token: string; refresh_token: string; user: { email?: string | null } };
export type SupabaseSyncStatus = { configured: boolean; enabled: boolean; signedIn: boolean; email: string | null; lastSyncedAt: string | null; lastError: string | null; summary: string | null; pendingChoice: boolean };

const setting = (key: string) => (sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined)?.value;
const save = (key: string, value: string) => sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
const config = () => ({ url: setting("supabaseSyncUrl") ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", key: setting("supabaseSyncAnonKey") ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" });
const configured = () => Boolean(config().url && config().key);
function savedSession(): Session | null { try { return process.env.MOCK_INTERVIEW_SUPABASE_SESSION ? JSON.parse(process.env.MOCK_INTERVIEW_SUPABASE_SESSION) as Session : null; } catch { return null; } }
function client(token?: string) { const c = config(); if (!c.url || !c.key) throw new Error("尚未配置 Supabase。请设置 SUPABASE_URL 与 SUPABASE_ANON_KEY。"); return createClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false }, global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined }); }
function sessionFrom(value?: string) { if (value) { try { return JSON.parse(value) as Session; } catch { throw new Error("Supabase 登录会话无效，请重新登录。"); } } return savedSession(); }

export function getSupabaseSyncStatus(): SupabaseSyncStatus {
  const session = savedSession();
  return { configured: configured(), enabled: setting("supabaseSyncEnabled") === "true", signedIn: Boolean(session?.access_token), email: session?.user?.email ?? setting("supabaseSyncEmail") ?? null, lastSyncedAt: setting("supabaseSyncLastSyncedAt") ?? null, lastError: setting("supabaseSyncLastError") || null, summary: setting("supabaseSyncLastSummary") || null, pendingChoice: setting("supabaseSyncPendingChoice") === "true" };
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
export function setSupabaseEnabled(enabled: boolean) { save("supabaseSyncEnabled", String(enabled)); if (enabled) save("cloudSyncEnabled", "false"); return getSupabaseSyncStatus(); }
export async function requestEmailCode(email: string) { const { error } = await client().auth.signInWithOtp({ email, options: { shouldCreateUser: true } }); if (error) throw new Error(error.message); return { ok: true }; }
export async function verifyEmailCode(email: string, token: string) { const { data, error } = await client().auth.verifyOtp({ email, token, type: "email" }); if (error || !data.session) throw new Error(error?.message ?? "验证码无效或已过期。"); save("supabaseSyncEmail", data.session.user.email ?? email); return data.session as Session; }
export async function remotePreview(sessionValue?: string) {
  const session = sessionFrom(sessionValue); if (!session?.access_token) throw new Error("请先登录 Supabase。");
  const { data, error } = await client(session.access_token).from("study_desk_sync_documents").select("version, backup, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  return { local: previewBackup(createBackup()), remote: data ? { version: data.version as number, updatedAt: data.updated_at as string, preview: previewBackup(parseBackup(data.backup)) } : null };
}
export async function syncSupabase(choice: "merge" | "remote" | "local" = "merge", sessionValue?: string) {
  const session = sessionFrom(sessionValue); if (!session?.access_token) throw new Error("请先登录 Supabase。");
  if (!getSupabaseSyncStatus().enabled) throw new Error("Supabase 同步未启用。");
  const api = client(session.access_token); const { data, error } = await api.from("study_desk_sync_documents").select("version, backup, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  if (data && choice !== "local") {
    const incoming = parseBackup(data.backup);
    if (choice === "remote") restoreBackup(incoming, "replace"); else restoreBackup(incoming, "merge");
  }
  const next = createBackup(); const expectedVersion = data?.version ?? 0;
  const { data: written, error: writeError } = await api.rpc("replace_study_desk_sync_document", { expected_version: expectedVersion, next_backup: next });
  if (writeError) { if (writeError.message.includes("SYNC_VERSION_CONFLICT")) { save("supabaseSyncPendingChoice", "true"); throw new Error("云端数据刚刚被另一台设备更新，请先重新预览并处理冲突。"); } throw new Error(writeError.message); }
  save("supabaseSyncPendingChoice", "false"); save("supabaseSyncLastSyncedAt", new Date().toISOString()); save("supabaseSyncLastError", ""); save("supabaseSyncLastSummary", data ? `已${choice === "remote" ? "采用云端数据" : choice === "local" ? "上传本机数据" : "合并"}并同步完整学习数据。` : "已上传首份 Supabase 云端数据。");
  return { summary: setting("supabaseSyncLastSummary")!, version: written as number | null };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function ensureSupabaseSyncSchedule() {
  if (timer) { clearInterval(timer); timer = null; }
  const status = getSupabaseSyncStatus();
  if (!status.enabled || !status.signedIn || !status.configured) return;
  timer = setInterval(() => void syncSupabase().catch((error) => save("supabaseSyncLastError", error instanceof Error ? error.message : "Supabase 自动同步失败。")), 60 * 60_000);
  setTimeout(() => void syncSupabase().catch((error) => save("supabaseSyncLastError", error instanceof Error ? error.message : "Supabase 自动同步失败。")), 1_000);
}
