import "server-only";
import { createBackup, parseBackup, previewBackup, restoreBackup } from "@/lib/backup";
import { sqlite } from "@/lib/db";
import { followingSyncAt, scheduledSyncAt, syncDelay } from "@/lib/sync-schedule";

type Session = { access_token: string; refresh_token: string; user: { id?: string; email?: string | null } };
export type AuthIdentity = { id: string; provider: string; email: string | null };
export type AuthAccount = { user: { id: string; email: string | null }; identities: AuthIdentity[]; availableProviders: string[] };
type RemoteDocument = { version: number; backup: unknown; updated_at: string };
type RemoteHistory = { id: string; version: number; backup: unknown; created_at: string };
export type SupabaseSyncStatus = { configured: boolean; enabled: boolean; signedIn: boolean; email: string | null; lastSyncedAt: string | null; nextSyncAt: string | null; lastError: string | null; summary: string | null; pendingChoice: boolean };
export type SupabaseHistoryRecord = { id: string; version: number; createdAt: string; preview: ReturnType<typeof previewBackup> };
export type SupabaseHistoryDiff = { record: SupabaseHistoryRecord; local: ReturnType<typeof previewBackup>; tables: Array<{ name: string; local: number; history: number; delta: number }> };
export type AccountMembership = { state: "free" | "trial" | "active" | "grace" | "expired"; trialAvailable: boolean; activeUntil: string | null; graceEndsAt: string | null; cloudDeleteAt: string | null; canReadCloud: boolean; canWriteCloud: boolean; quotaBytes: number; usedBytes: number };
export type MembershipOverview = { membership: AccountMembership; catalog: { monthly: { amountCents: number; days: number }; yearly: { amountCents: number; days: number } }; paddle: { environment: "sandbox" | "production"; clientToken: string | null } };

const setting = (key: string) => (sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined)?.value;
const save = (key: string, value: string) => sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
export function getAccountSyncPreferences() { const interval = Number(setting("accountSyncIntervalMinutes") ?? "60"); const history = Number(setting("accountSyncHistoryLimit") ?? "5"); return { mode: setting("accountSyncMode") === "manual" ? "manual" as const : "automatic" as const, intervalMinutes: ([15, 30, 60, 180, 360, 720, 1440].includes(interval) ? interval : 60) as 15 | 30 | 60 | 180 | 360 | 720 | 1440, historyLimit: Math.min(10, Math.max(1, history || 5)) }; }
const serviceUrl = () => (process.env.STUDY_DESK_SERVICE_URL ?? process.env.NEXT_PUBLIC_STUDY_DESK_SERVICE_URL ?? (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : "")).replace(/\/+$/, "");
// Service configuration is deployment-owned. The client never exposes a
// project selector; a missing URL is reported only when a request is made.
const configured = () => true;
function savedSession(): Session | null { try { return process.env.MOCK_INTERVIEW_SUPABASE_SESSION ? JSON.parse(process.env.MOCK_INTERVIEW_SUPABASE_SESSION) as Session : null; } catch { return null; } }
function sessionFrom(value?: string) { if (value) { try { return JSON.parse(value) as Session; } catch { throw new Error("登录会话无效，请重新登录。"); } } return savedSession(); }
function accessTokenExpiresSoon(token: string) { try { const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number }; return !payload.exp || payload.exp * 1_000 <= Date.now() + 60_000; } catch { return true; } }
function notifyDesktopSession(message: { type: "supabase-sync:session-refreshed"; session: Session } | { type: "supabase-sync:session-expired" }) { const parentPort = (process as NodeJS.Process & { parentPort?: { postMessage(message: unknown): void } }).parentPort; parentPort?.postMessage(message); }

export function friendlySupabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/jwt\s*(expired|malformed|invalid)|invalid jwt|refresh token|登录已失效|session.*(expired|not found)|token.*expired/i.test(message)) return "登录已失效，请重新登录。";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(message)) return "无法连接 Study Desk 云服务，请检查网络后重试。";
  return message || "账号云同步失败。";
}

async function serviceRequest<T>(path: string, init: RequestInit = {}, session?: Session): Promise<T> {
  const base = serviceUrl();
  if (!base) throw new Error("当前版本尚未配置 Study Desk 服务地址。");
  const response = await fetch(`${base}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(init.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  let data: T & { error?: string };
  try { data = JSON.parse(body) as T & { error?: string }; } catch { throw new Error(`Study Desk 云服务返回无效响应（HTTP ${response.status}）。`); }
  if (!response.ok) throw new Error(data.error || `Study Desk 云服务请求失败（HTTP ${response.status}）。`);
  return data;
}

async function refreshSession(session: Session) {
  if (!session.refresh_token) throw new Error("登录已失效，请重新登录。");
  try {
    const data = await serviceRequest<{ session: Session }>("/api/service/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: session.refresh_token }) });
    if (!data.session?.access_token || !data.session.refresh_token) throw new Error("登录已失效，请重新登录。");
    process.env.MOCK_INTERVIEW_SUPABASE_SESSION = JSON.stringify(data.session);
    notifyDesktopSession({ type: "supabase-sync:session-refreshed", session: data.session });
    return data.session;
  } catch {
    process.env.MOCK_INTERVIEW_SUPABASE_SESSION = "";
    notifyDesktopSession({ type: "supabase-sync:session-expired" });
    throw new Error("登录已失效，请重新登录。");
  }
}

async function requireSession(value?: string) {
  const session = sessionFrom(value);
  if (!session?.access_token) throw new Error("请先登录 Study Desk 账号。");
  if (value || !accessTokenExpiresSoon(session.access_token)) return session;
  return refreshSession(session);
}

function historyPreview(row: RemoteHistory): SupabaseHistoryRecord { return { id: row.id, version: Number(row.version), createdAt: row.created_at, preview: previewBackup(parseBackup(row.backup)) }; }
async function remoteDocument(session: Session) { return (await serviceRequest<{ document: RemoteDocument | null }>("/api/service/sync?resource=document", {}, session)).document; }
async function writeBackup(session: Session, expectedVersion: number, backup: ReturnType<typeof createBackup>) { const data = await serviceRequest<{ version: number }>("/api/service/sync", { method: "POST", body: JSON.stringify({ action: "replace", expectedVersion, backup, historyLimit: getAccountSyncPreferences().historyLimit }) }, session); return Number(data.version); }

export function getSupabaseSyncStatus(): SupabaseSyncStatus {
  const session = savedSession();
  const enabledSetting = setting("supabaseSyncEnabled");
  return { configured: configured(), enabled: enabledSetting !== "false", signedIn: Boolean(session?.access_token), email: session?.user?.email ?? setting("supabaseSyncEmail") ?? null, lastSyncedAt: setting("supabaseSyncLastSyncedAt") ?? null, nextSyncAt: setting("supabaseSyncNextSyncAt") || null, lastError: setting("supabaseSyncLastError") || null, summary: setting("supabaseSyncLastSummary") || null, pendingChoice: setting("supabaseSyncPendingChoice") === "true" };
}

export function setSupabaseEnabled(enabled: boolean) { save("supabaseSyncEnabled", String(enabled)); const status = getSupabaseSyncStatus(); ensureSupabaseSyncSchedule(); return status; }
export async function requestMagicLink(email: string) { return serviceRequest<{ ok: true }>("/api/service/auth/magic-link", { method: "POST", body: JSON.stringify({ email }) }); }
export async function startGoogleOAuth(intent: "sign-in" | "link", sessionValue?: string) {
  const session = intent === "link" ? await requireSession(sessionValue) : undefined;
  return serviceRequest<{ authorizationUrl: string }>("/api/service/auth/oauth/start", { method: "POST", body: JSON.stringify({ provider: "google", intent }) }, session);
}
export async function completeOAuthHandoff(handoffToken: string) {
  return serviceRequest<{ session: Session; intent: "sign-in" | "link" }>("/api/service/auth/oauth/complete", { method: "POST", body: JSON.stringify({ handoffToken }) });
}
export async function getAuthAccount(sessionValue?: string) { return serviceRequest<AuthAccount>("/api/service/auth/account", {}, await requireSession(sessionValue)); }
export async function unlinkAuthIdentity(identityId: string, sessionValue?: string) { return serviceRequest<{ ok: true }>(`/api/service/auth/identities/${encodeURIComponent(identityId)}`, { method: "DELETE" }, await requireSession(sessionValue)); }
export async function logoutAccount(sessionValue?: string) {
  const session = sessionFrom(sessionValue);
  try { if (session?.access_token) await serviceRequest<{ ok: true }>("/api/service/auth/logout", { method: "POST", body: "{}" }, session); }
  finally { process.env.MOCK_INTERVIEW_SUPABASE_SESSION = ""; notifyDesktopSession({ type: "supabase-sync:session-expired" }); }
  return { ok: true as const };
}
export async function getMembershipOverview(sessionValue?: string) { return serviceRequest<MembershipOverview>("/api/service/membership", {}, await requireSession(sessionValue)); }
export async function startMembershipTrial(sessionValue?: string) { return serviceRequest<{ membership: AccountMembership }>("/api/service/membership/trial", { method: "POST", body: "{}" }, await requireSession(sessionValue)); }
export async function createMembershipCheckout(plan: "monthly" | "yearly", sessionValue?: string) { return serviceRequest<{ transactionId: string; checkoutUrl: string | null; environment: "sandbox" | "production"; clientToken: string | null }>("/api/service/membership/checkout", { method: "POST", body: JSON.stringify({ plan }) }, await requireSession(sessionValue)); }

export async function remotePreview(sessionValue?: string) {
  const session = await requireSession(sessionValue); const data = await remoteDocument(session);
  return { local: previewBackup(createBackup()), remote: data ? { version: Number(data.version), updatedAt: data.updated_at, preview: previewBackup(parseBackup(data.backup)) } : null };
}

export async function listSupabaseHistory(sessionValue?: string) {
  const session = await requireSession(sessionValue);
  const data = await serviceRequest<{ records: RemoteHistory[] }>("/api/service/sync?resource=history", {}, session);
  return { records: data.records.map(historyPreview) };
}

export async function getSupabaseHistoryDiff(id: string, sessionValue?: string): Promise<SupabaseHistoryDiff> {
  const session = await requireSession(sessionValue);
  const data = await serviceRequest<{ record: RemoteHistory }>(`/api/service/sync?resource=history-item&id=${encodeURIComponent(id)}`, {}, session);
  const record = historyPreview(data.record); const local = previewBackup(createBackup());
  return { record, local, tables: Object.keys(local.counts).map((name) => ({ name, local: local.counts[name] ?? 0, history: record.preview.counts[name] ?? 0, delta: (record.preview.counts[name] ?? 0) - (local.counts[name] ?? 0) })) };
}

export async function restoreSupabaseHistory(id: string, sessionValue?: string) {
  const session = await requireSession(sessionValue);
  const [{ record: history }, current] = await Promise.all([serviceRequest<{ record: RemoteHistory }>(`/api/service/sync?resource=history-item&id=${encodeURIComponent(id)}`, {}, session), remoteDocument(session)]);
  const target = parseBackup(history.backup); const safetyBackup = createBackup();
  const safetyVersion = await writeBackup(session, Number(current?.version ?? 0), safetyBackup);
  await writeBackup(session, safetyVersion, target); restoreBackup(target, "replace");
  save("supabaseSyncPendingChoice", "false"); save("supabaseSyncLastSyncedAt", new Date().toISOString()); save("supabaseSyncLastError", ""); save("supabaseSyncLastSummary", `已恢复 ${new Date(history.created_at).toLocaleString()} 的云端历史版本；恢复前的本机数据已保存为历史版本。`); scheduleNextSupabaseSync();
  return { summary: setting("supabaseSyncLastSummary")!, status: getSupabaseSyncStatus() };
}

let syncing = false;
export async function syncSupabase(choice: "merge" | "remote" | "local" = "merge", sessionValue?: string) {
  if (syncing) return { summary: "账号云同步已在进行中。", version: null };
  syncing = true;
  try {
    const session = await requireSession(sessionValue);
    if (!getSupabaseSyncStatus().enabled) throw new Error("账号云同步未启用。");
    const data = await remoteDocument(session);
    if (data && choice !== "local") { const incoming = parseBackup(data.backup); restoreBackup(incoming, choice === "remote" ? "replace" : "merge"); }
    let written: number;
    try { written = await writeBackup(session, Number(data?.version ?? 0), createBackup()); }
    catch (error) { if (error instanceof Error && error.message.includes("另一台设备")) save("supabaseSyncPendingChoice", "true"); throw error; }
    save("supabaseSyncPendingChoice", "false"); save("supabaseSyncLastSyncedAt", new Date().toISOString()); save("supabaseSyncLastError", ""); save("supabaseSyncLastSummary", data ? `已${choice === "remote" ? "采用云端数据" : choice === "local" ? "上传本机数据" : "合并"}并同步完整学习数据。` : "已上传首份账号云端数据。");
    return { summary: setting("supabaseSyncLastSummary")!, version: written as number | null };
  } catch (error) { const message = friendlySupabaseError(error); save("supabaseSyncLastError", message); throw new Error(message); }
  finally { syncing = false; scheduleNextSupabaseSync(); }
}

export async function pullSupabase(sessionValue?: string) {
  const session = await requireSession(sessionValue);
  const data = await remoteDocument(session);
  if (!data) throw new Error("云端还没有可下载的同步数据。 ");
  restoreBackup(parseBackup(data.backup), "merge");
  const summary = "已在只读模式下拉取并合并云端学习数据；本次没有上传任何内容。";
  save("supabaseSyncLastSyncedAt", new Date().toISOString());
  save("supabaseSyncLastError", "");
  save("supabaseSyncLastSummary", summary);
  return { summary, version: Number(data.version) };
}

let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleNextSupabaseSync() { const preferences = getAccountSyncPreferences(); const status = getSupabaseSyncStatus(); if (!status.enabled || !status.signedIn || !status.configured || preferences.mode !== "automatic") return; save("supabaseSyncNextSyncAt", followingSyncAt(preferences.intervalMinutes)); ensureSupabaseSyncSchedule(); }
export function ensureSupabaseSyncSchedule() { if (timer) { clearTimeout(timer); timer = null; } const status = getSupabaseSyncStatus(); const preferences = getAccountSyncPreferences(); if (!status.enabled || !status.signedIn || !status.configured || preferences.mode !== "automatic") return; const next = scheduledSyncAt({ savedAt: setting("supabaseSyncNextSyncAt"), lastSyncedAt: setting("supabaseSyncLastSyncedAt"), intervalMinutes: preferences.intervalMinutes }); save("supabaseSyncNextSyncAt", next); timer = setTimeout(() => void syncSupabase().catch(() => {}), syncDelay(next)); }
