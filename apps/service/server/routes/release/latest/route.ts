import { NextResponse } from "next/server";
import { selectReleaseDownloads, type ReleaseAsset } from "@shared/latest-release";

const LATEST_RELEASE_URL = "https://api.github.com/repos/JikoSchnee/Study-Desk/releases/latest";
const RELEASE_TIMEOUT_MS = 10_000;

function unavailable(message: string) {
  return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, RELEASE_TIMEOUT_MS);

  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      next: { revalidate: 300 },
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Study-Desk" },
    });
    if (!response.ok) return unavailable("暂时无法获取最新更新报告，请稍后重试。");

    const release = await response.json() as { tag_name?: unknown; html_url?: unknown; body?: unknown; assets?: unknown };
    if (typeof release.tag_name !== "string" || !release.tag_name.trim() || typeof release.html_url !== "string" || !release.html_url.trim()) return unavailable("GitHub 返回的最新发布信息不完整，请稍后重试。");
    const assets = Array.isArray(release.assets) ? release.assets as ReleaseAsset[] : [];
    return NextResponse.json({
      latestVersion: release.tag_name.replace(/^v/, ""),
      url: release.html_url,
      releaseNotes: typeof release.body === "string" && release.body.trim() ? release.body.trim() : "此版本暂未提供更新说明。",
      downloads: selectReleaseDownloads(assets),
    }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  } catch {
    return unavailable(timedOut ? "读取最新更新报告超时，请检查网络后重试。" : "无法连接 GitHub 获取最新更新报告，请检查网络后重试。");
  } finally {
    clearTimeout(timeout);
  }
}
