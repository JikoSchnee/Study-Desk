import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/readme/route";

describe("GET /api/readme", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("returns the latest README content without caching it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("# Study Desk"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: "# Study Desk" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledWith("https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/README.md", expect.objectContaining({ cache: "no-store" }));
  });

  it("returns a retryable error when GitHub returns an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })));

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "暂时无法获取最新 README，请稍后重试。" });
  });

  it("returns a retryable error for network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await GET();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "无法连接 GitHub 获取最新 README，请检查网络后重试。" });
  });

  it("returns a retryable error when GitHub does not respond in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    const pending = GET();
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "读取最新 README 超时，请检查网络后重试。" });
  });
});
