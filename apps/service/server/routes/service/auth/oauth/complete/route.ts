import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeOAuthHandoff } from "@service/lib/oauth-handoff";
import { serviceError } from "@service/lib/service-supabase";

const inputSchema = z.object({ handoffToken: z.string().min(32).max(256) });

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    return NextResponse.json(await consumeOAuthHandoff(input.handoffToken), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "认证交接码无效。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
