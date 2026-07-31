"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type UpdateCheckResult = { state: "current"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string } | { state: "available"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string } | { state: "error"; currentVersion: string; message: string; url?: string };

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
  return <aside className="desktop-update-prompt" role="status" aria-label="发现新版本"><button className="icon-close" type="button" aria-label="关闭更新提示" onClick={dismissUpdatePrompt}><X size={16}/></button><strong>有新版本：v{updateResult.latestVersion}</strong><span>当前版本：v{updateResult.currentVersion}</span><div><b>更新内容</b><ReleaseNotes notes={updateResult.releaseNotes}/></div><a className="button" href={updateResult.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> 前往下载页</a></aside>;
}
