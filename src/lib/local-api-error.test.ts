import { afterEach, describe, expect, it, vi } from "vitest";
import { isNativeAddonError, localApiErrorResponse } from "@/lib/local-api-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("local API errors", () => {
  it("recognizes a better-sqlite3 ABI mismatch", () => {
    const error = new Error("better_sqlite3.node was compiled using NODE_MODULE_VERSION 127. This version requires NODE_MODULE_VERSION 148.");
    expect(isNativeAddonError(error)).toBe(true);
  });

  it("returns a safe message while logging the original native error", async () => {
    const error = new Error("better_sqlite3.node was compiled against a different Node.js version using NODE_MODULE_VERSION 127.");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = localApiErrorResponse("Failed to load SQLite", error, "无法读取本地数据。");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "本地数据库组件无法加载，请安装修复版本后重试。" });
    expect(logged).toHaveBeenCalledWith("Failed to load SQLite", error);
  });
});
