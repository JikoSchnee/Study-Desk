"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, BookOpenText, CalendarClock, CheckCircle2, Clock3, FilePlus2, LibraryBig, MessageSquareText, PencilLine, Search, Sparkles, X } from "lucide-react";
import { CardDetailsDialog } from "@/components/card-details-dialog";
import { AnswerPointsEditor, QuestionVariantsEditor } from "@/components/card-form-editors";
import { DifficultyPreviewDialog } from "@/components/difficulty-preview-dialog";
import { LLMConfigurationDialog } from "@/components/llm-configuration-dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { Button, Chip, EmptyState, Panel } from "@/components/ui";
import { difficultyTier, filterAndSortCards, type CardSort, type SortDirection } from "@/lib/card-filters";
import { splitTags } from "@/lib/import";
import type { AnswerPoint, Card, CardLearningDetails, CardLearningSummary, QuestionVariant } from "@/lib/types";

type CardDraft = { question: string; questionVariants: QuestionVariant[]; answerPoints: AnswerPoint[]; note: string; track: string; tags: string; source: string };
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

export function CardLibrary() {
  const [cards, setCards] = useState<Card[]>([]);
  const [learningByCardId, setLearningByCardId] = useState<Record<string, CardLearningSummary>>({});
  const [detail, setDetail] = useState<{ card: Card; learning: CardLearningDetails } | null>(null);
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

  const load = useCallback(() => fetch("/api/cards").then((response) => response.json()).then((data) => { setCards(data.cards); setLearningByCardId(data.learning ?? {}); }), []);
  useEffect(() => { load(); }, [load]);

  const savedKnowledgeBaseTypes = useMemo(() => [...new Set(cards.map((card) => card.track))].sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);
  const knowledgeBaseTypeSuggestions = useMemo(() => [...new Set([...defaultKnowledgeBaseTypes, ...savedKnowledgeBaseTypes])].sort((left, right) => left.localeCompare(right, "zh-CN")), [savedKnowledgeBaseTypes]);
  const tags = useMemo(() => [...new Set(cards.flatMap((card) => card.tags))].sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);
  const visibleCards = useMemo(() => filterAndSortCards(cards, learningByCardId, { query, track: selectedTrack, tags: selectedTags, sort, direction: sortDirection }), [cards, learningByCardId, query, selectedTrack, selectedTags, sort, sortDirection]);
  const hasFilters = Boolean(query || selectedTrack || selectedTags.size || sort !== "updated");
  const changeSort = (next: CardSort) => { setSort(next); setSortDirection(next === "review" || next === "difficulty" ? "asc" : "desc"); };
  const clearFilters = () => { setQuery(""); setSelectedTrack(""); setSelectedTags(new Set()); setSort("updated"); setSortDirection("desc"); };
  const closeEditor = () => { if (editBusy) return; setEditingCard(null); setEditingDraft(null); setAiCandidates([]); };
  const openCardDetails = async (card: Card) => {
    setDetailLoading(card.id); setNotice("");
    try {
      const response = await fetch(`/api/cards/${card.id}/details`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法读取卡片详情。");
      setDetail({ card: data.card, learning: data.learning });
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法读取卡片详情。"); }
    finally { setDetailLoading(null); }
  };
  const openCardEditor = (card: Card) => {
    setEditingCard(card);
    setEditingDraft({ question: card.question, questionVariants: card.questionVariants.map((item) => ({ ...item })), answerPoints: card.answerPoints.map((item) => ({ ...item })), note: card.note, track: card.track, tags: card.tags.join(", "), source: card.source ?? "" });
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

  return <div className="cards-library-page">{detail && <CardDetailsDialog card={detail.card} learning={detail.learning} onClose={() => setDetail(null)} />}{difficultyPreviewOpen && <DifficultyPreviewDialog onClose={() => setDifficultyPreviewOpen(false)} />}<LLMConfigurationDialog open={needsLLMConfiguration} onClose={() => setNeedsLLMConfiguration(false)} purpose="AI 补充问法" />
    <header className="page-header"><div><p className="eyebrow"><LibraryBig size={15}/> 卡片库</p><h1>把积累的知识，随时翻出来练。</h1><p>筛选、编辑或查看学习轨迹，让每一张卡片保持可用。</p></div><Link href="/cards"><Button><FilePlus2 size={17}/> 创建或导入卡片</Button></Link></header>
    {notice && <div className="notice" role="status" style={{ marginBottom: 20 }}>{notice}</div>}
    {editingCard && editingDraft && <div className="card-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}><section className="card-editor-modal" role="dialog" aria-modal="true" aria-labelledby="card-editor-title"><div className="card-editor-heading"><div><p className="eyebrow"><PencilLine size={15}/> 编辑卡片</p><h2 id="card-editor-title">让这张卡更好回答。</h2><p>修改内容不会重置已有的复习进度。</p></div><button className="icon-close" type="button" onClick={closeEditor} disabled={editBusy} aria-label="关闭编辑卡片"><X size={19}/></button></div><form className="card-editor-form" onSubmit={saveCardEditor}><label className="field">主问题<input required value={editingDraft.question} onChange={(event) => setEditingDraft({ ...editingDraft, question: event.target.value })} /></label><AnswerPointsEditor points={editingDraft.answerPoints} onChange={(answerPoints) => setEditingDraft({ ...editingDraft, answerPoints })} /><QuestionVariantsEditor variants={editingDraft.questionVariants} candidates={aiCandidates} onChange={(questionVariants) => setEditingDraft({ ...editingDraft, questionVariants })} onCandidatesChange={setAiCandidates} onGenerate={() => generateVariants(editingDraft.question, editingDraft.answerPoints, editingDraft.questionVariants)} busy={aiBusy}/><label className="field card-note-field">学习备注<textarea rows={4} value={editingDraft.note} onChange={(event) => setEditingDraft({ ...editingDraft, note: event.target.value })} placeholder="记录来源、待核实的信息，或下一次复习时想提醒自己的事。" /></label><div className="form-grid two"><label className="field">知识库类型<SearchableSelect value={editingDraft.track} onChange={(track) => setEditingDraft({ ...editingDraft, track })} options={knowledgeBaseTypeSuggestions} placeholder="选择或输入新类型" ariaLabel="知识库类型" allowCustom required /></label><label className="field">标签<SearchableSelect multiple value={splitTags(editingDraft.tags)} onChange={(values) => setEditingDraft({ ...editingDraft, tags: values.join(", ") })} options={tags} placeholder="选择或输入标签" ariaLabel="标签" allowCustom /></label></div><div className="form-actions card-editor-actions"><Button type="button" variant="ghost" onClick={closeEditor} disabled={editBusy}>取消</Button><Button type="submit" disabled={editBusy}>{editBusy ? "正在保存…" : <><CheckCircle2 size={17}/> 保存修改</>}</Button></div></form></section></div>}
    <section className="cards-library"><div className="section-title"><h2>已沉淀的卡片</h2><span>{visibleCards.length} / {cards.length} 张</span></div>
      {cards.length > 0 && <div className="cards-filter-bar" aria-label="卡片筛选与排序"><label className="card-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索问题、答案、标签或备注" aria-label="搜索卡片" /></label><SearchableSelect variant="filter" value={selectedTrack} onChange={setSelectedTrack} options={savedKnowledgeBaseTypes} placeholder="知识库类型" ariaLabel="筛选知识库类型" emptyText="暂无可选类型" /><SearchableSelect multiple variant="filter" value={[...selectedTags]} onChange={(values) => setSelectedTags(new Set(values))} options={tags} placeholder="标签" ariaLabel="筛选标签" emptyText="暂无可选标签" /><label className="filter-select">排序<select value={sort} onChange={(event) => changeSort(event.target.value as CardSort)}><option value="updated">最近更新</option><option value="review">复习时间</option><option value="practice">练习时间</option><option value="difficulty">难度</option></select></label>{sort !== "updated" && <button type="button" className="sort-direction" onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")} aria-label={sortDirection === "asc" ? "切换为降序" : "切换为升序"} title={sortDirection === "asc" ? "当前：升序" : "当前：降序"}><ArrowUpDown size={17}/>{sortDirection === "asc" ? "升序" : "降序"}</button>}{hasFilters && <button type="button" className="clear-card-filters" onClick={clearFilters}>清除筛选</button>}</div>}
      {cards.length ? visibleCards.length ? <div className="card-grid">{visibleCards.map((card) => { const learning = learningByCardId[card.id]; const tier = difficultyTier(learning?.fsrsDifficulty); return <Panel className="knowledge-card" key={card.id}><div className="knowledge-card-top"><div className="card-indicators">{tier && <button type="button" className={`difficulty-badge difficulty-trigger difficulty-${tier.label.toLowerCase()}`} onClick={() => setDifficultyPreviewOpen(true)} title={`FSRS 难度 ${learning?.fsrsDifficulty?.toFixed(1)} / 10；点击查看五档标签说明`} aria-label={`${tier.label} 难度，FSRS ${learning?.fsrsDifficulty?.toFixed(1)} / 10。点击查看五档标签说明`}>{tier.label}<small>{learning?.fsrsDifficulty?.toFixed(1)}</small></button>}{(card.note.trim() || card.answerPoints.some((item) => item.note.trim())) && <span className="note-count"><MessageSquareText size={14}/> 有批注</span>}</div></div><h3>{card.question}{card.questionVariants.length > 0 && <span className="variant-count"><Sparkles size={14}/> 另有 {card.questionVariants.length} 种问法</span>}</h3><p>{card.answer}</p>{card.questionVariants.length > 0 && <details className="variant-details"><summary>查看其他问法</summary><ul>{card.questionVariants.map((item) => <li key={item.id}><span className={`variant-source ${item.source}`}>{item.source === "ai" ? "AI" : "我的"}</span>{item.content}</li>)}</ul></details>}<div className="card-learning-summary"><span><CalendarClock size={14}/> 下次：{compactReviewTime(learning?.nextReviewAt, true)}</span><span><Clock3 size={14}/> 上次：{compactReviewTime(learning?.lastReviewAt)}</span></div><div className="card-meta">{card.tags.map((tag) => <Chip key={tag} tone="ink">#{tag}</Chip>)}</div><div className="card-library-actions"><Button type="button" variant="ghost" className="manage-variants" onClick={() => openCardEditor(card)}><PencilLine size={16}/> 编辑卡片</Button><Button type="button" variant="outline" className="card-details-button" disabled={detailLoading === card.id} onClick={() => openCardDetails(card)}><BookOpenText size={16}/>{detailLoading === card.id ? "正在读取" : "卡片详情"}</Button></div></Panel>; })}</div> : <EmptyState title="没有符合条件的卡片" detail="换个关键词，或清除筛选条件再试试。" /> : <EmptyState title="你的题库还没有内容" detail="从一个你曾经答得不够顺的问题开始记录。" action={<Link href="/cards"><Button>创建第一张卡片</Button></Link>} />}
    </section>
  </div>;
}
