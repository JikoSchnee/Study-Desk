import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createServiceSupabase } from "@service/lib/service-supabase";

const sessionCookie = "__Host-study_desk_session";
const csrfCookie = "__Host-study_desk_csrf";
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1_000;

type StoredSession = Pick<Session, "access_token" | "refresh_token" | "expires_at"> & { user: { id: string; email: string | null } };
type WebSessionRow = { id: string; user_id: string; token_hash: string; csrf_hash: string; session_ciphertext: string; expires_at: string };

function requiredKey() {
  const value = process.env.STUDY_DESK_WEB_SESSION_KEY?.trim();
  if (!value) throw new Error("服务端缺少 STUDY_DESK_WEB_SESSION_KEY 环境变量。");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("STUDY_DESK_WEB_SESSION_KEY 必须是 32 字节 Base64。");
  return key;
}

export const webTokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

export function encryptWebSecret(value: unknown) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requiredKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function decryptWebSecret<T>(value: string): T {
  const [version, nonce, encrypted, tag] = value.split(".");
  if (version !== "v1" || !nonce || !encrypted || !tag) throw new Error("网页会话数据无效。");
  const decipher = createDecipheriv("aes-256-gcm", requiredKey(), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")) as T;
}

function cookies(request: Request) {
  return Object.fromEntries((request.headers.get("cookie") ?? "").split(";").flatMap((part) => {
    const index = part.indexOf("=");
    return index > 0 ? [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]] : [];
  }));
}

function cookie(name: string, value: string, input: { httpOnly?: boolean; expires?: Date; maxAge?: number } = {}) {
  return [`${name}=${encodeURIComponent(value)}`, "Path=/", "Secure", input.httpOnly ? "HttpOnly" : "", "SameSite=Lax", input.expires ? `Expires=${input.expires.toUTCString()}` : "", input.maxAge !== undefined ? `Max-Age=${input.maxAge}` : ""].filter(Boolean).join("; ");
}

function normalizedSession(session: Session): StoredSession {
  if (!session.user?.id || !session.access_token || !session.refresh_token) throw new Error("网页登录没有返回有效会话。");
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, user: { id: session.user.id, email: session.user.email ?? null } };
}

export async function createWebSession(session: Session | StoredSession) {
  const value = "expires_at" in session && "user" in session && typeof session.user?.id === "string" ? session as StoredSession : normalizedSession(session as Session);
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + sessionLifetimeMs);
  const supabase = createServiceSupabase();
  const inserted = await supabase.from("study_desk_web_sessions").insert({ user_id: value.user.id, token_hash: webTokenHash(token), csrf_hash: webTokenHash(csrf), session_ciphertext: encryptWebSecret(value), expires_at: expires.toISOString() });
  if (inserted.error) throw inserted.error;
  return { token, csrf, expires };
}

export function attachWebSession(response: Response, session: { token: string; csrf: string; expires: Date }) {
  response.headers.append("Set-Cookie", cookie(sessionCookie, session.token, { httpOnly: true, expires: session.expires, maxAge: Math.floor(sessionLifetimeMs / 1000) }));
  response.headers.append("Set-Cookie", cookie(csrfCookie, session.csrf, { expires: session.expires, maxAge: Math.floor(sessionLifetimeMs / 1000) }));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function clearWebSession(response: Response) {
  response.headers.append("Set-Cookie", cookie(sessionCookie, "", { httpOnly: true, maxAge: 0 }));
  response.headers.append("Set-Cookie", cookie(csrfCookie, "", { maxAge: 0 }));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export type ResolvedWebSession = { user: User; supabase: SupabaseClient; token: string; webSessionId: string };

export async function resolveWebSession(request: Request): Promise<ResolvedWebSession> {
  const raw = cookies(request)[sessionCookie];
  if (!raw) throw new Error("SERVICE_AUTH_REQUIRED");
  const supabase = createServiceSupabase();
  const selected = await supabase.from("study_desk_web_sessions").select("id, user_id, token_hash, csrf_hash, session_ciphertext, expires_at").eq("token_hash", webTokenHash(raw)).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (selected.error) throw selected.error;
  const row = selected.data as WebSessionRow | null;
  if (!row) throw new Error("SERVICE_AUTH_REQUIRED");
  let stored = decryptWebSecret<StoredSession>(row.session_ciphertext);
  let userResult = await supabase.auth.getUser(stored.access_token);
  if (userResult.error || !userResult.data.user) {
    const refreshed = await supabase.auth.refreshSession({ refresh_token: stored.refresh_token });
    if (refreshed.error || !refreshed.data.session || !refreshed.data.user) throw new Error("SERVICE_AUTH_REQUIRED");
    stored = normalizedSession(refreshed.data.session);
    userResult = { data: { user: refreshed.data.user }, error: null };
    const updated = await supabase.from("study_desk_web_sessions").update({ session_ciphertext: encryptWebSecret(stored), last_seen_at: new Date().toISOString() }).eq("id", row.id);
    if (updated.error) throw updated.error;
  } else {
    void supabase.from("study_desk_web_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { user: userResult.data.user!, supabase, token: stored.access_token, webSessionId: row.id };
}

export async function requireWebCsrf(request: Request, webSessionId: string) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new Error("WEB_CSRF_INVALID");
  const csrf = request.headers.get("x-study-desk-csrf") ?? "";
  const cookieValue = cookies(request)[csrfCookie] ?? "";
  if (!csrf || csrf !== cookieValue) throw new Error("WEB_CSRF_INVALID");
  const supabase = createServiceSupabase();
  const found = await supabase.from("study_desk_web_sessions").select("id").eq("id", webSessionId).eq("csrf_hash", webTokenHash(csrf)).is("revoked_at", null).maybeSingle();
  if (found.error || !found.data) throw new Error("WEB_CSRF_INVALID");
}

export async function revokeWebSession(webSessionId: string, userId: string, all = false) {
  const supabase = createServiceSupabase();
  let query = supabase.from("study_desk_web_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
  if (!all) query = query.eq("id", webSessionId);
  const result = await query;
  if (result.error) throw result.error;
}
