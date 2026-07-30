"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, CircleAlert, FileSpreadsheet, Link2, Plus, UploadCloud, X } from "lucide-react";
import { AnswerStructureEditor as AnswerPointsEditor, QuestionWordingsEditor, RelatedCardsEditor, TagRecommendations, useCardRecommendations } from "@/components/card-form-editors";
import { LLMConfigurationDialog } from "@/components/llm-configuration-dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { Button, Chip, Panel } from "@/components/ui";
import { emptyMapping, splitTags, type AnswerPoint, type ImportColumnMapping, type ImportPreviewRow } from "@/lib/import";
import { createRelatedCardDraft } from "@/lib/related-card-draft";
import type { Card, CardRelation, CardRelationType, FollowUpCardDraft, QuestionVariant } from "@/lib/types";

type CardDraft = { question: string; questionVariants: QuestionVariant[]; relations: CardRelation[]; answerPoints: AnswerPoint[]; note: string; track: string; tags: string; source: string };
type SheetInfo = { name: string; headers: string[]; mapping: ImportColumnMapping };
type SaveFeedback = { tone: "success" | "error"; message: string };
const defaultKnowledgeBaseTypes = ["Agent", "Java 后端", "计算机基础"];

function pointId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `point-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const point = (content = "", hint = "", note = "", role: AnswerPoint["role"] = "key"): AnswerPoint => ({ id: pointId(), content, hint, note, role });
const freshDraft = (): CardDraft => ({ question: "", questionVariants: [], relations: [], answerPoints: [point()], note: "", track: "Agent", tags: "", source: "" });

type CardWorkspaceProps = {
  initialMode: "manual" | "import";
  onClose?: () => void;
  onComplete?: (message: string, mode: "manual" | "import") => void;
};

export function CardWorkspace({ initialMode, onClose, onComplete }: CardWorkspaceProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [mode, setMode] = useState<"manual" | "import">(initialMode);
  const [draft, setDraft] = useState<CardDraft>(freshDraft);
  const [notice, setNotice] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [mapping, setMapping] = useState<ImportColumnMapping>(emptyMapping);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [importBusy, setImportBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [aiCandidates, setAiCandidates] = useState<QuestionVariant[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [needsLLMConfiguration, setNeedsLLMConfiguration] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [relatedCardDialogOpen, setRelatedCardDialogOpen] = useState(false);
  const saveFeedbackRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const relatedCardDialogRef = useRef<HTMLButtonElement>(null);

  const scrollToPageTop = useCallback(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = reduceMotion ? "auto" : "smooth";
    workspaceRef.current?.scrollIntoView({ block: "start", behavior });
    window.scrollTo({ top: 0, behavior });
  }, []);
  const load = useCallback(() => fetch("/api/cards").then((response) => response.json()).then((data) => setCards(data.cards)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!saveFeedback) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const focusFeedback = () => saveFeedbackRef.current?.focus({ preventScroll: true });
    if (reduceMotion) {
      const frame = window.requestAnimationFrame(focusFeedback);
      return () => window.cancelAnimationFrame(frame);
    }
    const timeout = window.setTimeout(focusFeedback, 350);
    return () => window.clearTimeout(timeout);
  }, [saveFeedback]);
  useEffect(() => {
    if (!relatedCardDialogOpen) return;
    const frame = window.requestAnimationFrame(() => relatedCardDialogRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saveBusy) setRelatedCardDialogOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("keydown", closeOnEscape); };
  }, [relatedCardDialogOpen, saveBusy]);
  useEffect(() => {
    const raw = window.localStorage.getItem("mock-interview:supplement-draft");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { question?: string; answerPoints?: string[]; track?: string; tags?: string[] };
      setDraft({ question: saved.question ?? "", questionVariants: [], relations: [], answerPoints: (saved.answerPoints ?? [""]).map((content) => point(content)), note: "由练习反馈生成；保存前请补全或校对内容。", track: saved.track ?? "Agent", tags: (saved.tags ?? []).join(", "), source: "" });
      setNotice("已根据遗漏要点生成补充卡草稿，请确认后保存。");
    } catch { /* Ignore an old or malformed local draft. */ }
    window.localStorage.removeItem("mock-interview:supplement-draft");
  }, []);
  useEffect(() => {
    const raw = window.localStorage.getItem("mock-interview:follow-up-card-draft");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Partial<FollowUpCardDraft>;
      if (!saved.question?.trim() || !saved.sourceCardId || !Array.isArray(saved.answerPoints)) throw new Error("invalid draft");
      const relationType = saved.relationType === "parent" || saved.relationType === "child" ? saved.relationType : "related";
      setMode("manual");
      setDraft({
        question: saved.question.trim(),
        questionVariants: Array.isArray(saved.questionVariants) ? saved.questionVariants.flatMap((item) => item?.content?.trim() ? [{ id: pointId(), content: item.content.trim(), source: "ai" as const }] : []) : [],
        relations: [{ cardId: saved.sourceCardId, type: relationType }],
        answerPoints: saved.answerPoints.flatMap((item) => item?.content?.trim() ? [point(item.content.trim(), item.hint ?? "", item.note ?? "", item.role === "opening" || item.role === "closing" ? item.role : "key")] : []),
        note: saved.note?.trim() || "由 AI 根据追问上下文生成；保存前请核对准确性。",
        track: saved.track?.trim() || "Agent",
        tags: Array.isArray(saved.tags) ? saved.tags.filter((tag): tag is string => typeof tag === "string").join(", ") : "",
        source: "ai-follow-up",
      });
      setAiCandidates([]);
      setSaveFeedback(null);
      setNotice("AI 已生成追问卡草稿，并预选了与原卡的关联关系；请核对后保存。");
    } catch { setNotice("追问卡草稿无效，已保留空白录入表单。请重新生成。 "); }
    window.localStorage.removeItem("mock-interview:follow-up-card-draft");
  }, []);
  const resetImport = () => { setFile(null); setSheets([]); setSheetName(""); setMapping(emptyMapping); setPreviewRows([]); setIncluded(new Set()); setDragging(false); };
  const inspectFile = async (selected: File) => { setImportBusy(true); setNotice(""); const form = new FormData(); form.set("file", selected); form.set("phase", "inspect"); const response = await fetch("/api/cards/import/parse", { method: "POST", body: form }); const data = await response.json(); setImportBusy(false); if (!response.ok) { setNotice(data.error ?? "无法读取文件。"); return; } const first = data.sheets[0] as SheetInfo | undefined; setFile(selected); setSheets(data.sheets); setSheetName(first?.name ?? ""); setMapping(first?.mapping ?? emptyMapping); setPreviewRows([]); };
  const previewFile = async () => { if (!file || !sheetName) return; setImportBusy(true); const form = new FormData(); form.set("file", file); form.set("phase", "preview"); form.set("sheetName", sheetName); form.set("mapping", JSON.stringify(mapping)); const response = await fetch("/api/cards/import/parse", { method: "POST", body: form }); const data = await response.json(); setImportBusy(false); if (!response.ok) { setNotice(data.error ?? "无法生成预览。"); return; } setPreviewRows(data.preview); setIncluded(new Set(data.preview.filter((row: ImportPreviewRow) => row.status === "valid").map((row: ImportPreviewRow) => row.id))); if (data.truncated) setNotice("文件超过 500 行，仅显示前 500 行供导入。"); };
  const updateRow = (id: string, change: Partial<ImportPreviewRow["card"]>) => setPreviewRows((rows) => rows.map((row) => row.id !== id ? row : { ...row, status: change.question !== undefined || change.answerPoints !== undefined ? "valid" : row.status, reason: change.question !== undefined || change.answerPoints !== undefined ? undefined : row.reason, card: { ...row.card, ...change } }));
  const commitImport = async () => { const chosen = previewRows.filter((row) => included.has(row.id)).map((row) => row.card).filter((card) => card.question.trim() && card.answerPoints.some((item) => item.content.trim())); if (!chosen.length) { setNotice("请至少保留一张含问题和答案要点的卡片。 "); return; } setImportBusy(true); const response = await fetch("/api/cards/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards: chosen }) }); const data = await response.json(); setImportBusy(false); if (!response.ok) { setNotice(data.error ?? "导入失败。"); return; } const message = `已导入 ${data.accepted.length} 张卡片${data.rejected.length ? `，跳过 ${data.rejected.length} 条重复或无效内容` : ""}。`; resetImport(); await load(); onComplete?.(message, "import"); };
  const generateVariants = async (question: string, answerPoints: AnswerPoint[], existing: QuestionVariant[]) => { if (question.trim().length < 3 || !answerPoints.some((item) => item.content.trim())) { setNotice("请先填写主问题和至少一条答案要点，再让 AI 补充问法。"); return; } setAiBusy(true); setNotice(""); try { const response = await fetch("/api/cards/question-variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, answerPoints: answerPoints.map((item) => item.content.trim()).filter(Boolean), existingQuestions: [...existing.map((item) => item.content), ...aiCandidates.map((item) => item.content)] }) }); const data = await response.json(); if (!response.ok) { if (data.requiresConfiguration) setNeedsLLMConfiguration(true); throw new Error(data.error ?? "暂时无法生成问法。"); } setAiCandidates((items) => [...items, ...data.candidates]); } catch (error) { setNotice(error instanceof Error ? error.message : "暂时无法生成问法。"); } finally { setAiBusy(false); } };

  const selectedSheet = sheets.find((sheet) => sheet.name === sheetName);
  const valid = previewRows.filter((row) => row.status === "valid").length;
  const invalid = previewRows.filter((row) => row.status === "invalid").length;
  const duplicates = previewRows.filter((row) => row.status === "duplicate").length;
  const savedKnowledgeBaseTypes = useMemo(() => [...new Set(cards.map((card) => card.track))].sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);
  const knowledgeBaseTypeSuggestions = useMemo(() => [...new Set([...defaultKnowledgeBaseTypes, ...savedKnowledgeBaseTypes])].sort((left, right) => left.localeCompare(right, "zh-CN")), [savedKnowledgeBaseTypes]);
  const tags = useMemo(() => [...new Set(cards.flatMap((card) => card.tags))].sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);
  const recommendations = useCardRecommendations({ question: draft.question, questionVariants: draft.questionVariants, answerPoints: draft.answerPoints, note: draft.note, track: draft.track, tags: splitTags(draft.tags) }, undefined, draft.relations);
  const focusFirstMissingRequiredField = useCallback(() => {
    const form = workspaceRef.current;
    if (!form) return;
    const target = !draft.question.trim()
      ? form.querySelector<HTMLInputElement>(".primary-question-row input")
      : form.querySelector<HTMLTextAreaElement>(".answer-points .answer-point textarea");
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }, [draft.question]);
  const saveCard = useCallback(async (newCardRelationType?: CardRelationType): Promise<string | void> => {
    if (!draft.question.trim() || !draft.answerPoints.some((item) => item.content.trim())) {
      const message = "请至少填写主问题和一条答案要点，然后再保存。";
      setSaveFeedback({ tone: "error", message });
      if (newCardRelationType) setRelatedCardDialogOpen(false);
      focusFirstMissingRequiredField();
      return message;
    }
    setSaveBusy(true); setNotice(""); setSaveFeedback(null);
    try {
      const response = await fetch("/api/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, track: draft.track.trim(), tags: splitTags(draft.tags) }) });
      const data = await response.json();
      if (!response.ok) {
        const message = data.error ?? "保存失败，请检查问题和答案要点。";
        setSaveFeedback({ tone: "error", message });
        if (newCardRelationType) setRelatedCardDialogOpen(false);
        focusFirstMissingRequiredField();
        return message;
      }
      const createdCard = data.card as Card;
      if (newCardRelationType) {
        setDraft(createRelatedCardDraft(createdCard, newCardRelationType, point()));
        setAiCandidates([]);
        setRelatedCardDialogOpen(false);
        setNotice("当前卡片已保存；请继续填写已自动关联的新卡片。");
        scrollToPageTop();
        onComplete?.("卡片已加入首次学习队列，并已打开一张关联卡片草稿。", "manual");
      } else {
        setDraft(freshDraft());
        onComplete?.("卡片已加入首次学习队列；先看懂答案要点，明天再开始第一次主动回忆。", "manual");
      }
      await load();
    } catch {
      const message = "保存失败，网络连接可能已中断。请重试。";
      setSaveFeedback({ tone: "error", message });
      if (newCardRelationType) setRelatedCardDialogOpen(false);
      return message;
    }
    finally { setSaveBusy(false); }
  }, [draft, focusFirstMissingRequiredField, load, onComplete, scrollToPageTop]);
  const submit = (event: FormEvent) => { event.preventDefault(); void saveCard(); };
  const saveAndCreateRelated = (relationType: CardRelationType) => { void saveCard(relationType); };
  const clearDraft = () => {
    if (!window.confirm("确定要清空当前填写的卡片内容吗？此操作无法撤销。")) return;
    setDraft(freshDraft());
    setAiCandidates([]);
    setNotice("");
    setSaveFeedback(null);
    scrollToPageTop();
  };
  return <section ref={workspaceRef} className="card-workspace" aria-label={mode === "manual" ? "创建卡片" : "导入卡片"}><LLMConfigurationDialog open={needsLLMConfiguration} onClose={() => setNeedsLLMConfiguration(false)} purpose="AI 补充问法" />{relatedCardDialogOpen && <div className="related-card-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saveBusy) setRelatedCardDialogOpen(false); }}><section className="related-card-dialog" role="dialog" aria-modal="true" aria-labelledby="related-card-dialog-title" aria-describedby="related-card-dialog-description" aria-busy={saveBusy}><button className="icon-close" type="button" onClick={() => setRelatedCardDialogOpen(false)} disabled={saveBusy} aria-label="关闭关系选择"><X size={19}/></button><div className="related-card-dialog-heading"><span><Link2 size={23}/></span><div><p className="eyebrow">连续创建</p><h2 id="related-card-dialog-title">新卡和当前卡是什么关系？</h2><p id="related-card-dialog-description">选择后会先保存当前卡片，再打开一张已关联的新卡草稿。</p></div></div><div className="related-card-dialog-options" role="group" aria-label="选择新卡关系"><button ref={relatedCardDialogRef} type="button" onClick={() => saveAndCreateRelated("related")} disabled={saveBusy}><Link2 size={20}/><span><strong>新卡是相关问题</strong><small>两张卡片围绕相近知识点</small></span></button><button type="button" onClick={() => saveAndCreateRelated("child")} disabled={saveBusy}><Plus size={20}/><span><strong>新卡是子问题</strong><small>从当前问题拆出更具体的追问</small></span></button><button type="button" onClick={() => saveAndCreateRelated("parent")} disabled={saveBusy}><Plus size={20}/><span><strong>新卡是父问题</strong><small>为当前问题补上一层更上位的概念</small></span></button></div></section></div>}{saveFeedback && <div ref={saveFeedbackRef} className={`save-feedback ${saveFeedback.tone}`} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}><span aria-hidden="true">{saveFeedback.tone === "success" ? <CheckCircle2 size={23}/> : <CircleAlert size={23}/>}</span><p>{saveFeedback.message}</p></div>}{notice && <div className="notice" role="status" style={{ marginBottom: 20 }}>{notice}</div>}
    {mode === "manual" && <div data-tour="card-composer"><Panel className="form-panel composer-panel"><div className="panel-topline"><div><p className="eyebrow">创建卡片</p><h2>沉淀一张自己的知识卡</h2></div>{onClose && <button className="icon-close" type="button" onClick={onClose} aria-label="关闭创建卡片"><X size={19}/></button>}</div><form className="form-grid" onSubmit={submit}><QuestionWordingsEditor question={draft.question} variants={draft.questionVariants} candidates={aiCandidates} onChange={({ question, variants }) => setDraft((current) => ({ ...current, question, questionVariants: variants }))} onCandidatesChange={setAiCandidates} onGenerate={() => generateVariants(draft.question, draft.answerPoints, draft.questionVariants)} busy={aiBusy}/><div data-tour="answer-points"><AnswerPointsEditor points={draft.answerPoints} onChange={(answerPoints) => setDraft({ ...draft, answerPoints })} /></div> <RelatedCardsEditor cards={cards} value={draft.relations} onChange={(relations) => setDraft({ ...draft, relations })} recommendations={recommendations.relatedCards} recommendationState={recommendations.state}/><label className="field card-note-field">学习备注（总体批注）<textarea rows={4} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="记录来源、待核实的信息，或下一次复习时想提醒自己的事。" /></label><div className="form-grid two"><label className="field">知识库类型<SearchableSelect value={draft.track} onChange={(track) => setDraft({ ...draft, track })} options={knowledgeBaseTypeSuggestions} placeholder="选择或输入新类型" ariaLabel="知识库类型" allowCustom required /></label><div className="tag-field-with-recommendations"><div className="field"><span>标签</span><SearchableSelect multiple value={splitTags(draft.tags)} onChange={(values) => setDraft((current) => ({ ...current, tags: values.join(", ") }))} options={tags} placeholder="选择或输入标签" ariaLabel="标签" allowCustom menuPlacement="top" menuHeader={<TagRecommendations tags={recommendations.tags} state={recommendations.state} onAdd={(tag) => setDraft((current) => ({ ...current, tags: splitTags([...splitTags(current.tags), tag].join(", ")).join(", ") }))}/>} /></div></div></div><div className="form-actions card-save-actions" data-tour="card-save"><Button type="button" variant="ghost" onClick={clearDraft} disabled={saveBusy}>清空</Button><Button type="button" variant="secondary" onClick={() => setRelatedCardDialogOpen(true)} disabled={saveBusy}><Link2 size={17}/> 保存并创建相关卡片</Button><Button type="submit" disabled={saveBusy}>{saveBusy ? "正在保存…" : "保存"}</Button></div></form></Panel></div>}
    {mode === "import" && <Panel className="import-workbench"><div className="panel-topline"><div><p className="eyebrow">文件导入工作台</p><h2>先看懂，再入库。</h2></div>{onClose && <button className="icon-close" type="button" onClick={onClose} aria-label="关闭文件导入"><X size={19}/></button>}</div><ol className="import-steps"><li className={!file ? "current" : "done"}><span>1</span> 选择文件</li><li className={file && !previewRows.length ? "current" : previewRows.length ? "done" : ""}><span>2</span> 映射列</li><li className={previewRows.length ? "current" : ""}><span>3</span> 审阅卡片</li></ol>{!file && <div className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={(event: DragEvent) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event: DragEvent) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files[0]; if (dropped) inspectFile(dropped); }}><UploadCloud size={34}/><h3>拖放你的表格到这里</h3><p>支持 CSV 与 XLSX，最大 5MB；只会读取你最后确认的内容。</p><input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={(event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) inspectFile(selected); event.target.value = ""; }} hidden/><Button type="button" variant="secondary" disabled={importBusy} onClick={() => inputRef.current?.click()}>{importBusy ? "正在读取…" : "选择 CSV/XLSX 文件"}</Button></div>}{file && !previewRows.length && <div className="mapping-stage"><div className="file-summary"><FileSpreadsheet size={21}/><div><strong>{file.name}</strong><span>{Math.ceil(file.size / 1024)} KB · {sheets.length} 个工作表</span></div><Button type="button" variant="ghost" onClick={resetImport}>换个文件</Button></div><div className="mapping-grid"><label className="field">工作表<select value={sheetName} onChange={(event) => { const name = event.target.value; const sheet = sheets.find((item) => item.name === name); setSheetName(name); setMapping(sheet?.mapping ?? emptyMapping); }}>{sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}</select></label>{(["question", "variants", "answer", "hint", "track", "tags"] as const).map((field) => <label className="field" key={field}>{field === "question" ? "主问题列（必填）" : field === "variants" ? "其他问法（每行一种）" : field === "answer" ? "答案列" : field === "hint" ? "提示列（可选）" : field === "track" ? "知识库类型" : "标签"}<select value={mapping[field]} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}><option value="">不导入</option>{selectedSheet?.headers.map((header) => <option key={header}>{header}</option>)}</select></label>)}</div><div className="mapping-hint"><CircleAlert size={17}/> 其他问法、答案和提示都支持单元格内换行；答案与提示会按顺序配对；难度将由首次 FSRS 练习自动计算。</div><div className="form-actions"><Button type="button" variant="ghost" onClick={resetImport}><ChevronLeft size={17}/> 返回</Button><Button type="button" disabled={!mapping.question || importBusy} onClick={previewFile}>{importBusy ? "正在生成预览…" : "查看卡片预览"}</Button></div></div>}{previewRows.length > 0 && <div className="review-stage"><div className="import-summary"><div><strong>{included.size}</strong><span>张待导入</span></div><div><b>{valid}</b><span>有效</span></div><div><b>{duplicates}</b><span>重复</span></div><div><b>{invalid}</b><span>需修正</span></div></div><p className="muted-copy">逐张确认内容。修改问题或答案后可重新勾选；最终仍会进行重复校验。</p><div className="preview-list">{previewRows.map((row) => <article key={row.id} className={`preview-card ${row.status}`}><div className="preview-header"><label><input type="checkbox" checked={included.has(row.id)} disabled={row.status !== "valid"} onChange={(event) => setIncluded((items) => { const next = new Set(items); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /> 导入第 {row.rowNumber} 行</label><Chip tone={row.status === "valid" ? "green" : "ink"}>{row.status === "valid" ? "可导入" : row.status === "duplicate" ? "疑似重复" : "需补充"}</Chip></div>{row.reason && <p className="row-warning"><CircleAlert size={15}/>{row.reason}</p>}{row.note && <p className="row-note"><CircleAlert size={15}/>{row.note}</p>}<QuestionWordingsEditor question={row.card.question} variants={row.card.questionVariants} onChange={({ question, variants }) => { updateRow(row.id, { question, questionVariants: variants }); setIncluded((items) => new Set(items).add(row.id)); }} label="问题问法"/><AnswerPointsEditor label="答案要点与提示" points={row.card.answerPoints.length ? row.card.answerPoints : [point()]} onChange={(answerPoints) => { updateRow(row.id, { answerPoints }); setIncluded((items) => new Set(items).add(row.id)); }} /><div className="form-grid two"><label className="field">知识库类型<SearchableSelect value={row.card.track} onChange={(track) => updateRow(row.id, { track })} options={knowledgeBaseTypeSuggestions} placeholder="选择或输入新类型" ariaLabel="知识库类型" allowCustom required /></label><div className="field"><span>标签</span><SearchableSelect multiple value={row.card.tags} onChange={(values) => updateRow(row.id, { tags: values })} options={tags} placeholder="选择或输入标签" ariaLabel="标签" allowCustom /></div></div></article>)}</div><div className="form-actions"><Button type="button" variant="ghost" onClick={() => setPreviewRows([])}><ChevronLeft size={17}/> 调整列映射</Button><Button type="button" disabled={!included.size || importBusy} onClick={commitImport}><CheckCircle2 size={17}/> 确认导入 {included.size} 张卡片</Button></div></div>}</Panel>}
  </section>;
}
