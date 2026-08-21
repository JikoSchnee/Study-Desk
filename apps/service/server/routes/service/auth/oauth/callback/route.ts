import { completeOAuthCallback, desktopCallback, publicOAuthError } from "@service/lib/oauth-handoff";

export async function GET(request: Request, context: { params: Promise<{ flowId: string }> }) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) return desktopCallback({ error: "Google 登录已取消。" });
  const code = url.searchParams.get("code");
  if (!code) return desktopCallback({ error: "Google 没有返回有效授权码。" });
  try {
    const { flowId } = await context.params;
    const completed = await completeOAuthCallback(flowId, code);
    return desktopCallback({ handoffToken: completed.handoffToken, intent: completed.intent });
  } catch (reason) {
    return desktopCallback({ error: publicOAuthError(reason) });
  }
}
