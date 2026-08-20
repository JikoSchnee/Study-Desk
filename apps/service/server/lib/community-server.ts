import "server-only";
import { createClient } from "@supabase/supabase-js";

type CommunityViewer = { id: string; email: string | null; accessToken: string };

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

function desktopAccessToken() {
  try {
    const session = process.env.MOCK_INTERVIEW_SUPABASE_SESSION ? JSON.parse(process.env.MOCK_INTERVIEW_SUPABASE_SESSION) as { access_token?: string } : null;
    return session?.access_token ?? "";
  } catch { return ""; }
}

export async function requireCommunityViewer(request: Request): Promise<CommunityViewer> {
  const accessToken = bearerToken(request) || desktopAccessToken();
  const config = supabaseConfig();
  if (!accessToken || !config.url || !config.anonKey) {
    if (process.env.NODE_ENV !== "production") return { id: "00000000-0000-4000-8000-000000000001", email: "demo@study-desk.local", accessToken: "demo" };
    throw new Error("COMMUNITY_AUTH_REQUIRED");
  }
  const client = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("COMMUNITY_AUTH_REQUIRED");
  return { id: data.user.id, email: data.user.email ?? null, accessToken };
}

export function communitySupabase(accessToken: string) {
  const config = supabaseConfig();
  if (!config.url || !config.anonKey || accessToken === "demo") return null;
  return createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } } });
}

export function communityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("COMMUNITY_AUTH_REQUIRED")) return { status: 401, message: "请先登录购买时使用的账号。" };
  if (message.includes("COMMUNITY_ACCESS_DENIED")) return { status: 403, message: "当前账号没有这套知识库的有效权益。" };
  if (message.includes("COMMUNITY_CARD_NOT_FOUND")) return { status: 404, message: "没有找到这张练习卡。" };
  return { status: 500, message: message || "社区服务暂时不可用。" };
}
