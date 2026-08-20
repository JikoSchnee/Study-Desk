import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase, serviceError } from "@/lib/service-supabase";

const inputSchema = z.object({ refreshToken: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const { refreshToken } = inputSchema.parse(await request.json());
    const { data, error } = await createServiceSupabase().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new Error("SERVICE_AUTH_REQUIRED");
    return NextResponse.json({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token, user: { email: data.user?.email ?? null } } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "刷新会话参数无效。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
