import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@service/routes/release/latest/route";
import { GET as cloudGET } from "../../../../app/api/[...path]/route";

describe("GET /api/release/latest", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("returns cached release metadata and supported installers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v1.7.1",
      html_url: "https://github.com/JikoSchnee/Study-Desk/releases/tag/v1.7.1",
      body: "更新说明",
      assets: [
        { name: "Study-Desk-Setup-1.7.1.exe", size: 100, browser_download_url: "https://github.com/JikoSchnee/Study-Desk/releases/download/v1.7.1/Study-Desk-Setup-1.7.1.exe" },
        { name: "Study-Desk-1.7.1-mac-arm64.dmg", size: 200, browser_download_url: "https://github.com/JikoSchnee/Study-Desk/releases/download/v1.7.1/Study-Desk-1.7.1-mac-arm64.dmg" },
      ],
    })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
    expect(await response.json()).toMatchObject({
      latestVersion: "1.7.1",
      downloads: {
        windows: { name: "Study-Desk-Setup-1.7.1.exe", size: 100 },
        macArm64: { name: "Study-Desk-1.7.1-mac-arm64.dmg", size: 200 },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ next: { revalidate: 300 } }));
  });

  it("keeps a successful response when supported assets are absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ tag_name: "v2.0.0", html_url: "https://github.com/JikoSchnee/Study-Desk/releases/tag/v2.0.0", assets: [] }))));

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ downloads: { windows: null, macArm64: null } });
  });

  it("returns a retryable error for a GitHub failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 403 })));
    const response = await GET();
    expect(response.status).toBe(502);
  });

  it("is available through the Vercel catch-all route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v1.7.1",
      html_url: "https://github.com/JikoSchnee/Study-Desk/releases/tag/v1.7.1",
      assets: [],
    }))));

    const response = await cloudGET(new Request("https://example.com/api/release/latest"), {
      params: Promise.resolve({ path: ["release", "latest"] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ latestVersion: "1.7.1" });
  });
});
