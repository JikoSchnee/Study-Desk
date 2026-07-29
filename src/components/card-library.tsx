"use client";

import Link from "next/link";
import { FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowUpDown, CalendarClock, CheckCircle2, Clock3, Download, FilePlus2, LibraryBig, MessageSquareText, MoreHorizontal, PencilLine, Search, Sparkles, Tag, Trash2, Undo2, X } from "lucide-react";
import { CardDetailsDialog } from "@/components/card-details-dialog";
import { AnswerStructureEditor as AnswerPointsEditor, QuestionWordingsEditor, RelatedCardsEditor, TagRecommendations, useCardRecommendations } from "@/components/card-form-editors";
import { DifficultyPreviewDialog } from "@/components/difficulty-preview-dialog";
import { LLMConfigurationDialog } from "@/components/llm-configuration-dialog";
import { PageHeader, PageLayout } from "@/components/page-layout";
import { SearchableSelect } from "@/components/searchable-select";
import { Button, Chip, EmptyState, Panel } from "@/components/ui";
import { useTour } from "@/components/tour";
import { difficultyTier, filterAndSortCards, type CardSort, type SortDirection } from "@/lib/card-filters";
import { splitTags } from "@/lib/import";
import type { AnswerPoint, Card, CardLearningDetails, CardLearningSummary, CardRelation, CardRelationType, QuestionVariant } from "@/lib/types";

type CardDraft = { question: string; questionVariants: QuestionVariant[]; relations: CardRelation[]; answerPoints: AnswerPoint[]; note: string; track: string; tags: string; source: string };
const defaultKnowledgeBaseTypes = ["Agent", "Java 后端", "计算机基础"];

function compactReviewTime(value: string | null | undefined, future = false) {
  if (!value) return future ? "待首次作答" : "尚未练习";
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (future) {
    if (minutes <= 0) return "现在可复习";
    if (minutes < 60) return `${minutes} 分钟后`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} 小时后`;
    return `${Math.round(minutes / 1440)} 天后`;
  }
  const elapsed = Math.max(0, -minutes);
  if (elapsed < 60) return "刚刚练习";
  if (elapsed < 1440) return `${Math.round(elapsed / 60)} 小时前`;
  return `${Math.round(elapsed / 1440)} 天前`;
}

function targetsCardControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, label, summary, details, [data-card-interactive]"));
}

const cardTiltMediaQuery = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const cardTiltLimit = 5;

function canTiltCard(event: ReactPointerEvent<HTMLElement>) {
  return event.pointerType === "mouse" && window.matchMedia(cardTiltMediaQuery).matches;
}

function beginCardTilt(event: ReactPointerEvent<HTMLElement>) {
  if (canTiltCard(event)) event.currentTarget.dataset.tilting = "true";
}

function updateCardTilt(event: ReactPointerEvent<HTMLElement>) {
  if (!canTiltCard(event)) return;

  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const offsetX = (event.clientX - bounds.left) / bounds.width - .5;
  const offsetY = (event.clientY - bounds.top) / bounds.height - .5;

  card.style.setProperty("--card-rotate-x", `${-offsetY * cardTiltLimit * 2}deg`);
  card.style.setProperty("--card-rotate-y", `${offsetX * cardTiltLimit * 2}deg`);
}

function resetCardTilt(event: ReactPointerEvent<HTMLElement>) {
  delete event.currentTarget.dataset.tilting;
  event.currentTarget.style.removeProperty("--card-rotate-x");
  event.currentTarget.style.removeProperty("--card-rotate-y");
}

export function CardLibrary() {
  const { tutorialCardId } = useTour();
  const [cards, setCards] = useState<Card[]>([]);
  const [learningByCardId, setLearningByCardId] = useState<Record<string, CardLearningSummary>>({});
  const [detail, setDetail] = useState<{ card: Card; relatedCards: Array<Card & { relationType: CardRelationType }>; learning: CardLearningDetails } | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<CardSort>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingDraft, setEditingDraft] = useState<CardDraft | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<QuestionVariant[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [needsLLMConfiguration, setNeedsLLMConfiguration] = useState(false);
  const [difficultyPreviewOpen, setDifficultyPreviewOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const editorRecommendations = useCardRecommendations({ question: editingDraft?.question ?? "", questionVariants: editingDraft?.questionVariants ?? [], answerPoints: editingDraft?.answerPoints ?? [], note: editingDraft?.note ?? "", track: editingDraft?.track ?? "", tags: splitTags(editingDraft?.tags ?? "") }, editingCard?.id, editingDraft?.relations ?? []);

  const load = useCallback(() => fetch("/api/cards").then((response) => response.json()).then((data) => { setCards(data.cards); setLearningByCardId(data.learning ?? {}); }), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!tutorialCardId) return;
    const tutorialCard = cards.find((card) => card.id === tutorialCardId);
    if (!tutorialCard) return;
    setQuery(tutorialCard.question);
    setSelectedTrack("");
    setSelectedTags(new Set());
    setShowArchived(false);
    setSort("updated");
    setSortDirection("desc");
  }, [cards, tutorialCardId]);

  const savedKnowledgeBaseTypes = useMemo(() => [...new Set(cards.map((card) => card.track))].sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);
  const knowledgeBaseTypeSuggestions = useMemo(() => [...new Set([...defaultKnowledgeBaseTypes, ...savedKnowledgeBaseTypes])].sort((left, right) => left.localeCompare(right, "zh-CN")), [savedKnowledgeBaseTypes]);
  const tags = useMemo(() => [...new Set(cards.flatMap((card) => card.tags))].sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);
  const visibleCards = useMemo(() => filterAndSortCards(cards.filter((card) => showArchived ? card.status === "archived" : card.status !== "archived"), learningByCardId, { query, track: selectedTrack, tags: selectedTags, sort, direction: sortDirection }), [cards, learningByCardId, query, selectedTrack, selectedTags, sort, sortDirection, showArchived]);
  const hasFilters = Boolean(query || selectedTrack || selectedTags.size || sort !== "updated" || showArchived);
  const changeSort = (next: CardSort) => { setSort(next); setSortDirection(next === "review" || next === "difficulty" ? "asc" : "desc"); };
  const clearFilters = () => { setQuery(""); setSelectedTrack(""); setSelectedTags(new Set()); setSort("updated"); setSortDirection("desc"); setShowArchived(false); };
  const closeEditor = () => { if (editBusy) return; setEditingCard(null); setEditingDraft(null); setAiCandidates([]); };
  const openCardDetails = async (card: Card) => {
    setDetailLoading(card.id); setNotice("");
    try {
      const response = await fetch(`/api/cards/${card.id}/details`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法读取卡片详情。");
      setDetail({ card: data.card, relatedCards: data.relatedCards ?? [], learning: data.learning });
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法读取卡片详情。"); }
    finally { setDetailLoading(null); }
  };
  const openCardEditor = (card: Card) => {
    setEditingCard(card);
    setEditingDraft({ question: card.question, questionVariants: card.questionVariants.map((item) => ({ ...item })), relations: card.relations, answerPoints: card.answerPoints.map((item) => ({ ...item })), note: card.note, track: card.track, tags: card.tags.join(", "), source: card.source ?? "" });
    setAiCandidates([]);
    setNotice("");
  };
  const generateVariants = async (question: string, answerPoints: AnswerPoint[], existing: QuestionVariant[]) => {
    if (question.trim().length < 3 || !answerPoints.some((item) => item.content.trim())) { setNotice("请先填写主问题和至少一条答案要点，再让 AI 补充问法。"); return; }
    setAiBusy(true); setNotice("");
    try {
      const response = await fetch("/api/cards/question-variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, answerPoints: answerPoints.map((item) => item.content.trim()).filter(Boolean), existingQuestions: [...existing.map((item) => item.content), ...aiCandidates.map((item) => item.content)] }) });
      const data = await response.json();
      if (!response.ok) { if (data.requiresConfiguration) setNeedsLLMConfiguration(true); throw new Error(data.error ?? "暂时无法生成问法。"); }
      setAiCandidates((items) => [...items, ...data.candidates]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "暂时无法生成问法。"); }
    finally { setAiBusy(false); }
  };
  const saveCardEditor = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCard || !editingDraft) return;
    setEditBusy(true);
    try {
      const response = await fetch("/api/cards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingCard.id, ...editingDraft, track: editingDraft.track.trim(), tags: splitTags(editingDraft.tags) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法保存卡片。");
      setNotice(`“${data.card.question}”已更新，复习进度保持不变。`);
      setEditingCard(null); setEditingDraft(null); setAiCandidates([]); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法保存卡片。"); }
    finally { setEditBusy(false); }
  };

  const toggleSelected = (id: string) => setSelectedIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectFromCardSurface = (event: ReactMouseEvent<HTMLElement>, id: string) => {
    if (!selectedIds.size || targetsCardControl(event.target)) return;
    toggleSelected(id);
  };
  const selectFromCardKeyboard = (event: ReactKeyboardEvent<HTMLElement>, id: string) => {
    if (!selectedIds.size || targetsCardControl(event.target) || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggleSelected(id);
  };
  const bulk = async (action: "archive" | "restore" | "move" | "addTags" | "delete", value?: string | string[], ids = [...selectedIds]) => {
    if (!ids.length || (action === "delete" && !window.confirm(`永久删除 ${ids.length} 张卡片及其学习记录？此操作无法撤销。`))) return;
    const response = await fetch("/api/cards/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids, value }) });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error ?? "批量操作失败。"); return; }
    setSelectedIds(new Set()); setNotice(action === "delete" ? "已永久删除所选卡片和关联记录。" : "已更新所选卡片。"); await load();
  };
  const exportSelected = (format: "json" | "csv") => {
    const selected = cards.filter((card) => selectedIds.has(card.id));
    if (!selected.length) return;
    const content = format === "json" ? JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), cards: selected }, null, 2) : ["问题,其他问法,开场总述,答案,回忆提示,收束总结,知识库类型,标签,状态", ...selected.map((card) => { const opening = card.answerPoints.find((point) => point.role === "opening")?.content ?? ""; const closing = card.answerPoints.find((point) => point.role === "closing")?.content ?? ""; const core = card.answerPoints.filter((point) => point.role !== "opening" && point.role !== "closing"); return [card.question, card.questionVariants.map((point) => point.content).join("\n"), opening, core.map((point) => point.content).join("\n"), core.map((point) => point.hint).join("\n"), closing, card.track, card.tags.join("|"), card.status].map((value) => `\"${value.replaceAll("\"", "\"\"")}\"`).join(","); })].join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `mock-interview-cards.${format}`; link.click(); URL.revokeObjectURL(url);
  };

  return <PageLayout className="cards-library-page">{detail && <CardDetailsDialog card={detail.card} relatedCards={detail.relatedCards} learning={detail.learning} onClose={() => setDetail(null)} />}{difficultyPreviewOpen && <DifficultyPreviewDialog onClose={() => setDifficultyPreviewOpen(false)} />}<LLMConfigurationDialog open={needsLLMConfiguration} onClose={() => setNeedsLLMConfiguration(false)} purpose="AI 补充问法" />
    <PageHeader eyebrow={<><LibraryBig size={15}/> 卡片库</>} title="把积累的知识，随时翻出来练。" description="筛选、编辑或查看学习轨迹，让每一张卡片保持可用。" tour="library" actions={<Link href="/cards"><Button><FilePlus2 size={17}/> 创建或导入卡片</Button></Link>} />
    {notice && <div className="notice" role="status" style={{ marginBottom: 20 }}>{notice}</div>}
    {editingCard && editingDraft && <div className="card-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}><section className="card-editor-modal" role="dialog" aria-modal="true" aria-labelledby="card-editor-title"><div className="card-editor-heading"><div><p className="eyebrow"><PencilLine size={15}/> 编辑卡片</p><h2 id="card-editor-title">{editingDraft.question.trim() || "未命名问题"}</h2><p>修改内容不会重置已有的复习进度。</p></div><button className="icon-close" type="button" onClick={closeEditor} disabled={editBusy} aria-label="关闭编辑卡片"><X size={19}/></button></div><form className="card-editor-form" onSubmit={saveCardEditor}><QuestionWordingsEditor question={editingDraft.question} variants={editingDraft.questionVariants} candidates={aiCandidates} onChange={({ question, variants }) => setEditingDraft((draft) => draft ? { ...draft, question, questionVariants: variants } : draft)} onCandidatesChange={setAiCandidates} onGenerate={() => generateVariants(editingDraft.question, editingDraft.answerPoints, editingDraft.questionVariants)} busy={aiBusy}/><AnswerPointsEditor points={editingDraft.answerPoints} onChange={(answerPoints) => setEditingDraft({ ...editingDraft, answerPoints })} /> <RelatedCardsEditor cards={cards} value={editingDraft.relations} onChange={(relations) => setEditingDraft({ ...editingDraft, relations })} excludeId={editingCard.id} recommendations={editorRecommendations.relatedCards} recommendationState={editorRecommendations.state}/><label className="field card-note-field">学习备注<textarea rows={4} value={editingDraft.note} onChange={(event) => setEditingDraft({ ...editingDraft, note: event.target.value })} placeholder="记录来源、待核实的信息，或下一次复习时想提醒自己的事。" /></label><div className="form-grid two"><label className="field">知识库类型<SearchableSelect value={editingDraft.track} onChange={(track) => setEditingDraft({ ...editingDraft, track })} options={knowledgeBaseTypeSuggestions} placeholder="选择或输入新类型" ariaLabel="知识库类型" allowCustom required /></label><div className="tag-field-with-recommendations"><div className="field"><span>标签</span><SearchableSelect multiple value={splitTags(editingDraft.tags)} onChange={(values) => setEditingDraft((draft) => draft ? { ...draft, tags: values.join(", ") } : draft)} options={tags} placeholder="选择或输入标签" ariaLabel="标签" allowCustom menuPlacement="top" menuHeader={<TagRecommendations tags={editorRecommendations.tags} state={editorRecommendations.state} onAdd={(tag) => setEditingDraft((draft) => draft ? { ...draft, tags: splitTags([...splitTags(draft.tags), tag].join(", ")).join(", ") } : draft)}/>} /></div></div></div><div className="form-actions card-editor-actions"><Button type="button" variant="ghost" onClick={closeEditor} disabled={editBusy}>取消</Button><Button type="submit" disabled={editBusy}>{editBusy ? "正在保存…" : <><CheckCircle2 size={17}/> 保存修改</>}</Button></div></form></section></div>}
    <section className="cards-library"><div className="section-title"><h2>已沉淀的卡片</h2><span>{visibleCards.length} / {cards.length} 张</span></div>
      {cards.length > 0 && <><div className="cards-filter-bar" data-tour="library-filters" aria-label="卡片筛选与排序"><label className="card-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索问题、答案、标签或备注" aria-label="搜索卡片" /></label><SearchableSelect variant="filter" value={selectedTrack} onChange={setSelectedTrack} options={savedKnowledgeBaseTypes} placeholder="知识库类型" ariaLabel="筛选知识库类型" emptyText="暂无可选类型" /><SearchableSelect multiple variant="filter" value={[...selectedTags]} onChange={(values) => setSelectedTags(new Set(values))} options={tags} placeholder="标签" ariaLabel="筛选标签" emptyText="暂无可选标签" /><label className="filter-select">排序<select value={sort} onChange={(event) => changeSort(event.target.value as CardSort)}><option value="updated">最近更新</option><option value="created">最近创建</option><option value="review">复习时间</option><option value="practice">练习时间</option><option value="difficulty">难度</option></select></label><Button type="button" variant={showArchived ? "secondary" : "ghost"} onClick={() => { setShowArchived((value) => !value); setSelectedIds(new Set()); }}>{showArchived ? "查看活动卡片" : "查看已归档"}</Button>{sort !== "updated" && <button type="button" className="sort-direction" onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")} aria-label={sortDirection === "asc" ? "切换为降序" : "切换为升序"} title={sortDirection === "asc" ? "当前：升序" : "当前：降序"}><ArrowUpDown size={17}/>{sortDirection === "asc" ? "升序" : "降序"}</button>}{hasFilters && <button type="button" className="clear-card-filters" onClick={clearFilters}>清除筛选</button>}</div><div data-tour="library-selection">{selectedIds.size > 0 && <div className="bulk-card-toolbar" role="status"><strong>已选择 {selectedIds.size} 张</strong>{showArchived ? <Button variant="secondary" onClick={() => bulk("restore")}><Undo2 size={16}/> 恢复</Button> : <Button variant="secondary" onClick={() => bulk("archive")}><Archive size={16}/> 归档</Button>}<Button variant="ghost" onClick={() => { const value = window.prompt("添加标签（用逗号分隔）"); if (value) void bulk("addTags", splitTags(value)); }}><Tag size={16}/> 添加标签</Button><Button variant="ghost" onClick={() => { const value = window.prompt("移动到知识库类型"); if (value) void bulk("move", value); }}>移动类型</Button><Button variant="ghost" onClick={() => exportSelected("csv")}><Download size={16}/> CSV</Button><Button variant="ghost" onClick={() => exportSelected("json")}><Download size={16}/> JSON</Button><Button variant="danger" onClick={() => bulk("delete")}><Trash2 size={16}/> 永久删除</Button><button type="button" className="clear-card-filters" onClick={() => setSelectedIds(new Set())}>取消选择</button></div>}</div></>}
      {cards.length ? visibleCards.length ? <div className="card-grid">{visibleCards.map((card) => {
        const learning = learningByCardId[card.id];
        const tier = difficultyTier(learning?.fsrsDifficulty);
        const isTutorialCard = card.id === tutorialCardId;
        const selectionMode = selectedIds.size > 0;
        const selected = selectedIds.has(card.id);
        return <Panel
          className={`knowledge-card ${selectionMode ? "selection-mode" : ""} ${selected ? "selected" : ""}`}
          key={card.id}
          data-tour={isTutorialCard ? "tutorial-library-card" : "library-card"}
          tabIndex={selectionMode ? 0 : undefined}
          aria-label={selectionMode ? `${card.question}，${selected ? "已选择" : "未选择"}。按 Enter 或空格切换选择。` : undefined}
          onClick={(event) => selectFromCardSurface(event, card.id)}
          onKeyDown={(event) => selectFromCardKeyboard(event, card.id)}
          onPointerEnter={beginCardTilt}
          onPointerMove={updateCardTilt}
          onPointerLeave={resetCardTilt}
        >
          <div className="knowledge-card-top">
            <label className="card-select"><input type="checkbox" checked={selected} onChange={() => toggleSelected(card.id)} /> 选择</label>
            <div className="card-indicators">
              {(card.note.trim() || card.answerPoints.some((item) => item.note.trim())) && <span className="note-count"><MessageSquareText size={14}/> 有批注</span>}
              {tier && <button type="button" className={`difficulty-badge difficulty-trigger difficulty-${tier.label.toLowerCase()}`} onClick={() => setDifficultyPreviewOpen(true)} title={`FSRS 难度 ${learning?.fsrsDifficulty?.toFixed(1)} / 10；点击查看五档标签说明`} aria-label={`${tier.label} 难度，FSRS ${learning?.fsrsDifficulty?.toFixed(1)} / 10。点击查看五档标签说明`}>{tier.label}<small>{learning?.fsrsDifficulty?.toFixed(1)}</small></button>}
            </div>
          </div>
          <h3>{card.question}{card.questionVariants.length > 0 && <span className="variant-count"><Sparkles size={14}/> 另有 {card.questionVariants.length} 种问法</span>}</h3>
          <p>{card.answer}</p>
          {card.questionVariants.length > 0 && <details className="variant-details"><summary>查看其他问法</summary><ul>{card.questionVariants.map((item) => <li key={item.id}><span className={`variant-source ${item.source}`}>{item.source === "ai" ? "AI" : "我的"}</span>{item.content}</li>)}</ul></details>}
          <div className="card-learning-summary">
            <span><CalendarClock size={14}/> 下次：{compactReviewTime(learning?.nextReviewAt, true)}</span>
            <span><Clock3 size={14}/> 上次：{compactReviewTime(learning?.lastReviewAt)}</span>
          </div>
          <div className="card-meta"><Chip tone="blue">类型：{card.track}</Chip>{card.tags.map((tag) => <Chip key={tag} tone="ink">#{tag}</Chip>)}</div>
          {isTutorialCard && <p className="tutorial-library-note">演示完成后可点击“归档”暂时收起；若不再需要，勾选后在批量栏选择“永久删除”，它会同时移除学习记录。</p>}
          <div className="card-library-actions">{showArchived ? <Button type="button" variant="ghost" className="card-icon-action" data-tooltip="恢复卡片" aria-label="恢复卡片" title="恢复卡片" onClick={() => void bulk("restore", undefined, [card.id])}><Undo2 size={18}/></Button> : <><Button type="button" variant="ghost" className="card-icon-action" data-tooltip="编辑卡片" aria-label="编辑卡片" title="编辑卡片" onClick={() => openCardEditor(card)}><PencilLine size={18}/></Button><Button type="button" variant="ghost" className="card-icon-action" data-tooltip={detailLoading === card.id ? "正在读取卡片详情" : "查看卡片详情"} aria-label={detailLoading === card.id ? "正在读取卡片详情" : "查看卡片详情"} title={detailLoading === card.id ? "正在读取卡片详情" : "查看卡片详情"} disabled={detailLoading === card.id} onClick={() => openCardDetails(card)}><MoreHorizontal size={20}/></Button><Button type="button" variant="ghost" className="card-icon-action" data-tooltip="归档卡片" aria-label="归档卡片" title="归档卡片" onClick={() => void bulk("archive", undefined, [card.id])}><Archive size={18}/></Button></>}</div>
        </Panel>;
      })}</div> : <EmptyState title="没有符合条件的卡片" detail="换个关键词，或清除筛选条件再试试。" /> : <EmptyState title="你的题库还没有内容" detail="从一个你曾经答得不够顺的问题开始记录。" action={<Link href="/cards"><Button>创建第一张卡片</Button></Link>} />}
    </section>
  </PageLayout>;
}
