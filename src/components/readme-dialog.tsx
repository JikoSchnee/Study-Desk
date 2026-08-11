"use client";

import { useEffect, useState, type ComponentType } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle, BookOpenText, LoaderCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui";
import { fetchJson } from "@/lib/client-api";

type ReadmeResponse = { content: string };

type DocumentationDialogProps = {
  onClose: () => void;
  endpoint?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  label?: string;
  Icon?: ComponentType<{ size?: number }>;
  tone?: "readme" | "agent";
  initialAnchor?: string;
};

function slug(value: string) { return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, ""); }
export function ReadmeDialog({ onClose, endpoint = "/api/readme", eyebrow = "在线使用说明", title = "README", description = "每次打开都会从 GitHub 读取最新版本。", label = "README", Icon = BookOpenText, tone = "readme", initialAnchor }: DocumentationDialogProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setContent("");
    void fetchJson<ReadmeResponse>(endpoint, { cache: "no-store", timeoutMs: 15_000, signal: controller.signal, label: `读取${label}` })
      .then((data) => setContent(data.content))
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : `读取${label}失败，请重试。`); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, endpoint, label]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  useEffect(() => { if (!content || !initialAnchor) return; requestAnimationFrame(() => document.getElementById(initialAnchor)?.scrollIntoView({ block: "start" })); }, [content, initialAnchor]);

  return <div className="readme-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`readme-dialog ${tone === "agent" ? "agent-guide-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby="readme-title" aria-describedby="readme-description">
      <button className="icon-close" type="button" onClick={onClose} aria-label={`关闭${label}`}><X size={19}/></button>
      <header className="readme-dialog-heading">
        <span><Icon size={23}/></span>
        <div><p className="eyebrow">{eyebrow}</p><h2 id="readme-title">{title}</h2><p id="readme-description">{description}</p></div>
      </header>
      <div className="readme-dialog-content" aria-live="polite">
        {loading && <div className="readme-loading"><LoaderCircle size={24}/><p>正在获取{label}…</p></div>}
        {!loading && error && <div className="readme-error" role="alert"><AlertCircle size={21}/><div><strong>{label} 暂时无法加载</strong><p>{error}</p><Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16}/> 重试</Button></div></div>}
        {!loading && !error && <article className="readme-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          h1: ({ children }) => <h1 id={slug(String(children))}>{children}</h1>, h2: ({ children }) => <h2 id={slug(String(children))}>{children}</h2>, h3: ({ children }) => <h3 id={slug(String(children))}>{children}</h3>,
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
