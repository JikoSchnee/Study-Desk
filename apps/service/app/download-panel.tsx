"use client";

import { useEffect, useState } from "react";
import { preferredDesktopPlatform, type LatestRelease, type ReleaseDownload, type ReleaseDownloads } from "@shared/latest-release";

const RELEASES_URL = "https://github.com/JikoSchnee/Study-Desk/releases";

function formatBytes(bytes: number) {
  if (!bytes) return "安装包";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function DownloadArrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg>;
}

function DownloadLink({ download, platform, recommended, label, detail }: {
  download: ReleaseDownload | null;
  platform: keyof ReleaseDownloads;
  recommended: boolean;
  label: string;
  detail: string;
}) {
  const direct = Boolean(download);
  return <a
    className={`download-link ${recommended ? "recommended" : ""}`}
    data-platform={platform}
    href={download?.url ?? RELEASES_URL}
    target="_blank"
    rel="noreferrer"
  >
    {recommended && <span className="recommended-stamp">适合当前设备</span>}
    <span className="download-icon"><DownloadArrow /></span>
    <span><strong>{label}</strong><small>{direct ? `${detail} · ${formatBytes(download!.size)}` : `${detail} · 前往 Releases`}</small></span>
  </a>;
}

export function DownloadPanel() {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [preferred, setPreferred] = useState<keyof ReleaseDownloads | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPreferred(preferredDesktopPlatform(window.navigator.userAgent));
    const controller = new AbortController();
    fetch("/api/release/latest", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<LatestRelease>;
      })
      .then(setRelease)
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, []);

  const downloads = release?.downloads ?? { windows: null, macArm64: null };
  return <section className="download-panel" id="download" aria-labelledby="download-title">
    <div className="download-heading">
      <div><p className="kicker">桌面应用</p><h2 id="download-title">带走你的学习桌</h2></div>
      <span className="version-pill" aria-live="polite">{release ? `v${release.latestVersion}` : "正在读取最新版"}</span>
    </div>
    <p className="download-copy">本地优先保存，离线也能整理和练习。安装包由 GitHub Releases 直接提供。</p>
    <div className="download-options">
      <DownloadLink download={downloads.windows} platform="windows" recommended={preferred === "windows"} label="Windows" detail="Windows 10 / 11" />
      <DownloadLink download={downloads.macArm64} platform="macArm64" recommended={preferred === "macArm64"} label="macOS" detail="仅 Apple 芯片" />
    </div>
    <p className="download-status" aria-live="polite">
      {failed ? <>暂时无法读取直链，按钮已安全回退到 <a href={RELEASES_URL} target="_blank" rel="noreferrer">GitHub Releases</a>。</> : release ? "最新版下载地址已就绪。" : "下载按钮可先前往 Releases，直链读取完成后会自动更新。"}
    </p>
    <div className="mac-note"><span>i</span><p><strong>使用 Intel Mac？</strong> 当前尚无 Intel 安装包，请不要下载 Apple 芯片版本。</p></div>
  </section>;
}
