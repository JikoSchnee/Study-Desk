import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, LocalApiError, readJsonResponse } from "@/lib/client-api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("local JSON responses", () => {
  it("returns a successful JSON payload", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    await expect(readJsonResponse(response, "测试请求")).resolves.toEqual({ ok: true });
  });

  it("uses the JSON error returned by the API", async () => {
    const response = new Response(JSON.stringify({ error: "本地数据库组件无法加载，请安装修复版本后重试。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    await expect(readJsonResponse(response, "测试请求")).rejects.toMatchObject({
      kind: "http",
      status: 500,
      message: "本地数据库组件无法加载，请安装修复版本后重试。",
    });
  });

  it.each([
    ["text/html", "<!DOCTYPE html><title>Error</title>", "本地服务返回了错误页面。"],
    ["text/plain", "not-json", "本地服务返回了无法识别的数据。"],
  ])("turns a malformed %s response into a readable error", async (contentType, body, message) => {
    const response = new Response(body, { status: 500, headers: { "Content-Type": contentType } });
    await expect(readJsonResponse(response, "测试请求")).rejects.toMatchObject({ kind: "invalid-response", status: 500, message: expect.stringContaining(message) });
  });
});

describe("local JSON requests", () => {
  it("reports a timeout distinctly", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const request = fetchJson("/api/test", { label: "测试请求", timeoutMs: 1_000 });
    const assertion = expect(request).rejects.toMatchObject({ kind: "timeout" } satisfies Partial<LocalApiError>);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("preserves a caller cancellation instead of reporting a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_input, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const request = fetchJson("/api/test", { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
