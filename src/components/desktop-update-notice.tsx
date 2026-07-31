"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

export type UpdateCheckResult = { state: "current"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string } | { state: "available"; currentVersion: string; latestVersion: string; url: string; releaseNotes: string } | { state: "error"; currentVersion: string; message: string; url?: string };

type DesktopUpdateContextValue = { updateResult: UpdateCheckResult | null; setUpdateResult(result: UpdateCheckResult | null): void; lastCheckedAt: Date | null; setLastCheckedAt(date: Date | null): void; dismissUpdate(): void };
const DesktopUpdateContext = createContext<DesktopUpdateContextValue | null>(null);
const updateStatusStorageKey = "study-desk.update-status";
const releaseNoteTags = new Set(["a", "b", "blockquote", "br", "code", "del", "details", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "li", "ol", "p", "pre", "small", "span", "strong", "summary", "table", "tbody", "td", "th", "thead", "tr", "u", "ul"]);

function isHtmlReleaseNotes(notes: string) { return /<\/?[a-z][^>]*>/i.test(notes); }
function sanitizeReleaseNotesHtml(notes: string) {
  if (typeof window === "undefined") return "";
  const document = new DOMParser().parseFromString(notes, "text/html");
  document.querySelectorAll("script, style, iframe, object, embed, link, meta, base, form, input, button, textarea, select").forEach((element) => element.remove());
  document.body.querySelectorAll("*").forEach((element) => {
    if (!releaseNoteTags.has(element.tagName.toLowerCase())) { element.replaceWith(...Array.from(element.childNodes)); return; }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const isAllowedLinkAttribute = element.tagName === "A" && ["href", "title"].includes(name);
      const isAllowedGenericAttribute = name === "title" || name.startsWith("aria-");
      if (!isAllowedLinkAttribute && !isAllowedGenericAttribute) element.removeAttribute(attribute.name);
    }
    if (element.tagName === "A") {
      const href = element.getAttribute("href")?.trim() ?? "";
      if (href && !/^(https?:|mailto:|#|\/)/i.test(href)) element.removeAttribute("href");
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer");
    }
  });
  return document.body.innerHTML;
}

export function ReleaseNotes({ notes }: { notes: string }) {
  return <div className="desktop-release-notes">{isHtmlReleaseNotes(notes) ? <div dangerouslySetInnerHTML={{ __html: sanitizeReleaseNotesHtml(notes) }} /> : <pre>{notes}</pre>}</div>;
}

export function DesktopUpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(updateStatusStorageKey) ?? "null") as { updateResult?: UpdateCheckResult; lastCheckedAt?: string } | null;
      if (saved?.updateResult) setUpdateResult(saved.updateResult);
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
      if (!updateResult) window.sessionStorage.removeItem(updateStatusStorageKey);
      else window.sessionStorage.setItem(updateStatusStorageKey, JSON.stringify({ updateResult, lastCheckedAt: lastCheckedAt?.toISOString() }));
    } catch { /* Storage may be unavailable in a restricted browser context. */ }
  }, [lastCheckedAt, storageLoaded, updateResult]);

  const dismissUpdate = () => { setUpdateResult(null); setLastCheckedAt(null); };
  return <DesktopUpdateContext.Provider value={{ updateResult, setUpdateResult, lastCheckedAt, setLastCheckedAt, dismissUpdate }}>{children}</DesktopUpdateContext.Provider>;
}

export function useDesktopUpdate() {
  const value = useContext(DesktopUpdateContext);
  if (!value) throw new Error("useDesktopUpdate must be used within DesktopUpdateProvider.");
  return value;
}

export function DesktopUpdatePrompt() {
  const { updateResult, dismissUpdate } = useDesktopUpdate();
  if (updateResult?.state !== "available") return null;
  return <aside className="desktop-update-prompt" role="status" aria-label="发现新版本"><button className="icon-close" type="button" aria-label="关闭更新提示" onClick={dismissUpdate}><X size={16}/></button><strong>有新版本：v{updateResult.latestVersion}</strong><span>当前版本：v{updateResult.currentVersion}</span><div><b>更新内容</b><ReleaseNotes notes={updateResult.releaseNotes}/></div><a className="button" href={updateResult.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> 前往下载页</a></aside>;
}
