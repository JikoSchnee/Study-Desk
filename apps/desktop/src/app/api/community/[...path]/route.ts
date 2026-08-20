import { proxyCloudService } from "@/lib/cloud-service-proxy";

type RouteContext = { params: Promise<{ path: string[] }> };

function target(path: string[]) {
  return `/api/community/${path.map(encodeURIComponent).join("/")}`;
}

export async function GET(request: Request, context: RouteContext) {
  return proxyCloudService(request, target((await context.params).path));
}

export async function POST(request: Request, context: RouteContext) {
  return proxyCloudService(request, target((await context.params).path));
}
