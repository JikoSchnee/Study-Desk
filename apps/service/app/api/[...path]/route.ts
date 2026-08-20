import { NextResponse } from "next/server";
import { POST as sendMagicLink } from "@service/routes/service/auth/magic-link/route";
import { POST as refreshSession } from "@service/routes/service/auth/refresh/route";
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

export async function GET(request: Request, context: RouteContext) {
  const path = (await context.params).path;
  const route = path.join("/");

  if (route === "service/membership") return getMembership(request);
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

  if (route === "service/auth/magic-link") return sendMagicLink(request);
  if (route === "service/auth/refresh") return refreshSession(request);
  if (route === "service/membership/trial") return startTrial(request);
  if (route === "service/membership/checkout") return createCheckout(request);
  if (route === "service/sync") return writeSync(request);
  if (route === "service/maintenance/cloud-cleanup") return cleanCloud(request);
  if (route === "community/checkout") return createCommunityCheckout(request);
  if (route === "webhooks/paddle") return handlePaddleWebhook(request);

  if (["service/membership", "community/catalog", "release/latest"].includes(route)) return methodNotAllowed(["GET"]);
  return notFound();
}
