import { NextResponse } from "next/server";
import { requireServiceUser, serviceError } from "@service/lib/service-supabase";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, token } = await requireServiceUser(request);
    const { id } = await context.params;
    const target = (user.identities ?? []).find((identity) => identity.id === id);
    const hasEmail = (user.identities ?? []).some((identity) => identity.provider === "email");
    if (!target || target.provider !== "google") return NextResponse.json({ error: "没有找到可解除的 Google 登录方式。" }, { status: 404 });
    if (!hasEmail) return NextResponse.json({ error: "必须先保留邮箱登录方式，才能解除 Google 关联。" }, { status: 409 });

    const base = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
    const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
    if (!base || !anonKey) throw new Error("服务端缺少 Supabase 身份认证配置。");
    const response = await fetch(`${base}/auth/v1/user/identities/${encodeURIComponent(id)}`, { method: "DELETE", headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message || "无法解除 Google 登录方式。 ");
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
