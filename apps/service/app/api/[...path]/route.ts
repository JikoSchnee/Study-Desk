import { NextResponse } from "next/server";
import { POST as sendMagicLink } from "@service/routes/service/auth/magic-link/route";
import { GET as emailCallback } from "@service/routes/service/auth/email/callback/route";
import { POST as refreshSession } from "@service/routes/service/auth/refresh/route";
import { GET as getAuthAccount } from "@service/routes/service/auth/account/route";
import { DELETE as deleteAuthIdentity } from "@service/routes/service/auth/identities/[id]/route";
import { POST as logout } from "@service/routes/service/auth/logout/route";
import { GET as oauthCallback } from "@service/routes/service/auth/oauth/callback/route";
import { POST as completeOAuth } from "@service/routes/service/auth/oauth/complete/route";
import { POST as startOAuth } from "@service/routes/service/auth/oauth/start/route";
import { GET as cleanCloud } from "@service/routes/service/maintenance/cloud-cleanup/route";
import { GET as getMembership } from "@service/routes/service/membership/route";
import { POST as startTrial } from "@service/routes/service/membership/trial/route";
import { POST as createCheckout } from "@service/routes/service/membership/checkout/route";
import { GET as readSync, POST as writeSync } from "@service/routes/service/sync/route";
import { POST as handlePaddleWebhook } from "@service/routes/webhooks/paddle/route";
import { GET as getCommunityCatalog } from "@service/routes/community/catalog/route";
import { POST as createCommunityCheckout } from "@service/routes/community/checkout/route";
import { GET as getCommunityCard } from "@service/routes/community/knowledge-bases/[id]/cards/[position]/route";
import { GET as getLatestRelease } from "@service/routes/release/latest/route";
import { handleWebGet, handleWebPatch, handleWebPost, webRouteError } from "@service/routes/web/route";
import { requireWebCsrf, resolveWebSession } from "@service/lib/web-session";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

function methodNotAllowed(allowed: string[]) {
  return NextResponse.json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { Allow: allowed.join(", ") } },
  );
}

function notFound() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

async function protectCookieWrite(request: Request) {
  if (!request.headers.get("cookie")?.includes("__Host-study_desk_session=")) return;
  const auth = await resolveWebSession(request);
  await requireWebCsrf(request, auth.webSessionId);
}

export async function GET(request: Request, context: RouteContext) {
  const path = (await context.params).path;
  const route = path.join("/");

  if (path[0] === "web") {
    try { return await handleWebGet(request, path.slice(1)) ?? notFound(); }
    catch (error) { return webRouteError(error); }
  }

  if (route === "service/membership") return getMembership(request);
  if (route === "service/auth/account") return getAuthAccount(request);
  if (path.length === 5 && path.slice(0, 4).join("/") === "service/auth/oauth/callback") {
    return oauthCallback(request, { params: Promise.resolve({ flowId: path[4] }) });
  }
  if (path.length === 5 && path.slice(0, 4).join("/") === "service/auth/email/callback") {
    return emailCallback(request, { params: Promise.resolve({ flowId: path[4] }) });
  }
  if (route === "service/sync") return readSync(request);
  if (route === "service/maintenance/cloud-cleanup") return cleanCloud(request);
  if (route === "community/catalog") return getCommunityCatalog();
  if (route === "release/latest") return getLatestRelease();
  if (path.length === 5 && path[0] === "community" && path[1] === "knowledge-bases" && path[3] === "cards") {
    return getCommunityCard(request, {
      params: Promise.resolve({ id: path[2], position: path[4] }),
    });
  }

  if ([
    "service/auth/magic-link",
    "service/auth/refresh",
    "service/auth/logout",
    "service/auth/oauth/start",
    "service/auth/oauth/complete",
    "service/membership/trial",
    "service/membership/checkout",
    "community/checkout",
    "webhooks/paddle",
  ].includes(route)) return methodNotAllowed(["POST"]);

  return notFound();
}

export async function POST(request: Request, context: RouteContext) {
  const path = (await context.params).path;
  const route = path.join("/");

  if (path[0] === "web") {
    try {
      if (!path.slice(1).join("/").startsWith("logout")) {
        const auth = await resolveWebSession(request);
        await requireWebCsrf(request, auth.webSessionId);
      }
      return await handleWebPost(request, path.slice(1)) ?? notFound();
    } catch (error) { return webRouteError(error); }
  }
  if (!["webhooks/paddle", "service/auth/magic-link", "service/auth/oauth/start", "service/auth/refresh"].includes(route)) {
    try { await protectCookieWrite(request); }
    catch (error) { return webRouteError(error); }
  }

  if (route === "service/auth/magic-link") return sendMagicLink(request);
  if (route === "service/auth/refresh") return refreshSession(request);
  if (route === "service/auth/logout") return logout(request);
  if (route === "service/auth/oauth/start") return startOAuth(request);
  if (route === "service/auth/oauth/complete") return completeOAuth(request);
  if (route === "service/membership/trial") return startTrial(request);
  if (route === "service/membership/checkout") return createCheckout(request);
  if (route === "service/sync") return writeSync(request);
  if (route === "service/maintenance/cloud-cleanup") return cleanCloud(request);
  if (route === "community/checkout") return createCommunityCheckout(request);
  if (route === "webhooks/paddle") return handlePaddleWebhook(request);

  if (["service/membership", "service/auth/account", "community/catalog", "release/latest"].includes(route)) return methodNotAllowed(["GET"]);
  return notFound();
}

export async function PATCH(request: Request, context: RouteContext) {
  const path = (await context.params).path;
  if (path[0] !== "web") return notFound();
  try {
    const auth = await resolveWebSession(request);
    await requireWebCsrf(request, auth.webSessionId);
    return await handleWebPatch(request, path.slice(1)) ?? notFound();
  } catch (error) { return webRouteError(error); }
}

export async function DELETE(request: Request, context: RouteContext) {
  const path = (await context.params).path;
  try { await protectCookieWrite(request); }
  catch (error) { return webRouteError(error); }
  if (path.length === 4 && path.slice(0, 3).join("/") === "service/auth/identities") {
    return deleteAuthIdentity(request, { params: Promise.resolve({ id: path[3] }) });
  }
  return notFound();
}
