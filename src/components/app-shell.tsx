"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpenCheck, ClipboardList, Cloud, CloudAlert, CloudOff, LibraryBig, Maximize2, Minimize2, Settings, Square, X } from "lucide-react";
import { SemanticModelPrewarm } from "@/components/semantic-model-prewarm";
import { DesktopUpdatePrompt } from "@/components/desktop-update-notice";
import { cloudSyncSidebarPresentation, type CloudSyncSidebarConfig, type CloudSyncSidebarStatus } from "@/lib/cloud-sync-status";
import { version as appVersion } from "../../package.json";

const nav = [
  ["/", "今日", ClipboardList],
  ["/library", "藏品", LibraryBig],
  ["/review", "学习", BookOpenCheck],
  ["/settings", "设置", Settings],
] as const;

function tourTargetForNav(href: string) {
  if (href === "/review") return "nav-review";
  if (href === "/library") return "nav-library";
  return undefined;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWindowsDesktop = typeof window !== "undefined" && window.mockInterviewDesktop?.platform === "win32";
  const [maximized, setMaximized] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const [cloudSync, setCloudSync] = useState<{ config: CloudSyncSidebarConfig; status: CloudSyncSidebarStatus } | null>(null);

  useEffect(() => {
    if (!isWindowsDesktop) return;
    void window.mockInterviewDesktop?.window.isMaximized().then(setMaximized);
    return window.mockInterviewDesktop?.window.onMaximizeChange(setMaximized);
  }, [isWindowsDesktop]);
  useEffect(() => window.mockInterviewDesktop?.server.onStatus((status) => {
    setServerError(status.state === "error" ? status.message : "");
  }), []);
  useEffect(() => {
    setIsDesktop(Boolean(window.mockInterviewDesktop) || window.navigator.userAgent.includes("Electron"));
  }, []);
  useEffect(() => {
    if (!isDesktop) return;
    let active = true;
    const read = async () => {
      try {
        const response = await fetch("/api/cloud-sync", { cache: "no-store" });
        if (!response.ok) throw new Error("无法读取同步状态。");
        const data = await response.json() as { config: CloudSyncSidebarConfig; status: CloudSyncSidebarStatus };
        if (active) setCloudSync(data);
      } catch {
        if (active) setCloudSync({ config: { enabled: true, url: "configured" }, status: { passwordConfigured: true, lastSyncedAt: null, pausedReason: null, lastError: "无法读取同步状态。" } });
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isDesktop]);

  const syncPresentation = cloudSync ? cloudSyncSidebarPresentation(cloudSync.config, cloudSync.status) : { tone: "muted" as const, label: "正在读取同步状态", title: "正在读取云同步状态。" };
  const SyncIcon = syncPresentation.tone === "error" ? CloudAlert : syncPresentation.tone === "muted" ? CloudOff : Cloud;

  return <div className={isWindowsDesktop ? "app-frame desktop-windows" : "app-frame"}>
    <SemanticModelPrewarm />
    {isWindowsDesktop && <header className="windows-titlebar" aria-label="窗口控制区">
      <div className="windows-drag-region" />
      <div className="windows-controls" aria-label="窗口控制">
        <button type="button" className="window-control minimize" aria-label="最小化窗口" title="最小化" onClick={() => void window.mockInterviewDesktop?.window.minimize()}><Minimize2 size={16} strokeWidth={2.8}/></button>
        <button type="button" className="window-control maximize" aria-label={maximized ? "还原窗口" : "最大化窗口"} title={maximized ? "还原" : "最大化"} onClick={() => void window.mockInterviewDesktop?.window.toggleMaximize()}>{maximized ? <Square size={14} strokeWidth={2.8}/> : <Maximize2 size={16} strokeWidth={2.8}/>}</button>
        <button type="button" className="window-control close" aria-label="关闭窗口" title="关闭" onClick={() => void window.mockInterviewDesktop?.window.close()}><X size={17} strokeWidth={3}/></button>
      </div>
    </header>}
    <aside className="side-nav" aria-label="主导航">
      <Link href="/" className="brand"><span>S</span><div><b>Study Desk</b><small>v{appVersion}</small></div></Link>
      <nav>{nav.map(([href, label, Icon]) => <Link key={href} href={href} data-tour={tourTargetForNav(href)} className={pathname === href ? "nav-item active" : "nav-item"}><Icon size={20} /><span>{label}</span></Link>)}</nav>
      <div className="nav-footer"><p className="nav-note">每天把一个知识点，练成一句能说清的话。</p>{isDesktop && <Link href="/settings?section=backup-sync" className={`cloud-sync-nav ${syncPresentation.tone}`} title={syncPresentation.title} aria-label={syncPresentation.title}><SyncIcon size={17}/><span>{syncPresentation.label}</span></Link>}</div>
    </aside>
    <main className="page-main" data-tour="page-main">{children}</main>
    <DesktopUpdatePrompt />
    {serverError && <div className="desktop-server-error" role="alert">{serverError}</div>}
    <nav className="bottom-nav" aria-label="移动端主导航">{nav.map(([href, label, Icon]) => <Link key={href} href={href} data-tour={tourTargetForNav(href)} className={pathname === href ? "active" : ""}><Icon size={20}/><span>{label}</span></Link>)}</nav>
  </div>;
}
