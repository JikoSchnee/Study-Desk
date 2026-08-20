"use client";

import { ChangeEvent, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { Button, Chip } from "@/components/ui";

type PreviewBase = { id: string; name: string; description: string; cardCount: number; match: { id: string; name: string } | null; conflicts: Array<{ incomingId: string; question: string; localCardId: string }> };
type Preview = { package: { type: "knowledge-base" | "study-plan"; plan: { name: string } | null; knowledgeBaseCount: number; cardCount: number }; knowledgeBases: PreviewBase[] };

export function ShareImportDialog({ open, expectedType, onClose, onImported }: { open: boolean; expectedType: "knowledge-base" | "study-plan"; onClose: () => void; onImported: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pkg, setPackage] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [baseChoices, setBaseChoices] = useState<Record<string, "merge" | "duplicate" | "skip">>({});
  const [cardChoices, setCardChoices] = useState<Record<string, "keep" | "overwrite">>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try {
      const value = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", package: value }) });
      const data = await response.json() as Preview & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "无法读取分享文件。");
      if (data.package.type !== expectedType) throw new Error(expectedType === "study-plan" ? "请选择计划书分享文件。" : "请选择知识库分享文件。");
      setPackage(value); setPreview(data);
      setBaseChoices(Object.fromEntries(data.knowledgeBases.map((base) => [base.id, base.match ? "merge" : "duplicate"])));
      setCardChoices(Object.fromEntries(data.knowledgeBases.flatMap((base) => base.conflicts.map((card) => [card.incomingId, "keep"]))));
    } catch (issue) { setError(issue instanceof Error ? issue.message : "分享文件无效。"); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!pkg || !preview) return;
    setBusy(true); setError("");
    try {
      const knowledgeBaseResolutions = Object.fromEntries(preview.knowledgeBases.map((base) => [base.id, { action: baseChoices[base.id], targetId: baseChoices[base.id] === "merge" ? base.match?.id : undefined }]));
      const response = await fetch("/api/sharing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", package: pkg, knowledgeBaseResolutions, cardResolutions: cardChoices }) });
      const data = await response.json() as { summary?: { knowledgeBasesCreated: number; knowledgeBasesMerged: number; cardsCreated: number; cardsOverwritten: number; cardsKept: number }; error?: string };
      if (!response.ok || !data.summary) throw new Error(data.error ?? "导入失败。");
      onImported(`导入完成：新增 ${data.summary.knowledgeBasesCreated} 个知识库、${data.summary.cardsCreated} 张卡片，覆盖 ${data.summary.cardsOverwritten} 张，保留本地 ${data.summary.cardsKept} 张。`);
      onClose();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "导入失败。"); }
    finally { setBusy(false); }
  };

  return <div className="entity-manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="entity-manager share-import-dialog" role="dialog" aria-modal="true" aria-labelledby="share-import-title"><header><div><p className="eyebrow"><FileUp size={15}/> 导入分享文件</p><h2 id="share-import-title">先预览，再决定如何合并。</h2></div><button type="button" className="icon-close" onClick={onClose} aria-label="关闭"><X size={19}/></button></header>
    {!preview ? <div className="share-file-picker"><FileUp size={34}/><strong>{expectedType === "study-plan" ? "选择计划书 JSON" : "选择知识库 JSON"}</strong><p>分享文件只包含知识内容，不会导入对方的学习记录。</p><input ref={input} type="file" accept="application/json,.json" hidden onChange={readFile}/><Button type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "正在分析…" : "选择文件"}</Button></div> : <div className="share-preview"><div className="share-preview-summary"><strong>{preview.package.plan?.name ?? preview.knowledgeBases[0]?.name}</strong><span>{preview.package.knowledgeBaseCount} 个知识库 · {preview.package.cardCount} 张卡片</span></div>{preview.knowledgeBases.map((base) => <article key={base.id}><div><strong>{base.name}</strong><Chip tone={base.match ? "blue" : "green"}>{base.match ? `本地已有：${base.match.name}` : "新知识库"}</Chip></div><p>{base.description || "没有说明"} · {base.cardCount} 张卡片</p><label className="field">处理方式<select value={baseChoices[base.id]} onChange={(event) => setBaseChoices((items) => ({ ...items, [base.id]: event.target.value as "merge" | "duplicate" | "skip" }))}><option value="merge" disabled={!base.match}>合并到本地知识库</option><option value="duplicate">创建副本</option><option value="skip">跳过</option></select></label>{baseChoices[base.id] === "merge" && base.conflicts.length > 0 && <div className="share-card-conflicts"><b>{base.conflicts.length} 张冲突卡片</b>{base.conflicts.map((card) => <label key={card.incomingId}><span>{card.question}</span><select value={cardChoices[card.incomingId]} onChange={(event) => setCardChoices((items) => ({ ...items, [card.incomingId]: event.target.value as "keep" | "overwrite" }))}><option value="keep">保留本地</option><option value="overwrite">使用分享版</option></select></label>)}</div>}</article>)}</div>}
    {error && <p className="danger" role="alert">{error}</p>}<footer><Button type="button" variant="ghost" onClick={onClose}>取消</Button>{preview && <Button type="button" disabled={busy} onClick={confirm}>{busy ? "正在导入…" : "确认导入"}</Button>}</footer>
  </section></div>;
}

