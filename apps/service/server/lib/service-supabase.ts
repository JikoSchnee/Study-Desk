import "server-only";
import { createClient } from "@supabase/supabase-js";

function required(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`服务端缺少 ${name} 环境变量。`);
  return value;
}

export function createServiceSupabase() {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) throw new Error("SERVICE_AUTH_REQUIRED");
  const token = authorization.slice(7).trim();
  if (!token) throw new Error("SERVICE_AUTH_REQUIRED");
  return token;
}

export async function requireServiceUser(request: Request) {
  let token = "";
  try { token = bearerToken(request); } catch { /* A same-origin web cookie may authenticate below. */ }
  if (!token) return (await import("@service/lib/web-session")).resolveWebSession(request);
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("SERVICE_AUTH_REQUIRED");
  return { user: data.user, supabase, token };
}

export function serviceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("SERVICE_AUTH_REQUIRED")) return { status: 401, message: "登录已失效，请重新登录。" };
  if (message.includes("WEB_CSRF_INVALID")) return { status: 403, message: "网页安全校验失败，请刷新页面后重试。" };
  if (message.includes("MEMBERSHIP_READ_ONLY")) return { status: 403, message: "会员已到期，当前处于 30 天只读宽限期；续费后才能继续上传。" };
  if (message.includes("MEMBERSHIP_REQUIRED")) return { status: 402, message: "云同步需要有效试用或会员，请先开始 7 天试用或充值会员。" };
  if (message.includes("TRIAL_ALREADY_USED")) return { status: 409, message: "此账号已经领取过 7 天试用。" };
  if (/identity_already_exists|already.*linked|belongs to another/i.test(message)) return { status: 409, message: "这个 Google 身份已经属于另一个账号，不支持合并不同账号。" };
  if (/认证交接码无效|OAuth 流程已失效|已经完成/.test(message)) return { status: 400, message };
  if (message.includes("SYNC_VERSION_CONFLICT")) return { status: 409, message: "云端数据刚刚被另一台设备更新，请重新同步。" };
  if (message.includes("SYNC_QUOTA_EXCEEDED")) return { status: 413, message: "云同步空间已达到 500 MB 上限，请减少历史版本或数据体积。" };
  return { status: 500, message: message || "Study Desk 服务暂时不可用。" };
}
