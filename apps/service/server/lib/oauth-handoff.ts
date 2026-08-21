import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { createServiceSupabase } from "@service/lib/service-supabase";

export type OAuthIntent = "sign-in" | "link";
export type OAuthProvider = "google";
export type DesktopAuthSession = {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string | null };
};

type FlowRow = {
  id: string;
  provider: OAuthProvider;
  intent: OAuthIntent;
  initiating_user_id: string | null;
  verifier_ciphertext: string | null;
  expires_at: string;
};

const flowLifetimeMs = 10 * 60_000;
const handoffLifetimeMs = 5 * 60_000;

function required(name: "SUPABASE_URL" | "SUPABASE_ANON_KEY" | "STUDY_DESK_AUTH_HANDOFF_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`服务端缺少 ${name} 环境变量。`);
  return value;
}

function encryptionKey() {
  const key = Buffer.from(required("STUDY_DESK_AUTH_HANDOFF_KEY"), "base64");
  if (key.length !== 32) throw new Error("STUDY_DESK_AUTH_HANDOFF_KEY 必须是 32 字节 Base64。 ");
  return key;
}

export function encryptAuthSecret(value: unknown) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function decryptAuthSecret<T>(value: string): T {
  const [version, nonceValue, encryptedValue, tagValue] = value.split(".");
  if (version !== "v1" || !nonceValue || !encryptedValue || !tagValue) throw new Error("认证交接数据无效。 ");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonceValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const codeChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

function callbackUrl(flowId: string) {
  const origin = (process.env.STUDY_DESK_PUBLIC_URL ?? "https://study-desk.jiko-official.top").replace(/\/+$/, "");
  return `${origin}/api/service/auth/oauth/callback/${flowId}`;
}

function authBase() {
  return `${required("SUPABASE_URL").replace(/\/+$/, "")}/auth/v1`;
}

function providerUrl(pathname: string, flowId: string, verifier: string, skipHttpRedirect = false) {
  const url = new URL(`${authBase()}${pathname}`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", callbackUrl(flowId));
  url.searchParams.set("scopes", "openid email profile");
  url.searchParams.set("code_challenge", codeChallenge(verifier));
  url.searchParams.set("code_challenge_method", "s256");
  if (skipHttpRedirect) url.searchParams.set("skip_http_redirect", "true");
  return url;
}

export async function startOAuthFlow(input: { intent: OAuthIntent; initiatingUserId?: string; accessToken?: string }) {
  const id = randomUUID();
  const verifier = randomBytes(48).toString("base64url");
  const supabase = createServiceSupabase();
  const inserted = await supabase.from("study_desk_auth_flows").insert({
    id,
    provider: "google",
    intent: input.intent,
    initiating_user_id: input.intent === "link" ? input.initiatingUserId : null,
    verifier_ciphertext: encryptAuthSecret(verifier),
    expires_at: new Date(Date.now() + flowLifetimeMs).toISOString(),
  });
  if (inserted.error) throw inserted.error;

  if (input.intent === "sign-in") return { authorizationUrl: providerUrl("/authorize", id, verifier).toString() };
  if (!input.initiatingUserId || !input.accessToken) throw new Error("SERVICE_AUTH_REQUIRED");

  const response = await fetch(providerUrl("/user/identities/authorize", id, verifier, true), {
    headers: { apikey: required("SUPABASE_ANON_KEY"), Authorization: `Bearer ${input.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null) as { url?: string; message?: string; error_description?: string } | null;
  if (!response.ok || !body?.url) throw new Error(body?.message || body?.error_description || "无法开始 Google 账号关联。 ");
  return { authorizationUrl: body.url };
}

async function exchangeCode(code: string, verifier: string): Promise<DesktopAuthSession> {
  const response = await fetch(`${authBase()}/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: required("SUPABASE_ANON_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null) as { access_token?: string; refresh_token?: string; user?: { id?: string; email?: string | null }; message?: string; error_description?: string } | null;
  if (!response.ok || !body?.access_token || !body.refresh_token || !body.user?.id) throw new Error(body?.message || body?.error_description || "Google 登录验证失败。 ");
  return { access_token: body.access_token, refresh_token: body.refresh_token, user: { id: body.user.id, email: body.user.email ?? null } };
}

export async function completeOAuthCallback(flowId: string, code: string) {
  const supabase = createServiceSupabase();
  const selected = await supabase.from("study_desk_auth_flows").select("id, provider, intent, initiating_user_id, verifier_ciphertext, expires_at").eq("id", flowId).is("completed_at", null).maybeSingle();
  if (selected.error) throw selected.error;
  const flow = selected.data as FlowRow | null;
  if (!flow?.verifier_ciphertext || Date.parse(flow.expires_at) <= Date.now()) throw new Error("OAuth 流程已失效，请重新开始。 ");

  const session = await exchangeCode(code, decryptAuthSecret<string>(flow.verifier_ciphertext));
  if (flow.intent === "link" && session.user.id !== flow.initiating_user_id) throw new Error("Google 身份属于另一个账号，不支持合并不同账号。 ");

  const handoffToken = randomBytes(32).toString("base64url");
  const completedAt = new Date().toISOString();
  const updated = await supabase.from("study_desk_auth_flows").update({
    verifier_ciphertext: null,
    result_ciphertext: encryptAuthSecret(session),
    handoff_hash: tokenHash(handoffToken),
    handoff_expires_at: new Date(Date.now() + handoffLifetimeMs).toISOString(),
    completed_at: completedAt,
  }).eq("id", flowId).is("completed_at", null).select("id").maybeSingle();
  if (updated.error || !updated.data) throw updated.error ?? new Error("OAuth 流程已经完成。 ");
  return { handoffToken, intent: flow.intent };
}

export async function consumeOAuthHandoff(handoffToken: string) {
  const supabase = createServiceSupabase();
  const consumed = await supabase.from("study_desk_auth_flows").update({ consumed_at: new Date().toISOString() })
    .eq("handoff_hash", tokenHash(handoffToken)).is("consumed_at", null).gt("handoff_expires_at", new Date().toISOString())
    .select("result_ciphertext, intent, initiating_user_id").maybeSingle();
  if (consumed.error) throw consumed.error;
  if (!consumed.data?.result_ciphertext) throw new Error("认证交接码无效、已过期或已使用。 ");
  const session = decryptAuthSecret<DesktopAuthSession>(consumed.data.result_ciphertext);
  if (consumed.data.intent === "link" && session.user.id !== consumed.data.initiating_user_id) throw new Error("账号关联校验失败。 ");
  return { session, intent: consumed.data.intent as OAuthIntent };
}

export function desktopCallback(input: { handoffToken?: string; intent?: string; error?: string }) {
  const url = new URL("study-desk://auth/callback");
  if (input.handoffToken) url.searchParams.set("handoff", input.handoffToken);
  if (input.intent) url.searchParams.set("intent", input.intent);
  if (input.error) url.searchParams.set("error_description", input.error.slice(0, 300));
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export function publicOAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/属于另一个账号|不支持合并/.test(message)) return "这个 Google 身份已经属于另一个账号，不支持合并不同账号。";
  if (/已失效|已经完成/.test(message)) return "Google 登录流程已失效，请回到 Study Desk 重新开始。";
  return "Google 登录未完成，请回到 Study Desk 重试。";
}
