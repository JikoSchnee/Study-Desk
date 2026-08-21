import { completeEmailLogin } from "@service/lib/email-auth";
import { desktopCallback, encryptAuthSecret, tokenHash } from "@service/lib/oauth-handoff";
import { attachWebSession, createWebSession } from "@service/lib/web-session";
import { createServiceSupabase } from "@service/lib/service-supabase";
import { randomBytes } from "node:crypto";

export async function GET(request: Request, context: { params: Promise<{ flowId: string }> }) {
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return new Response(null, { status: 303, headers: { Location: "/app/login?error=email" } });
  try {
    const { flowId } = await context.params;
    const completed = await completeEmailLogin(flowId, code);
    if (completed.client === "web") return attachWebSession(new Response(null, { status: 303, headers: { Location: completed.returnPath } }), await createWebSession(completed.session));
    const handoff = randomBytes(32).toString("base64url");
    const stored = await createServiceSupabase().from("study_desk_auth_flows").update({
      result_ciphertext: encryptAuthSecret(completed.session), handoff_hash: tokenHash(handoff), handoff_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }).eq("id", flowId);
    if (stored.error) throw stored.error;
    return desktopCallback({ handoffToken: handoff, intent: "sign-in" });
  } catch {
    return new Response(null, { status: 303, headers: { Location: "/app/login?error=email" } });
  }
}
