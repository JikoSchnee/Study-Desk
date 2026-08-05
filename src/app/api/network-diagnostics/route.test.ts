import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/network-diagnostics/route";

describe("GET /api/network-diagnostics", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete (globalThis as typeof globalThis & { __studyDeskNetworkTransport?: unknown }).__studyDeskNetworkTransport; });

  it("returns a separate result for basic network, GitHub, and Hugging Face", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("ok"))
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }))
      .mockResolvedValueOnce(new Response("blocked", { status: 403 })));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.layers).toEqual(expect.arrayContaining([expect.objectContaining({
      id: "service",
      transport: "Node.js",
      checks: expect.arrayContaining([
      expect.objectContaining({ id: "network", ok: true, status: 200 }),
      expect.objectContaining({ id: "github", ok: false, failureKind: "dns", detail: "域名无法解析（DNS）。" }),
      expect.objectContaining({ id: "huggingface", ok: false, status: 403, failureKind: "http" }),
      ]),
    })]));
  });

  it("reports the Electron transport and device-level guidance when every check fails", async () => {
    (globalThis as typeof globalThis & { __studyDeskNetworkTransport?: unknown }).__studyDeskNetworkTransport = "electron";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENETUNREACH" } })));

    const response = await GET();
    const body = await response.json();

    expect(body.layers[0]).toMatchObject({ id: "service", transport: "Electron / Chromium" });
    expect(body.layers[0].checks).toHaveLength(3);
    expect(body.layers[0].checks.every((item: { failureKind?: string }) => item.failureKind === "connection")).toBe(true);
    expect(body.guidance).toContain("Windows 防火墙");
  });
});
