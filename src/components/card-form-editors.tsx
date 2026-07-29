"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Link2, Plus, Search, Sparkles, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { rankRelatedCardOptions } from "@/lib/related-card-options";
import { promoteQuestionVariant } from "@/lib/question-variants";
import type { AnswerPoint, AnswerPointRole, Card, CardRelation, CardRelationType, QuestionVariant } from "@/lib/types";

function pointId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `point-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const point = (role: AnswerPointRole = "key"): AnswerPoint => ({ id: pointId(), content: "", hint: "", note: "", role });
const variant = (): QuestionVariant => ({ id: pointId(), content: "", source: "manual" });

export function AnswerPointsEditor({ points, onChange, label = "答案要点" }: { points: AnswerPoint[]; onChange: (points: AnswerPoint[]) => void; label?: string }) {
  const update = (id: string, change: Partial<AnswerPoint>) => onChange(points.map((item) => item.id === id ? { ...item, ...change, role: "key" } : item));
  const move = (index: number, direction: -1 | 1) => { const next = [...points]; const target = index + direction; if (target < 0 || target >= points.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <fieldset className="answer-points"><legend>{label}</legend><p>每行一个能独立说出口的要点；用提示词保留回忆线索，而不是写出完整答案。</p>{points.map((item, index) => <div className="answer-point" key={item.id}><span>{index + 1}</span><div className="answer-point-fields"><textarea rows={2} value={item.content} onChange={(event) => update(item.id, { content: event.target.value })} placeholder={index === 0 ? "例如：初步召回关注覆盖率，重排序关注相关性。" : "补充一个要点…"} /><label className="hint-field">回忆提示（可选）<input value={item.hint} onChange={(event) => update(item.id, { hint: event.target.value })} placeholder="例如：两阶段目标" /></label><label className="point-note-field">要点批注（可选）<textarea rows={2} value={item.note} onChange={(event) => update(item.id, { note: event.target.value })} placeholder="例如：补充一个真实案例，或标记待核实的说法。" /></label></div><div className="point-controls"><button type="button" aria-label="上移要点" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15}/></button><button type="button" aria-label="下移要点" disabled={index === points.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15}/></button><button type="button" aria-label="删除要点" disabled={points.length === 1} onClick={() => onChange(points.filter((entry) => entry.id !== item.id))}><Trash2 size={15}/></button></div></div>)}<Button type="button" variant="ghost" className="add-point" onClick={() => onChange([...points, point()])}><Plus size={16}/> 添加答案要点</Button></fieldset>;
}

export function AnswerStructureEditor({ points, onChange, label = "答案结构" }: { points: AnswerPoint[]; onChange: (points: AnswerPoint[]) => void; label?: string }) {
  const opening = points.find((item) => item.role === "opening");
  const closing = points.find((item) => item.role === "closing");
  const core = points.filter((item) => item.role !== "opening" && item.role !== "closing").map((item) => ({ ...item, role: "key" as const }));
  const updateStructure = (role: "opening" | "closing", content: string) => {
    const existing = points.find((item) => item.role === role);
    if (existing) onChange(points.map((item) => item.id === existing.id ? { ...item, content, hint: "", note: "", role } : item));
    else onChange([...points, { ...point(role), content }]);
  };
  const updateCore = (nextCore: AnswerPoint[]) => onChange([...(opening ? [opening] : []), ...nextCore.map((item) => ({ ...item, role: "key" as const })), ...(closing ? [closing] : [])]);
  return <div className="answer-structure"><fieldset className="answer-bookend"><legend>开场总述（可选）</legend><p>先给出结论、定义或答题框架，让回答有清晰起点。</p><textarea rows={2} value={opening?.content ?? ""} onChange={(event) => updateStructure("opening", event.target.value)} placeholder="例如：我会从目标、关键机制和落地收益三个层面说明。" /></fieldset><AnswerPointsEditor points={core.length ? core : [point()]} onChange={updateCore} label={label === "答案结构" ? "核心答案要点" : label} /><fieldset className="answer-bookend closing"><legend>收束总结（可选）</legend><p>最后回扣结论、适用边界或落地建议，让答案完整结束。</p><textarea rows={2} value={closing?.content ?? ""} onChange={(event) => updateStructure("closing", event.target.value)} placeholder="例如：因此它既提升回答质量，也需要结合成本与场景权衡。" /></fieldset></div>;
}

export function QuestionWordingsEditor({ question, variants, candidates = [], onChange, onCandidatesChange, onGenerate, busy = false, label = "问题问法", includePrimary = true }: { question: string; variants: QuestionVariant[]; candidates?: QuestionVariant[]; onChange: (next: { question: string; variants: QuestionVariant[] }) => void; onCandidatesChange?: (candidates: QuestionVariant[]) => void; onGenerate?: () => void; busy?: boolean; label?: string; includePrimary?: boolean }) {
  const updateQuestion = (nextQuestion: string) => onChange({ question: nextQuestion, variants });
  const updateVariant = (id: string, content: string) => onChange({ question, variants: variants.map((item) => item.id === id ? { ...item, content } : item) });
  const moveVariant = (index: number, direction: -1 | 1) => {
    if (includePrimary && direction === -1 && index === 0) { onChange(promoteQuestionVariant(question, variants, index, pointId())); return; }
    const next = [...variants];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ question, variants: next });
  };
  const promoteFirstVariant = () => { if (includePrimary && variants.length) onChange(promoteQuestionVariant(question, variants, 0, pointId())); };
  const updateCandidate = (id: string, content: string) => onCandidatesChange?.(candidates.map((item) => item.id === id ? { ...item, content } : item));
  const dismissCandidate = (id: string) => onCandidatesChange?.(candidates.filter((item) => item.id !== id));
  const acceptCandidate = (item: QuestionVariant) => { if (!item.content.trim()) return; onChange({ question, variants: [...variants, item] }); dismissCandidate(item.id); };
  return <fieldset className="question-wordings"><legend>{label}</legend><div className="variant-intro"><p>{includePrimary ? "第一行是卡片主问题；其他问法与它共享答案和复习进度。" : "记录同一知识点的不同说法。它们共享答案与复习进度。"}</p>{onGenerate && <Button type="button" variant="secondary" className="ai-variant-button" disabled={busy} onClick={onGenerate}><Sparkles size={16}/>{busy ? "正在构思…" : "AI 补充 3 种问法"}</Button>}</div><div className="variant-list">{includePrimary && <div className="variant-row primary-question-row"><span className="variant-source primary">主问题</span><input required value={question} onChange={(event) => updateQuestion(event.currentTarget.value)} placeholder="例如：RAG 为什么需要重排序？" /><div className="point-controls"><button type="button" aria-label="下移主问题" disabled={!variants.length} onClick={promoteFirstVariant}><ArrowDown size={15}/></button></div></div>}{variants.map((item, index) => <div className="variant-row" key={item.id}><span className={`variant-source ${item.source}`}>{item.source === "ai" ? "AI 补充" : "我的问法"}</span><input value={item.content} onChange={(event) => updateVariant(item.id, event.currentTarget.value)} placeholder="换一种方式问同一个知识点…" /><div className="point-controls"><button type="button" aria-label={includePrimary && index === 0 ? "设为主问题" : "上移问法"} disabled={!includePrimary && index === 0} onClick={() => moveVariant(index, -1)}><ArrowUp size={15}/></button><button type="button" aria-label="下移问法" disabled={index === variants.length - 1} onClick={() => moveVariant(index, 1)}><ArrowDown size={15}/></button><button type="button" aria-label="删除问法" onClick={() => onChange({ question, variants: variants.filter((entry) => entry.id !== item.id) })}><Trash2 size={15}/></button></div></div>)}</div><Button type="button" variant="ghost" className="add-point" onClick={() => onChange({ question, variants: [...variants, variant()] })}><Plus size={16}/> 添加其他问法</Button>{candidates.length > 0 && <section className="ai-candidates"><div className="candidate-heading"><Sparkles size={17}/><div><strong>AI 候选问法</strong><p>确认它仍能用原答案回答，再逐条采纳。</p></div></div>{candidates.map((item) => <div className="candidate-row" key={item.id}><input value={item.content} onChange={(event) => updateCandidate(item.id, event.currentTarget.value)} aria-label="AI 候选问法" /><Button type="button" variant="secondary" onClick={() => acceptCandidate(item)}><Check size={15}/> 采纳</Button><button type="button" className="candidate-dismiss" aria-label="忽略候选问法" onClick={() => dismissCandidate(item.id)}><X size={16}/></button></div>)}</section>}</fieldset>;
}

export function QuestionVariantsEditor({ variants, candidates = [], onChange, onCandidatesChange, onGenerate, busy = false, label = "我的其他问法" }: { variants: QuestionVariant[]; candidates?: QuestionVariant[]; onChange: (variants: QuestionVariant[]) => void; onCandidatesChange?: (candidates: QuestionVariant[]) => void; onGenerate?: () => void; busy?: boolean; label?: string }) {
  return <QuestionWordingsEditor question="" variants={variants} candidates={candidates} onChange={({ variants: nextVariants }) => onChange(nextVariants)} onCandidatesChange={onCandidatesChange} onGenerate={onGenerate} busy={busy} label={label} includePrimary={false}/>;
}

type RecommendationDraft = { question: string; questionVariants: QuestionVariant[]; answerPoints: AnswerPoint[]; note: string; track: string; tags: string[] };
type CardRecommendation = { cardId: string; question: string; track: string; score: number };
export function useCardRecommendations(draft: RecommendationDraft, excludeId: string | undefined, relations: CardRelation[]) {
  const [result, setResult] = useState<{ relatedCards: CardRecommendation[]; tags: string[] }>({ relatedCards: [], tags: [] });
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const serializedDraft = JSON.stringify(draft);
  const excludedIds = JSON.stringify([excludeId, ...relations.map((relation) => relation.cardId)].filter((id): id is string => Boolean(id)).sort());

  useEffect(() => {
    if (draft.question.trim().length < 3) { setResult({ relatedCards: [], tags: [] }); setState("idle"); return; }
    const controller = new AbortController();
    const currentDraft = JSON.parse(serializedDraft) as RecommendationDraft;
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch("/api/cards/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: currentDraft, excludeCardIds: JSON.parse(excludedIds) }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setResult({ relatedCards: data.relatedCards ?? [], tags: data.tags ?? [] });
        setState("idle");
      } catch {
        if (controller.signal.aborted) return;
        setResult({ relatedCards: [], tags: [] });
        setState("error");
      }
    }, 700);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [draft.question, excludedIds, serializedDraft]);
  return { ...result, state };
}

export function RelatedCardsEditor({ cards, value, onChange, excludeId, recommendations = [], recommendationState = "idle" }: { cards: Card[]; value: CardRelation[]; onChange: (relations: CardRelation[]) => void; excludeId?: string; recommendations?: CardRecommendation[]; recommendationState?: "idle" | "loading" | "error" }) {
  const [query, setQuery] = useState("");
  const choices = cards.filter((card) => card.id !== excludeId);
  const selected = value.flatMap((relation) => {
    const card = choices.find((item) => item.id === relation.cardId);
    return card ? [{ card, relation }] : [];
  });
  const matches = rankRelatedCardOptions(choices, query, recommendations);
  const toggle = (id: string) => onChange(value.some((relation) => relation.cardId === id) ? value.filter((relation) => relation.cardId !== id) : [...value, { cardId: id, type: "related" }]);
  const updateType = (cardId: string, type: CardRelationType) => onChange(value.map((relation) => relation.cardId === cardId ? { ...relation, type } : relation));
  return <fieldset className="related-cards">
    <legend><Link2 size={15}/> 关联问题</legend>
    <p>语义推荐默认加入为相关问题；也可将本卡设为对方的父问题或子问题。每张卡的学习进度始终独立。</p>
    {choices.length ? <>
      <label className="related-card-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索已有问题、类型或标签" aria-label="搜索关联问题" /></label>
      {recommendationState === "loading" && <p className="recommendation-status" role="status">正在理解整张卡片内容并排序…</p>}
      {recommendationState === "error" && <p className="recommendation-status error" role="status">本地语义模型暂不可用；你仍可手动设置关联问题。</p>}
      <div className="related-card-options" role="list" aria-label="可关联的问题">{matches.length ? matches.map(({ card, score }) => {
        const active = value.some((relation) => relation.cardId === card.id);
        return <button type="button" className={active ? "selected" : ""} key={card.id} onClick={() => toggle(card.id)} aria-pressed={active}><span>{active ? <Check size={15}/> : <Plus size={15}/>}</span><strong>{card.question}</strong><small>{score === undefined ? card.track : `${score}% · ${card.track}`}</small></button>;
      }) : <p>没有匹配的问题。</p>}</div>
      {selected.length > 0 && <div className="related-card-selection" aria-label="已关联的问题">{selected.map(({ card, relation }) => <div key={card.id}><strong>{card.question}</strong><select value={relation.type} onChange={(event) => updateType(card.id, event.target.value as CardRelationType)} aria-label={`${card.question} 的关系类型`}><option value="related">相关问题</option><option value="parent">本卡是父问题</option><option value="child">本卡是子问题</option></select><button type="button" onClick={() => toggle(card.id)} aria-label={`移除关联问题 ${card.question}`}><X size={13}/></button></div>)}</div>}
    </> : <div className="related-card-empty">先保存至少一张其他卡片，才能在这里建立关联。</div>}
  </fieldset>;
}

export function TagRecommendations({ tags, onAdd, state = "idle" }: { tags: string[]; onAdd: (tag: string) => void; state?: "idle" | "loading" | "error" }) {
  if (!tags.length && state !== "loading") return null;
  return <div className="tag-recommendations" aria-live="polite"><span><Tags size={14}/> {state === "loading" ? "正在推荐标签…" : "推荐标签"}</span>{tags.map((tag) => <button type="button" key={tag} onPointerDown={(event) => event.preventDefault()} onClick={() => onAdd(tag)}><Plus size={14}/>{tag}</button>)}</div>;
}
