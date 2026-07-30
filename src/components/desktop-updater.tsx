"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Download, RefreshCw, Rocket, X } from "lucide-react";
import { Button, Panel } from "@/components/ui";

type UpdaterStatus =
  | { state: "idle" | "checking" | "not-available" | "development" | "ignored" }
  | { state: "available" | "downloaded"; version: string; notes: string }
  | { state: "downloading"; percent: number; transferred: number; total: number }
  | { state: "error"; message: string };

function bytes(value: number) { return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

const releaseNoteTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "pre", "code", "strong", "b", "em", "i", "a", "br", "blockquote", "hr"]);

function releaseNoteNode(node: ChildNode, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const children = [...element.childNodes].map((child, index) => releaseNoteNode(child, `${key}-${index}`));
  if (!releaseNoteTags.has(tag)) return children;
  if (tag === "br" || tag === "hr") return tag === "br" ? <br key={key}/> : <hr key={key}/>;
  if (tag === "a") {
    const href = element.getAttribute("href") ?? "";
    return /^https?:\/\//i.test(href) ? <a key={key} href={href} target="_blank" rel="noreferrer">{children}</a> : <span key={key}>{children}</span>;
  }
  const Tag = tag === "b" ? "strong" : tag === "i" ? "em" : tag;
  return <Tag key={key}>{children}</Tag>;
}

function ReleaseNotes({ notes }: { notes: string }) {
  const [content, setContent] = useState<ReactNode>(null);

  useEffect(() => {
    const document = new DOMParser().parseFromString(notes, "text/html");
    setContent([...document.body.childNodes].map((node, index) => releaseNoteNode(node, String(index))));
  }, [notes]);

  return <div className="desktop-release-notes">{content}</div>;
}

export function DesktopUpdater() {
  const [desktop, setDesktop] = useState(false);
  const [status, setStatus] = useState<UpdaterStatus>({ state: "idle" });

  useEffect(() => {
    const api = window.mockInterviewDesktop;
    if (!api) return;
    setDesktop(true);
    return api.updater.onStatus((next) => setStatus(next as UpdaterStatus));
  }, []);

  const isAvailable = status.state === "available" || status.state === "downloading" || status.state === "downloaded";
  const release = status.state === "available" || status.state === "downloaded" ? status : null;

  return <Panel className="desktop-updater" aria-live="polite">
    <div className="desktop-updater-heading"><div><p className="eyebrow"><Rocket size={15}/> 桌面应用</p><h2>版本更新</h2></div><Button type="button" variant="outline" disabled={!desktop || status.state === "checking" || status.state === "downloading"} onClick={() => void window.mockInterviewDesktop?.updater.check()}><RefreshCw size={16}/>{status.state === "checking" ? "正在检查…" : "检查更新"}</Button></div>
    {!desktop && <p className="muted-copy">版本检查仅在桌面应用中可用。</p>}
    {desktop && <>{status.state === "idle" && <p className="muted-copy">应用会在启动后及每 6 小时检查一次稳定版更新。</p>}
    {status.state === "not-available" && <p className="desktop-update-ok"><CheckCircle2 size={17}/> 已是最新版本。</p>}
    {status.state === "development" && <p className="muted-copy">开发模式不检查 GitHub Releases。</p>}
    {status.state === "error" && <p className="desktop-update-error">更新检查失败：{status.message}</p>}
    {isAvailable && <div className="desktop-update-card">
      <div><strong>发现 v{release?.version ?? "新版本"}</strong><span>{status.state === "downloaded" ? "更新已下载完成，重启即可安装。" : status.state === "downloading" ? "正在下载更新包…" : "阅读更新说明后选择如何处理。"}</span></div>
      {release?.notes && <details><summary>查看 Release 说明</summary><ReleaseNotes notes={release.notes}/></details>}
      {status.state === "available" && <div className="form-actions"><Button type="button" onClick={() => void window.mockInterviewDesktop?.updater.download()}><Download size={16}/> 立即更新</Button><Button type="button" variant="warning" onClick={() => void window.mockInterviewDesktop?.updater.defer()}>下次启动时更新</Button><Button type="button" variant="danger" onClick={() => void window.mockInterviewDesktop?.updater.ignore()}><X size={16}/> 忽略此版本</Button></div>}
      {status.state === "downloading" && <div className="desktop-download-progress"><progress value={status.percent} max="100"/><span>{status.percent}% · {bytes(status.transferred)} / {bytes(status.total)}</span></div>}
      {status.state === "downloaded" && <Button type="button" onClick={() => void window.mockInterviewDesktop?.updater.install()}><Rocket size={16}/> 重启并安装</Button>}
    </div>}</>}
  </Panel>;
}

/** Global prompt so a new release is actionable without visiting Settings. */
export function DesktopUpdatePrompt() {
  const [status, setStatus] = useState<UpdaterStatus>({ state: "idle" });

  useEffect(() => {
    const api = window.mockInterviewDesktop;
    if (!api) return;
    return api.updater.onStatus((next) => setStatus(next as UpdaterStatus));
  }, []);

  if (status.state !== "available" && status.state !== "downloading" && status.state !== "downloaded") return null;
  const release = status.state === "available" || status.state === "downloaded" ? status : null;
  return <aside className="desktop-update-prompt" role="status" aria-live="polite">
    <strong>{status.state === "downloaded" ? `v${release?.version ?? "新版本"} 已下载` : status.state === "downloading" ? "正在下载更新" : `发现 v${release?.version ?? "新版本"}`}</strong>
    {release?.notes && <details><summary>查看 Release 说明</summary><ReleaseNotes notes={release.notes}/></details>}
    {status.state === "available" && <div><button type="button" className="button" onClick={() => void window.mockInterviewDesktop?.updater.download()}><Download size={15}/> 立即更新</button><button type="button" className="button warning" onClick={() => void window.mockInterviewDesktop?.updater.defer()}>下次启动</button><button type="button" className="button danger" onClick={() => void window.mockInterviewDesktop?.updater.ignore()}>忽略</button></div>}
    {status.state === "downloading" && <div className="desktop-download-progress"><progress value={status.percent} max="100"/><span>{status.percent}% · {bytes(status.transferred)} / {bytes(status.total)}</span></div>}
    {status.state === "downloaded" && <button type="button" className="button" onClick={() => void window.mockInterviewDesktop?.updater.install()}><Rocket size={15}/> 重启并安装</button>}
  </aside>;
}
