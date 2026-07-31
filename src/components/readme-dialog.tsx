"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle, BookOpenText, LoaderCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui";
import { fetchJson } from "@/lib/client-api";

type ReadmeResponse = { content: string };

export function ReadmeDialog({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setContent("");
    void fetchJson<ReadmeResponse>("/api/readme", { cache: "no-store", timeoutMs: 15_000, signal: controller.signal, label: "读取最新 README" })
      .then((data) => setContent(data.content))
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "读取最新 README 失败，请重试。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="readme-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="readme-dialog" role="dialog" aria-modal="true" aria-labelledby="readme-title" aria-describedby="readme-description">
      <button className="icon-close" type="button" onClick={onClose} aria-label="关闭 README"><X size={19}/></button>
      <header className="readme-dialog-heading">
        <span><BookOpenText size={23}/></span>
        <div><p className="eyebrow">在线使用说明</p><h2 id="readme-title">README</h2><p id="readme-description">每次打开都会从 GitHub 读取最新版本。</p></div>
      </header>
      <div className="readme-dialog-content" aria-live="polite">
        {loading && <div className="readme-loading"><LoaderCircle size={24}/><p>正在获取最新 README…</p></div>}
        {!loading && error && <div className="readme-error" role="alert"><AlertCircle size={21}/><div><strong>README 暂时无法加载</strong><p>{error}</p><Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16}/> 重试</Button></div></div>}
        {!loading && !error && <article className="readme-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          a: ({ href, children, ...props }) => <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>,
          img: ({ alt, ...props }) => (
            // README 图片来自外部 Markdown，无法预先限定 Next Image 允许的域名。
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={alt ?? ""} {...props} />
          ),
        }}>{content}</ReactMarkdown></article>}
      </div>
    </section>
  </div>;
}
