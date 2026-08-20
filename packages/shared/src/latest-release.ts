export type ReleaseAsset = {
  name?: unknown;
  size?: unknown;
  browser_download_url?: unknown;
};

export type ReleaseDownload = {
  name: string;
  size: number;
  url: string;
};

export type ReleaseDownloads = {
  windows: ReleaseDownload | null;
  macArm64: ReleaseDownload | null;
};

export type LatestRelease = {
  latestVersion: string;
  url: string;
  releaseNotes: string;
  downloads: ReleaseDownloads;
};

function downloadFromAsset(asset: ReleaseAsset | undefined): ReleaseDownload | null {
  if (!asset || typeof asset.name !== "string" || typeof asset.browser_download_url !== "string") return null;
  if (!asset.browser_download_url.startsWith("https://github.com/JikoSchnee/Study-Desk/releases/download/")) return null;
  return {
    name: asset.name,
    size: typeof asset.size === "number" && Number.isFinite(asset.size) && asset.size >= 0 ? asset.size : 0,
    url: asset.browser_download_url,
  };
}

export function selectReleaseDownloads(assets: ReleaseAsset[]): ReleaseDownloads {
  return {
    windows: downloadFromAsset(assets.find((asset) => typeof asset.name === "string" && /^Study-Desk-Setup-.*\.exe$/i.test(asset.name))),
    macArm64: downloadFromAsset(assets.find((asset) => typeof asset.name === "string" && /^Study-Desk-.*-mac-arm64\.dmg$/i.test(asset.name))),
  };
}

export function preferredDesktopPlatform(userAgent: string): keyof ReleaseDownloads | null {
  if (/windows/i.test(userAgent)) return "windows";
  if (/macintosh|mac os x/i.test(userAgent)) return "macArm64";
  return null;
}
