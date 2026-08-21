import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { createServiceSupabase } from "@service/lib/service-supabase";
import { decryptAuthSecret, encryptAuthSecret, type DesktopAuthSession, type OAuthClient } from "@service/lib/oauth-handoff";

type EmailState = Record<string, string>;
type EmailFlow = { client: OAuthClient; return_path: string | null; verifier_ciphertext: string; expires_at: string };

function required(name: "SUPABASE_URL" | "SUPABASE_ANON_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`服务端缺少 ${name} 环境变量。`);
  return value;
}

function callbackUrl(flowId: string) {
  const origin = (process.env.STUDY_DESK_PUBLIC_URL ?? "https://study-desk.jiko-official.top").replace(/\/+$/, "");
  return `${origin}/api/service/auth/email/callback/${flowId}`;
}

function safeReturnPath(value?: string) { return value?.startsWith("/app") && !value.startsWith("//") ? value : "/app"; }

function memoryStorage(state: EmailState): SupportedStorage {
  return {
    getItem: (key) => state[key] ?? null,
    setItem: (key, value) => { state[key] = value; },
    removeItem: (key) => { delete state[key]; },
  };
}

function authClient(state: EmailState) {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: memoryStorage(state) },
  });
}

export async function sendEmailLogin(input: { email: string; client: OAuthClient; returnPath?: string }) {
  const id = randomUUID();
  const state: EmailState = {};
  const service = createServiceSupabase();
  const inserted = await service.from("study_desk_auth_flows").insert({
    id,
    provider: "email",
    intent: "sign-in",
    client: input.client,
    return_path: input.client === "web" ? safeReturnPath(input.returnPath) : null,
    verifier_ciphertext: encryptAuthSecret({}),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (inserted.error) throw inserted.error;
  const sent = await authClient(state).auth.signInWithOtp({ email: input.email, options: { shouldCreateUser: true, emailRedirectTo: callbackUrl(id) } });
  if (sent.error) throw sent.error;
  const updated = await service.from("study_desk_auth_flows").update({ verifier_ciphertext: encryptAuthSecret(state) }).eq("id", id).is("completed_at", null);
  if (updated.error) throw updated.error;
  return { ok: true };
}

export async function completeEmailLogin(flowId: string, code: string) {
  const service = createServiceSupabase();
  const selected = await service.from("study_desk_auth_flows").select("client, return_path, verifier_ciphertext, expires_at").eq("id", flowId).eq("provider", "email").is("completed_at", null).maybeSingle();
  if (selected.error) throw selected.error;
  const flow = selected.data as EmailFlow | null;
  if (!flow?.verifier_ciphertext || Date.parse(flow.expires_at) <= Date.now()) throw new Error("邮箱登录流程已失效，请重新发送登录链接。");
  const client = authClient(decryptAuthSecret<EmailState>(flow.verifier_ciphertext));
  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.session) throw exchanged.error ?? new Error("邮箱登录验证失败。");
  const session: DesktopAuthSession = {
    access_token: exchanged.data.session.access_token,
    refresh_token: exchanged.data.session.refresh_token,
    user: { id: exchanged.data.session.user.id, email: exchanged.data.session.user.email ?? null },
  };
  const updated = await service.from("study_desk_auth_flows").update({ verifier_ciphertext: null, completed_at: new Date().toISOString() }).eq("id", flowId).is("completed_at", null).select("id").maybeSingle();
  if (updated.error || !updated.data) throw updated.error ?? new Error("邮箱登录链接已经使用。");
  return { client: flow.client, returnPath: safeReturnPath(flow.return_path ?? undefined), session };
}
