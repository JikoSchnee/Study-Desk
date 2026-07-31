import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/release/latest/route";

describe("GET /api/release/latest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the latest release report without caching it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tag_name: "v1.7.0", html_url: "https://github.com/JikoSchnee/Study-Desk/releases/tag/v1.7.0", body: "## 新功能\n\n- 支持 Markdown" })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ latestVersion: "1.7.0", url: "https://github.com/JikoSchnee/Study-Desk/releases/tag/v1.7.0", releaseNotes: "## 新功能\n\n- 支持 Markdown" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/JikoSchnee/Study-Desk/releases/latest", expect.objectContaining({ cache: "no-store" }));
  });

  it("returns a retryable error for a failed GitHub response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })));

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "暂时无法获取最新更新报告，请稍后重试。" });
  });

  it("returns a retryable error when GitHub cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "无法连接 GitHub 获取最新更新报告，请检查网络后重试。" });
  });
});
