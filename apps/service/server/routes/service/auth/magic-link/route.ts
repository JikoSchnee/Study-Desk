import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabase, serviceError } from "@service/lib/service-supabase";

const inputSchema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  try {
    const { email } = inputSchema.parse(await request.json());
    const { error } = await createServiceSupabase().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: "study-desk://auth/callback" },
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "请输入有效邮箱。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
