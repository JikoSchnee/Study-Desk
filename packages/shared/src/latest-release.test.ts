import { describe, expect, it } from "vitest";

import { preferredDesktopPlatform, selectReleaseDownloads } from "./latest-release";

const url = (name: string) => `https://github.com/JikoSchnee/Study-Desk/releases/download/v1.7.1/${name}`;

describe("latest release downloads", () => {
  it("selects only the Windows installer and Apple Silicon DMG", () => {
    const downloads = selectReleaseDownloads([
      { name: "builder-debug.yml", size: 10, browser_download_url: url("builder-debug.yml") },
      { name: "Study-Desk-Setup-1.7.1.exe.blockmap", size: 20, browser_download_url: url("Study-Desk-Setup-1.7.1.exe.blockmap") },
      { name: "Study-Desk-1.7.1-mac-arm64.dmg.blockmap", size: 30, browser_download_url: url("Study-Desk-1.7.1-mac-arm64.dmg.blockmap") },
      { name: "Study-Desk-Setup-1.7.1.exe", size: 152_000_000, browser_download_url: url("Study-Desk-Setup-1.7.1.exe") },
      { name: "Study-Desk-1.7.1-mac-arm64.dmg", size: 191_000_000, browser_download_url: url("Study-Desk-1.7.1-mac-arm64.dmg") },
    ]);

    expect(downloads.windows).toEqual({ name: "Study-Desk-Setup-1.7.1.exe", size: 152_000_000, url: url("Study-Desk-Setup-1.7.1.exe") });
    expect(downloads.macArm64).toEqual({ name: "Study-Desk-1.7.1-mac-arm64.dmg", size: 191_000_000, url: url("Study-Desk-1.7.1-mac-arm64.dmg") });
  });

  it("returns null for absent, malformed, or untrusted assets", () => {
    expect(selectReleaseDownloads([
      { name: "Study-Desk-Setup-1.7.1.exe", size: 1, browser_download_url: "https://example.com/fake.exe" },
      { name: "Study-Desk-1.7.1-mac-x64.dmg", size: 1, browser_download_url: url("Study-Desk-1.7.1-mac-x64.dmg") },
    ])).toEqual({ windows: null, macArm64: null });
  });

  it("recommends a desktop platform without hiding the other option", () => {
    expect(preferredDesktopPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(preferredDesktopPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macArm64");
    expect(preferredDesktopPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBeNull();
  });
});
