"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw, RotateCcw, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Panel } from "@/components/ui";

export type UpdateCheckResult =
  | { state: "current"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "available"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "downloading"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string; percent: number }
  | { state: "downloaded"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string }
  | { state: "error"; currentVersion: string; message: string; url?: string };

type DesktopUpdateContextValue = { updateResult: UpdateCheckResult | null; setUpdateResult(result: UpdateCheckResult | null): void; lastCheckedAt: Date | null; setLastCheckedAt(date: Date | null): void; isUpdatePromptVisible: boolean; dismissUpdatePrompt(): void };
const DesktopUpdateContext = createContext<DesktopUpdateContextValue | null>(null);
const updateStatusStorageKey = "study-desk.update-status";
export function ReleaseNotes({ notes }: { notes: string }) {
  return <div className="desktop-release-notes readme-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children, ...props }) => <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>,
  }}>{notes}</ReactMarkdown></div>;
}

export function DesktopUpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [isUpdatePromptVisible, setIsUpdatePromptVisible] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    try {
      // localStorage survives an app restart; sessionStorage is read once to carry
      // forward update reports saved by earlier versions of the app.
      const savedJson = window.localStorage.getItem(updateStatusStorageKey) ?? window.sessionStorage.getItem(updateStatusStorageKey) ?? "null";
      const saved = JSON.parse(savedJson) as { updateResult?: UpdateCheckResult; lastCheckedAt?: string; updatePromptDismissed?: boolean } | null;
      if (saved?.updateResult) setUpdateResult(saved.updateResult);
      if (saved?.updateResult?.state === "available") setIsUpdatePromptVisible(!saved.updatePromptDismissed);
      if (saved?.lastCheckedAt) {
        const date = new Date(saved.lastCheckedAt);
        if (!Number.isNaN(date.getTime())) setLastCheckedAt(date);
      }
    } catch { /* A missing or malformed saved status should not block update checks. */ }
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!window.mockInterviewDesktop) return;
    const receiveStatus = (status: UpdateCheckResult) => {
      replaceUpdateResult(status as UpdateCheckResult);
      setLastCheckedAt(new Date());
    };
    const unsubscribe = window.mockInterviewDesktop.updates.onStatus(receiveStatus);
    void window.mockInterviewDesktop.updates.status().then((status) => { if (status) receiveStatus(status as UpdateCheckResult); });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      if (!updateResult) window.localStorage.removeItem(updateStatusStorageKey);
      else window.localStorage.setItem(updateStatusStorageKey, JSON.stringify({ updateResult, lastCheckedAt: lastCheckedAt?.toISOString(), updatePromptDismissed: updateResult.state === "available" && !isUpdatePromptVisible }));
      window.sessionStorage.removeItem(updateStatusStorageKey);
    } catch { /* Storage may be unavailable in a restricted browser context. */ }
  }, [isUpdatePromptVisible, lastCheckedAt, storageLoaded, updateResult]);

  const replaceUpdateResult = (result: UpdateCheckResult | null) => {
    setUpdateResult(result);
    setIsUpdatePromptVisible(result?.state === "available");
  };
  const dismissUpdatePrompt = () => setIsUpdatePromptVisible(false);
  return <DesktopUpdateContext.Provider value={{ updateResult, setUpdateResult: replaceUpdateResult, lastCheckedAt, setLastCheckedAt, isUpdatePromptVisible, dismissUpdatePrompt }}>{children}</DesktopUpdateContext.Provider>;
}

export function useDesktopUpdate() {
  const value = useContext(DesktopUpdateContext);
  if (!value) throw new Error("useDesktopUpdate must be used within DesktopUpdateProvider.");
  return value;
}

export function DesktopUpdatePrompt() {
  const { updateResult, isUpdatePromptVisible, dismissUpdatePrompt } = useDesktopUpdate();
  if (updateResult?.state !== "available" || !isUpdatePromptVisible) return null;
  return <aside className="desktop-update-prompt" role="status" aria-label="发现新版本"><button className="icon-close" type="button" aria-label="关闭更新提示" onClick={dismissUpdatePrompt}><X size={16}/></button><strong>有新版本：v{updateResult.latestVersion}</strong><span>当前版本：v{updateResult.currentVersion}</span><div><b>更新内容</b><ReleaseNotes notes={updateResult.releaseNotes}/></div><UpdateActions result={updateResult} compact /></aside>;
}

function UpdateActions({ result, compact = false }: { result: Extract<UpdateCheckResult, { state: "available" | "downloading" | "downloaded" }>; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const download = async () => { setBusy(true); try { await window.mockInterviewDesktop?.updates.download(); } finally { setBusy(false); } };
  const install = async () => { setBusy(true); try { await window.mockInterviewDesktop?.updates.install(); } finally { setBusy(false); } };
  if (result.state === "downloading") return <div className="desktop-download-progress" aria-live="polite"><progress value={result.percent} max={100}/><span>正在下载更新：{Math.round(result.percent)}%</span></div>;
  if (result.state === "downloaded") return <div className="form-actions"><Button type="button" disabled={busy} onClick={() => void install()}><RotateCcw size={16}/>立即重启并安装</Button>{!compact && <span className="field-help">更新已下载完成，重启时会自动安装。</span>}</div>;
  return <Button type="button" disabled={busy} onClick={() => void download()}><Download size={16}/>{busy ? "正在启动下载…" : "下载更新"}</Button>;
}

export function DesktopUpdatePanel({ isDesktop, checking, onCheck, webRelease, webReleaseError }: { isDesktop: boolean; checking: boolean; onCheck(): void; webRelease: { latestVersion: string; url: string; releaseNotes: string } | null; webReleaseError: string }) {
  const { updateResult, lastCheckedAt } = useDesktopUpdate();
  return <Panel className="desktop-updater"><div className="desktop-updater-heading"><div><p className="eyebrow"><Download size={15}/> 桌面应用</p><h2>{isDesktop ? "应用更新" : "最新发布"}</h2></div>{isDesktop && <Button type="button" variant="outline" disabled={checking} onClick={onCheck}><RefreshCw size={16}/>{checking ? "正在检查…" : "检查更新"}</Button>}</div>{!isDesktop && webReleaseError && <div className="desktop-update-error" role="status"><p>{webReleaseError}</p></div>}{!isDesktop && webRelease && <div className="desktop-update-card" role="status"><div><strong>最新版本：v{webRelease.latestVersion}</strong><span>来自 GitHub Releases</span></div><div aria-label={`v${webRelease.latestVersion} 更新内容`}><strong>更新内容</strong><ReleaseNotes notes={webRelease.releaseNotes}/></div><a className="button" href={webRelease.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> 打开 Releases 页面</a></div>}{updateResult?.state === "error" && <div className="desktop-update-error" role="status"><p>{updateResult.message}</p>{updateResult.url && <a href={updateResult.url} target="_blank" rel="noreferrer"><ExternalLink size={15}/> 打开 Releases 下载页</a>}</div>}{updateResult?.state === "current" && <div className="desktop-update-card" role="status"><p className="desktop-update-ok">已是最新版本：v{updateResult.currentVersion}{lastCheckedAt ? ` · 最后检查：${lastCheckedAt.toLocaleString()}` : ""}</p><div aria-label={`v${updateResult.currentVersion} 本次更新内容`}><strong>本次更新内容</strong><ReleaseNotes notes={updateResult.releaseNotes}/></div></div>}{(updateResult?.state === "available" || updateResult?.state === "downloading" || updateResult?.state === "downloaded") && <div className="desktop-update-card" role="status"><div><strong>{updateResult.state === "downloaded" ? "更新已下载：" : "有新版本："}v{updateResult.latestVersion}</strong><span>当前版本：v{updateResult.currentVersion}</span></div><div aria-label={`v${updateResult.latestVersion} 更新内容`}><strong>更新内容</strong><ReleaseNotes notes={updateResult.releaseNotes}/></div><UpdateActions result={updateResult}/></div>}</Panel>;
}
