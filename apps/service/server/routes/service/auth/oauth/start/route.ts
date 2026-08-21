import { NextResponse } from "next/server";
import { z } from "zod";
import { startOAuthFlow } from "@service/lib/oauth-handoff";
import { bearerToken, requireServiceUser, serviceError } from "@service/lib/service-supabase";

const inputSchema = z.object({ provider: z.literal("google"), intent: z.enum(["sign-in", "link"]) });

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    if (input.intent === "link") {
      const { user } = await requireServiceUser(request);
      return NextResponse.json(await startOAuthFlow({ intent: "link", initiatingUserId: user.id, accessToken: bearerToken(request) }), { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await startOAuthFlow({ intent: "sign-in" }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Google 登录参数无效。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
