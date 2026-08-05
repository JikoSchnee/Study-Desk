import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/network-diagnostics/route";

describe("GET /api/network-diagnostics", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns a separate result for basic network, GitHub, and Hugging Face", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("ok"))
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }))
      .mockResolvedValueOnce(new Response("blocked", { status: 403 })));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "network", ok: true, status: 200 }),
      expect.objectContaining({ id: "github", ok: false, failureKind: "dns", detail: "域名无法解析（DNS）。" }),
      expect.objectContaining({ id: "huggingface", ok: false, status: 403, failureKind: "http" }),
    ]));
  });
});
