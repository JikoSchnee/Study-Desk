import { describe, expect, it, vi } from "vitest";
import { installNetworkFetch, isHttpRequest } from "./network-fetch.cjs";

describe("desktop network fetch hook", () => {
  it("uses Electron networking for HTTP(S) requests", async () => {
    const electronFetch = vi.fn().mockResolvedValue("electron response");
    const nativeFetch = vi.fn();
    const target = {};
    const fetch = installNetworkFetch({ electronFetch, nativeFetch, target });

    await expect(fetch("https://example.com/model")).resolves.toBe("electron response");
    expect(electronFetch).toHaveBeenCalledWith("https://example.com/model", undefined);
    expect(nativeFetch).not.toHaveBeenCalled();
    expect(target.__studyDeskNetworkTransport).toBe("electron");
  });

  it("keeps non-HTTP schemes on Node's native fetch", async () => {
    const electronFetch = vi.fn();
    const nativeFetch = vi.fn().mockResolvedValue("native response");
    const fetch = installNetworkFetch({ electronFetch, nativeFetch, target: {} });

    await expect(fetch("data:text/plain,offline")).resolves.toBe("native response");
    expect(nativeFetch).toHaveBeenCalledWith("data:text/plain,offline", undefined);
    expect(electronFetch).not.toHaveBeenCalled();
    expect(isHttpRequest("file:///tmp/model")).toBe(false);
  });
});
