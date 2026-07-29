"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, CircleAlert, FileSpreadsheet, FileUp, UploadCloud, X } from "lucide-react";
import { AnswerStructureEditor as AnswerPointsEditor, QuestionVariantsEditor, RelatedCardsEditor, TagRecommendations, useCardRecommendations } from "@/components/card-form-editors";
import { LLMConfigurationDialog } from "@/components/llm-configuration-dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { Button, Chip, Panel } from "@/components/ui";
import { PageHeader, PageLayout } from "@/components/page-layout";
import { useTour } from "@/components/tour";
import { emptyMapping, splitTags, type AnswerPoint, type ImportColumnMapping, type ImportPreviewRow } from "@/lib/import";
import type { Card, CardRelation, FollowUpCardDraft, QuestionVariant } from "@/lib/types";

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

export default function CardsPage() {
  const { activeId, completeCheckpoint, registerTourAction, tutorialCardId } = useTour();
  const [cards, setCards] = useState<Card[]>([]);
  const [mode, setMode] = useState<"manual" | "import">("manual");
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
  const loadedTutorialCardId = useRef<string | null>(null);
  const saveFeedbackRef = useRef<HTMLDivElement>(null);

  const scrollToPageTop = useCallback(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, []);

  const load = useCallback(() => fetch("/api/cards").then((response) => response.json()).then((data) => setCards(data.cards)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const closeWhenFocusLeaves = (event: FocusEvent | PointerEvent) => {
      const dropdown = document.querySelector<HTMLDetailsElement>(".template-download[open]");
      if (dropdown && event.target instanceof Node && !dropdown.contains(event.target)) dropdown.removeAttribute("open");
    };
    const closeAfterDownload = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(".template-download a") : null;
      link?.closest<HTMLDetailsElement>(".template-download")?.removeAttribute("open");
    };
    document.addEventListener("focusin", closeWhenFocusLeaves);
    document.addEventListener("pointerdown", closeWhenFocusLeaves);
    document.addEventListener("click", closeAfterDownload);
    return () => {
      document.removeEventListener("focusin", closeWhenFocusLeaves);
      document.removeEventListener("pointerdown", closeWhenFocusLeaves);
      document.removeEventListener("click", closeAfterDownload);
    };
  }, []);
  useEffect(() => {
    if (!saveFeedback) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToPageTop();
    const focusFeedback = () => saveFeedbackRef.current?.focus({ preventScroll: true });
    if (reduceMotion) {
      const frame = window.requestAnimationFrame(focusFeedback);
      return () => window.cancelAnimationFrame(frame);
    }
    const timeout = window.setTimeout(focusFeedback, 350);
    return () => window.clearTimeout(timeout);
  }, [saveFeedback, scrollToPageTop]);
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
  const openImport = () => { setMode("import"); setAiCandidates([]); setNotice(""); resetImport(); };
  const inspectFile = async (selected: File) => { setImportBusy(true); setNotice(""); const form = new FormData(); form.set("file", selected); form.set("phase", "inspect"); const response = await fetch("/api/cards/import/parse", { method: "POST", body: form }); const data = await response.json(); setImportBusy(false); if (!response.ok) { setNotice(data.error ?? "无法读取文件。"); return; } const first = data.sheets[0] as SheetInfo | undefined; setFile(selected); setSheets(data.sheets); setSheetName(first?.name ?? ""); setMapping(first?.mapping ?? emptyMapping); setPreviewRows([]); };
  const previewFile = async () => { if (!file || !sheetName) return; setImportBusy(true); const form = new FormData(); form.set("file", file); form.set("phase", "preview"); form.set("sheetName", sheetName); form.set("mapping", JSON.stringify(mapping)); const response = await fetch("/api/cards/import/parse", { method: "POST", body: form }); const data = await response.json(); setImportBusy(false); if (!response.ok) { setNotice(data.error ?? "无法生成预览。"); return; } setPreviewRows(data.preview); setIncluded(new Set(data.preview.filter((row: ImportPreviewRow) => row.status === "valid").map((row: ImportPreviewRow) => row.id))); if (data.truncated) setNotice("文件超过 500 行，仅显示前 500 行供导入。"); };
  const updateRow = (id: string, change: Partial<ImportPreviewRow["card"]>) => setPreviewRows((rows) => rows.map((row) => row.id !== id ? row : { ...row, status: change.question !== undefined || change.answerPoints !== undefined ? "valid" : row.status, reason: change.question !== undefined || change.answerPoints !== undefined ? undefined : row.reason, card: { ...row.card, ...change } }));
  const commitImport = async () => { const chosen = previewRows.filter((row) => included.has(row.id)).map((row) => row.card).filter((card) => card.question.trim() && card.answerPoints.some((item) => item.content.trim())); if (!chosen.length) { setNotice("请至少保留一张含问题和答案要点的卡片。 "); return; } setImportBusy(true); const response = await fetch("/api/cards/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards: chosen }) }); const data = await response.json(); setImportBusy(false); if (!response.ok) { setNotice(data.error ?? "导入失败。"); return; } setNotice(`已导入 ${data.accepted.length} 张卡片${data.rejected.length ? `，跳过 ${data.rejected.length} 条重复或无效内容` : ""}。`); setMode("manual"); resetImport(); load(); };
  const generateVariants = async (question: string, answerPoints: AnswerPoint[], existing: QuestionVariant[]) => { if (question.trim().length < 3 || !answerPoints.some((item) => item.content.trim())) { setNotice("请先填写主问题和至少一条答案要点，再让 AI 补充问法。"); return; } setAiBusy(true); setNotice(""); try { const response = await fetch("/api/cards/question-variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, answerPoints: answerPoints.map((item) => item.content.trim()).filter(Boolean), existingQuestions: [...existing.map((item) => item.content), ...aiCandidates.map((item) => item.content)] }) }); const data = await response.json(); if (!response.ok) { if (data.requiresConfiguration) setNeedsLLMConfiguration(true); throw new Error(data.error ?? "暂时无法生成问法。"); } setAiCandidates((items) => [...items, ...data.candidates]); } catch (error) { setNotice(error instanceof Error ? error.message : "暂时无法生成问法。"); } finally { setAiBusy(false); } };

  const selectedSheet = sheets.find((sheet) => sheet.name === sheetName);
  const valid = previewRows.filter((row) => row.status === "valid").length;
  const invalid = previewRows.filter((row) => row.status === "invalid").length;
  const duplicates = previewRows.filter((row) => row.status === "duplicate").length;
  const savedKnowledgeBaseTypes = useMemo(() => [...new Set(cards.map((card) => card.track))].sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);
  const knowledgeBaseTypeSuggestions = useMemo(() => [...new Set([...defaultKnowledgeBaseTypes, ...savedKnowledgeBaseTypes])].sort((left, right) => left.localeCompare(right, "zh-CN")), [savedKnowledgeBaseTypes]);
  const tags = useMemo(() => [...new Set(cards.flatMap((card) => card.tags))].sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);
  const tutorialCard = useMemo(() => cards.find((card) => card.id === tutorialCardId), [cards, tutorialCardId]);
  const isTutorialEditing = activeId === "onboarding" && Boolean(tutorialCard);
  const recommendations = useCardRecommendations({ question: draft.question, questionVariants: draft.questionVariants, answerPoints: draft.answerPoints, note: draft.note, track: draft.track, tags: splitTags(draft.tags) }, isTutorialEditing ? tutorialCardId ?? undefined : undefined, draft.relations);
  useEffect(() => {
    if (!tutorialCard || !isTutorialEditing || loadedTutorialCardId.current === tutorialCard.id) return;
    loadedTutorialCardId.current = tutorialCard.id;
    setMode("manual");
    setDraft({ question: tutorialCard.question, questionVariants: tutorialCard.questionVariants.map((item) => ({ ...item })), relations: tutorialCard.relations, answerPoints: tutorialCard.answerPoints.map((item) => ({ ...item })), note: tutorialCard.note, track: "演示", tags: tutorialCard.tags.join(", "), source: tutorialCard.source ?? "" });
    setNotice("演示卡已预填到手动录入表单，可修改后保存。 ");
  }, [isTutorialEditing, tutorialCard]);
  const saveCard = useCallback(async (): Promise<string | void> => {
    const tutorialSave = activeId === "onboarding" && Boolean(tutorialCardId);
    if (!draft.question.trim() || !draft.answerPoints.some((item) => item.content.trim())) {
      const message = "请至少填写主问题和一条答案要点，然后再保存。";
      if (tutorialSave) setNotice(message);
      else setSaveFeedback({ tone: "error", message });
      return message;
    }
    setSaveBusy(true); setNotice(""); setSaveFeedback(null);
    try {
      const response = await fetch("/api/cards", { method: tutorialSave ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(tutorialSave ? { id: tutorialCardId } : {}), ...draft, track: draft.track.trim(), tags: splitTags(draft.tags) }) });
      const data = await response.json();
      if (!response.ok) {
        const message = data.error ?? "保存失败，请检查问题和答案要点。";
        if (tutorialSave) setNotice(message);
        else setSaveFeedback({ tone: "error", message });
        return message;
      }
      if (tutorialSave) { setNotice("演示卡已保存，接下来去完成首次学习。 "); completeCheckpoint("tutorial-card-saved"); await load(); return; }
      completeCheckpoint("card-created"); setDraft(freshDraft()); void load();
      setSaveFeedback({ tone: "success", message: "卡片已加入首次学习队列；先看懂答案要点，明天再开始第一次主动回忆。" });
    } catch {
      const message = "保存失败，网络连接可能已中断。请重试。";
      if (tutorialSave) setNotice(message);
      else setSaveFeedback({ tone: "error", message });
      return message;
    }
    finally { setSaveBusy(false); }
  }, [activeId, completeCheckpoint, draft, load, tutorialCardId]);
  const submit = (event: FormEvent) => { event.preventDefault(); void saveCard(); };
  const clearDraft = () => {
    if (!window.confirm("确定要清空当前填写的卡片内容吗？此操作无法撤销。")) return;
    setDraft(freshDraft());
    setAiCandidates([]);
    setNotice("");
    setSaveFeedback(null);
    scrollToPageTop();
  };
  useEffect(() => {
    if (!isTutorialEditing) return;
    return registerTourAction("tutorial-card-saved", saveCard);
  }, [isTutorialEditing, registerTourAction, saveCard]);

  return <PageLayout className="cards-page"><LLMConfigurationDialog open={needsLLMConfiguration} onClose={() => setNeedsLLMConfiguration(false)} purpose="AI 补充问法" /><div className="cards-workspace"><PageHeader eyebrow={<><FileUp size={15}/> 个人题库</>} title="把资料，变成可回答的问题。" description="一张卡聚焦一个知识点；多种问法共享清晰答案，练的是理解，不是题面。" tour="cards" actions={<div className="cards-import-actions"><Button onClick={openImport}><FileSpreadsheet size={18}/> 从文件导入</Button><details className="template-download"><summary>下载模板文件</summary><div className="template-download-options"><p>CSV 模板中，其他问法、答案要点和回忆提示均可在同一单元格内换行；答案与提示会按行配对。</p><a href="/cards-import-template.md" download>Markdown 模板</a><a href="/cards-import-template.csv" download>CSV 模板（完整字段）</a></div></details></div>} />{saveFeedback && <div ref={saveFeedbackRef} className={`save-feedback ${saveFeedback.tone}`} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}><span aria-hidden="true">{saveFeedback.tone === "success" ? <CheckCircle2 size={23}/> : <CircleAlert size={23}/>}</span><p>{saveFeedback.message}</p></div>}{notice && <div className="notice" role="status" style={{ marginBottom: 20 }}>{notice}</div>}
    {mode === "manual" && <div data-tour="card-composer"><Panel className="form-panel composer-panel" data-tour={isTutorialEditing ? "tutorial-card-editor" : undefined}><div className="panel-topline"><div><p className="eyebrow">{isTutorialEditing ? "基础教程 · 手动录入" : "手动导入"}</p><h2>{isTutorialEditing ? "修改这张演示卡" : "沉淀一张自己的知识卡"}</h2></div></div><form className="form-grid" onSubmit={submit}><label className="field">主问题<input required value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} placeholder="例如：RAG 为什么需要重排序？" /></label><div data-tour="answer-points"><AnswerPointsEditor points={draft.answerPoints} onChange={(answerPoints) => setDraft({ ...draft, answerPoints })} /></div><QuestionVariantsEditor variants={draft.questionVariants} candidates={aiCandidates} onChange={(questionVariants) => setDraft({ ...draft, questionVariants })} onCandidatesChange={setAiCandidates} onGenerate={() => generateVariants(draft.question, draft.answerPoints, draft.questionVariants)} busy={aiBusy}/><RelatedCardsEditor cards={cards} value={draft.relations} onChange={(relations) => setDraft({ ...draft, relations })} excludeId={isTutorialEditing ? tutorialCardId ?? undefined : undefined} recommendations={recommendations.relatedCards} recommendationState={recommendations.state}/><div className="form-grid two"><label className="field">知识库类型<SearchableSelect value={draft.track} onChange={(track) => setDraft({ ...draft, track })} options={knowledgeBaseTypeSuggestions} placeholder="选择或输入新类型" ariaLabel="知识库类型" allowCustom required /></label><div className="tag-field-with-recommendations"><label className="field">标签<SearchableSelect multiple value={splitTags(draft.tags)} onChange={(values) => setDraft((current) => ({ ...current, tags: values.join(", ") }))} options={tags} placeholder="选择或输入标签" ariaLabel="标签" allowCustom /></label><TagRecommendations tags={recommendations.tags} state={recommendations.state} onAdd={(tag) => setDraft((current) => ({ ...current, tags: splitTags([...splitTags(current.tags), tag].join(", ")).join(", ") }))}/></div></div><div className="form-actions" data-tour="card-save"><Button type="button" variant="ghost" onClick={clearDraft}>清空</Button><Button type="submit" disabled={saveBusy}>{saveBusy ? "正在保存…" : isTutorialEditing ? "保存演示卡并继续" : "保存并加入学习"}</Button>{isTutorialEditing && notice && <span className="form-save-notice" role="status">{notice}</span>}</div></form></Panel></div>}
    {mode === "import" && <Panel className="import-workbench"><div className="panel-topline"><div><p className="eyebrow">文件导入工作台</p><h2>先看懂，再入库。</h2></div><button className="icon-close" onClick={() => setMode("manual")} aria-label="关闭文件导入"><X size={19}/></button></div><ol className="import-steps"><li className={!file ? "current" : "done"}><span>1</span> 选择文件</li><li className={file && !previewRows.length ? "current" : previewRows.length ? "done" : ""}><span>2</span> 映射列</li><li className={previewRows.length ? "current" : ""}><span>3</span> 审阅卡片</li></ol>{!file && <div className={`drop-zone ${dragging ? "dragging" : ""}`} onDragOver={(event: DragEvent) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event: DragEvent) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files[0]; if (dropped) inspectFile(dropped); }}><UploadCloud size={34}/><h3>拖放你的表格到这里</h3><p>支持 CSV 与 XLSX，最大 5MB；只会读取你最后确认的内容。</p><input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={(event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) inspectFile(selected); event.target.value = ""; }} hidden/><Button type="button" variant="secondary" disabled={importBusy} onClick={() => inputRef.current?.click()}>{importBusy ? "正在读取…" : "选择 CSV/XLSX 文件"}</Button></div>}{file && !previewRows.length && <div className="mapping-stage"><div className="file-summary"><FileSpreadsheet size={21}/><div><strong>{file.name}</strong><span>{Math.ceil(file.size / 1024)} KB · {sheets.length} 个工作表</span></div><Button type="button" variant="ghost" onClick={resetImport}>换个文件</Button></div><div className="mapping-grid"><label className="field">工作表<select value={sheetName} onChange={(event) => { const name = event.target.value; const sheet = sheets.find((item) => item.name === name); setSheetName(name); setMapping(sheet?.mapping ?? emptyMapping); }}>{sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}</select></label>{(["question", "variants", "answer", "hint", "track", "tags"] as const).map((field) => <label className="field" key={field}>{field === "question" ? "主问题列（必填）" : field === "variants" ? "其他问法（每行一种）" : field === "answer" ? "答案列" : field === "hint" ? "提示列（可选）" : field === "track" ? "知识库类型" : "标签"}<select value={mapping[field]} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}><option value="">不导入</option>{selectedSheet?.headers.map((header) => <option key={header}>{header}</option>)}</select></label>)}</div><div className="mapping-hint"><CircleAlert size={17}/> 其他问法、答案和提示都支持单元格内换行；答案与提示会按顺序配对；难度将由首次 FSRS 练习自动计算。</div><div className="form-actions"><Button type="button" variant="ghost" onClick={resetImport}><ChevronLeft size={17}/> 返回</Button><Button type="button" disabled={!mapping.question || importBusy} onClick={previewFile}>{importBusy ? "正在生成预览…" : "查看卡片预览"}</Button></div></div>}{previewRows.length > 0 && <div className="review-stage"><div className="import-summary"><div><strong>{included.size}</strong><span>张待导入</span></div><div><b>{valid}</b><span>有效</span></div><div><b>{duplicates}</b><span>重复</span></div><div><b>{invalid}</b><span>需修正</span></div></div><p className="muted-copy">逐张确认内容。修改问题或答案后可重新勾选；最终仍会进行重复校验。</p><div className="preview-list">{previewRows.map((row) => <article key={row.id} className={`preview-card ${row.status}`}><div className="preview-header"><label><input type="checkbox" checked={included.has(row.id)} disabled={row.status !== "valid"} onChange={(event) => setIncluded((items) => { const next = new Set(items); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /> 导入第 {row.rowNumber} 行</label><Chip tone={row.status === "valid" ? "green" : "ink"}>{row.status === "valid" ? "可导入" : row.status === "duplicate" ? "疑似重复" : "需补充"}</Chip></div>{row.reason && <p className="row-warning"><CircleAlert size={15}/>{row.reason}</p>}{row.note && <p className="row-note"><CircleAlert size={15}/>{row.note}</p>}<label className="field">主问题<input value={row.card.question} onChange={(event) => { updateRow(row.id, { question: event.target.value }); setIncluded((items) => new Set(items).add(row.id)); }} /></label><AnswerPointsEditor label="答案要点与提示" points={row.card.answerPoints.length ? row.card.answerPoints : [point()]} onChange={(answerPoints) => { updateRow(row.id, { answerPoints }); setIncluded((items) => new Set(items).add(row.id)); }} /><QuestionVariantsEditor label="导入的其他问法" variants={row.card.questionVariants} onChange={(questionVariants) => { updateRow(row.id, { questionVariants }); setIncluded((items) => new Set(items).add(row.id)); }}/><div className="form-grid two"><label className="field">知识库类型<SearchableSelect value={row.card.track} onChange={(track) => updateRow(row.id, { track })} options={knowledgeBaseTypeSuggestions} placeholder="选择或输入新类型" ariaLabel="知识库类型" allowCustom required /></label><label className="field">标签<SearchableSelect multiple value={row.card.tags} onChange={(values) => updateRow(row.id, { tags: values })} options={tags} placeholder="选择或输入标签" ariaLabel="标签" allowCustom /></label></div></article>)}</div><div className="form-actions"><Button type="button" variant="ghost" onClick={() => setPreviewRows([])}><ChevronLeft size={17}/> 调整列映射</Button><Button type="button" disabled={!included.size || importBusy} onClick={commitImport}><CheckCircle2 size={17}/> 确认导入 {included.size} 张卡片</Button></div></div>}</Panel>}
    </div></PageLayout>;
}
