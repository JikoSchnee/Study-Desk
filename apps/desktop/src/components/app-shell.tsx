"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpenCheck, ClipboardList, Cloud, CloudAlert, CloudOff, LibraryBig, Maximize2, Minimize2, Settings, ShoppingBag, Square, X } from "lucide-react";
import { SemanticModelPrewarm } from "@/components/semantic-model-prewarm";
import { DesktopUpdatePrompt } from "@/components/desktop-update-notice";
import packageJson from "../../../../package.json";

const appVersion = packageJson.version;

const nav = [
  ["/", "今日", ClipboardList],
  ["/library", "藏品", LibraryBig],
  ["/review", "学习", BookOpenCheck],
  ["/community", "社区", ShoppingBag],
  ["/settings", "设置", Settings],
] as const;

function navActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

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
  const [cloudSync, setCloudSync] = useState<{ provider: "supabase"; enabled: boolean; configured: boolean; signedIn: boolean; lastSyncedAt: string | null; nextSyncAt?: string | null; lastError: string | null; pausedReason?: string | null } | null>(null);

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
        const response = await fetch("/api/supabase-sync", { cache: "no-store" });
        if (!response.ok) throw new Error("无法读取同步状态。");
        const data = await response.json() as { status: { enabled: boolean; signedIn: boolean; lastSyncedAt: string | null; nextSyncAt: string | null; lastError: string | null } };
        const desktopSession = await window.mockInterviewDesktop?.supabaseSync.sessionStatus();
        const sidebar: NonNullable<typeof cloudSync> = { provider: "supabase", enabled: data.status.enabled, configured: true, signedIn: desktopSession?.signedIn ?? data.status.signedIn, lastSyncedAt: data.status.lastSyncedAt, nextSyncAt: data.status.nextSyncAt, lastError: data.status.lastError };
        if (active) setCloudSync(sidebar);
      } catch {
        if (active) setCloudSync({ provider: "supabase", enabled: true, configured: true, signedIn: false, lastSyncedAt: null, lastError: "无法读取账号同步状态。" });
      }
    };
    const unsubscribeMagicLink = window.mockInterviewDesktop?.supabaseSync.onMagicLink(() => { void read(); });
    const unsubscribeSessionChange = window.mockInterviewDesktop?.supabaseSync.onSessionChange(() => { void read(); });
    void read();
    const timer = window.setInterval(() => void read(), 60_000);
    return () => { active = false; window.clearInterval(timer); unsubscribeMagicLink?.(); unsubscribeSessionChange?.(); };
  }, [isDesktop]);

  const nextSyncTitle = cloudSync?.nextSyncAt ? `下次自动同步：${new Date(cloudSync.nextSyncAt).toLocaleString("zh-CN")}` : "未安排下次自动同步。";
  const syncPresentation = !cloudSync ? { tone: "muted" as const, label: "正在读取同步状态", title: "正在读取云同步状态。" } : !cloudSync.enabled ? { tone: "muted" as const, label: "云同步已关闭", title: "云同步已关闭；点击前往设置。" } : !cloudSync.configured ? { tone: "muted" as const, label: "未登录账号", title: "请登录 Study Desk 账号后使用会员云同步。" } : !cloudSync.signedIn ? { tone: "warning" as const, label: "等待登录", title: "请完成云同步认证。" } : cloudSync.pausedReason ? { tone: "warning" as const, label: "同步已暂停", title: cloudSync.pausedReason } : cloudSync.lastError ? { tone: "error" as const, label: "同步异常", title: cloudSync.lastError } : cloudSync.lastSyncedAt ? { tone: "healthy" as const, label: `已同步 · ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(cloudSync.lastSyncedAt))}`, title: `最近同步：${new Date(cloudSync.lastSyncedAt).toLocaleString("zh-CN")}\n${nextSyncTitle}` } : { tone: "warning" as const, label: "等待首次同步", title: `同步器已配置，尚未完成首次同步。${nextSyncTitle}` };
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
      <nav>{nav.map(([href, label, Icon]) => <Link key={href} href={href} data-tour={tourTargetForNav(href)} className={navActive(pathname, href) ? "nav-item active" : "nav-item"}><Icon size={20} /><span>{label}</span></Link>)}</nav>
      <div className="nav-footer"><p className="nav-note">每天把一个知识点，练成一句能说清的话。</p>{isDesktop && <Link href="/settings?section=backup-sync" className={`cloud-sync-nav ${syncPresentation.tone}`} title={syncPresentation.title} aria-label={syncPresentation.title}><SyncIcon size={17}/><span>{syncPresentation.label}</span></Link>}</div>
    </aside>
    <main className="page-main" data-tour="page-main">{children}</main>
    <DesktopUpdatePrompt />
    {serverError && <div className="desktop-server-error" role="alert">{serverError}</div>}
    <nav className="bottom-nav" aria-label="移动端主导航">{nav.map(([href, label, Icon]) => <Link key={href} href={href} data-tour={tourTargetForNav(href)} className={navActive(pathname, href) ? "active" : ""}><Icon size={20}/><span>{label}</span></Link>)}</nav>
  </div>;
}
