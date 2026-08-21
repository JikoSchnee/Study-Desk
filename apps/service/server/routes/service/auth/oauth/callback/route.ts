import { authFlowDestination, completeOAuthCallback, desktopCallback, publicOAuthError } from "@service/lib/oauth-handoff";
import { attachWebSession, createWebSession } from "@service/lib/web-session";

export async function GET(request: Request, context: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await context.params;
  const destination = await authFlowDestination(flowId).catch(() => ({ client: "desktop" as const, returnPath: "/app" }));
  const url = new URL(request.url);
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) return destination.client === "web" ? new Response(null, { status: 303, headers: { Location: "/app/login?error=google_cancelled" } }) : desktopCallback({ error: "Google 登录已取消。" });
  const code = url.searchParams.get("code");
  if (!code) return destination.client === "web" ? new Response(null, { status: 303, headers: { Location: "/app/login?error=google" } }) : desktopCallback({ error: "Google 没有返回有效授权码。" });
  try {
    const completed = await completeOAuthCallback(flowId, code);
    if (completed.client === "web") {
      const session = await createWebSession(completed.session);
      return attachWebSession(new Response(null, { status: 303, headers: { Location: completed.returnPath } }), session);
    }
    return desktopCallback({ handoffToken: completed.handoffToken, intent: completed.intent });
  } catch (reason) {
    return destination.client === "web" ? new Response(null, { status: 303, headers: { Location: `/app/login?error=${encodeURIComponent(publicOAuthError(reason))}` } }) : desktopCallback({ error: publicOAuthError(reason) });
  }
}
