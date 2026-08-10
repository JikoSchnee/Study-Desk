import { describe, expect, it } from "vitest";
import { cloudSyncSidebarPresentation } from "./cloud-sync-status";

const ready = { passwordConfigured: true, lastSyncedAt: null, pausedReason: null, lastError: null };

describe("cloud sync sidebar presentation", () => {
  it("describes missing setup and disabled sync", () => {
    expect(cloudSyncSidebarPresentation({ enabled: true, url: "" }, ready).label).toBe("未配置云同步");
    expect(cloudSyncSidebarPresentation({ enabled: false, url: "https://dav.example.com" }, ready).label).toBe("云同步已关闭");
  });

  it("prioritizes credentials, pauses, and errors", () => {
    expect(cloudSyncSidebarPresentation({ enabled: true, url: "https://dav.example.com" }, { ...ready, passwordConfigured: false }).label).toBe("等待配置密码");
    expect(cloudSyncSidebarPresentation({ enabled: true, url: "https://dav.example.com" }, { ...ready, pausedReason: "空间已满" }).label).toBe("同步已暂停");
    expect(cloudSyncSidebarPresentation({ enabled: true, url: "https://dav.example.com" }, { ...ready, lastError: "网络错误" }).label).toBe("同步异常");
  });

  it("shows the latest successful sync or a first-sync prompt", () => {
    expect(cloudSyncSidebarPresentation({ enabled: true, url: "https://dav.example.com" }, ready).label).toBe("等待首次同步");
    const result = cloudSyncSidebarPresentation({ enabled: true, url: "https://dav.example.com" }, { ...ready, lastSyncedAt: "2026-08-10T06:30:00.000Z" });
    expect(result.tone).toBe("healthy");
    expect(result.label).toMatch(/^已同步 · /);
  });
});
