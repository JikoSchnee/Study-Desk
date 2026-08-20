import "server-only";

type DesktopSession = { access_token?: string };

function serviceUrl() {
  return (process.env.STUDY_DESK_SERVICE_URL ?? process.env.NEXT_PUBLIC_STUDY_DESK_SERVICE_URL ?? "").replace(/\/+$/, "");
}

function accessToken() {
  try {
    const session = process.env.MOCK_INTERVIEW_SUPABASE_SESSION
      ? JSON.parse(process.env.MOCK_INTERVIEW_SUPABASE_SESSION) as DesktopSession
      : null;
    return session?.access_token ?? "";
  } catch {
    return "";
  }
}

export async function proxyCloudService(request: Request, pathname: string) {
  const base = serviceUrl();
  if (!base) return Response.json({ error: "当前版本尚未配置 Study Desk 服务地址。" }, { status: 503 });

  const source = new URL(request.url);
  const headers = new Headers({ Accept: "application/json" });
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const demoAccess = request.headers.get("x-community-demo-access");
  if (demoAccess) headers.set("X-Community-Demo-Access", demoAccess);

  try {
    const response = await fetch(`${base}${pathname}${source.search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "无法连接 Study Desk 云服务，请检查网络后重试。" }, { status: 502 });
  }
}
