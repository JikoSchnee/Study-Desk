import { afterEach, describe, expect, it, vi } from "vitest";

import { proxyCloudService } from "./cloud-service-proxy";

const originalServiceUrl = process.env.STUDY_DESK_SERVICE_URL;
const originalPublicServiceUrl = process.env.NEXT_PUBLIC_STUDY_DESK_SERVICE_URL;
const originalSession = process.env.MOCK_INTERVIEW_SUPABASE_SESSION;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalServiceUrl === undefined) delete process.env.STUDY_DESK_SERVICE_URL;
  else process.env.STUDY_DESK_SERVICE_URL = originalServiceUrl;
  if (originalPublicServiceUrl === undefined) delete process.env.NEXT_PUBLIC_STUDY_DESK_SERVICE_URL;
  else process.env.NEXT_PUBLIC_STUDY_DESK_SERVICE_URL = originalPublicServiceUrl;
  if (originalSession === undefined) delete process.env.MOCK_INTERVIEW_SUPABASE_SESSION;
  else process.env.MOCK_INTERVIEW_SUPABASE_SESSION = originalSession;
});

describe("desktop cloud service proxy", () => {
  it("forwards community requests with the desktop account token", async () => {
    process.env.STUDY_DESK_SERVICE_URL = "https://service.example.com/";
    process.env.MOCK_INTERVIEW_SUPABASE_SESSION = JSON.stringify({ access_token: "user-token" });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ card: { id: "card" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyCloudService(
      new Request("http://127.0.0.1/api/community/cards/0?preview=1", { headers: { "x-community-demo-access": "1" } }),
      "/api/community/cards/0",
    );

    expect(await response.json()).toEqual({ card: { id: "card" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://service.example.com/api/community/cards/0?preview=1",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer user-token");
    expect(headers.get("x-community-demo-access")).toBe("1");
  });

  it("fails closed when the deployment-owned service URL is absent", async () => {
    delete process.env.STUDY_DESK_SERVICE_URL;
    delete process.env.NEXT_PUBLIC_STUDY_DESK_SERVICE_URL;
    const response = await proxyCloudService(new Request("http://127.0.0.1/api/community/catalog"), "/api/community/catalog");
    expect(response.status).toBe(503);
  });
});
