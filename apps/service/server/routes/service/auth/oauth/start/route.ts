import { NextResponse } from "next/server";
import { z } from "zod";
import { startOAuthFlow } from "@service/lib/oauth-handoff";
import { requireServiceUser, serviceError } from "@service/lib/service-supabase";
import { requireWebCsrf } from "@service/lib/web-session";

const inputSchema = z.object({ provider: z.literal("google"), intent: z.enum(["sign-in", "link"]), client: z.enum(["desktop", "web"]).default("desktop"), returnPath: z.string().max(200).optional() });

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    if (input.intent === "link") {
      const auth = await requireServiceUser(request);
      if ("webSessionId" in auth) await requireWebCsrf(request, auth.webSessionId);
      const { user, token } = auth;
      return NextResponse.json(await startOAuthFlow({ intent: "link", client: input.client, returnPath: input.returnPath, initiatingUserId: user.id, accessToken: token }), { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await startOAuthFlow({ intent: "sign-in", client: input.client, returnPath: input.returnPath }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Google 登录参数无效。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
