"use client";

import { ArrowDown, ArrowUp, Check, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { AnswerPoint, AnswerPointRole, QuestionVariant } from "@/lib/types";

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

export function QuestionVariantsEditor({ variants, candidates = [], onChange, onCandidatesChange, onGenerate, busy = false, label = "我的其他问法" }: { variants: QuestionVariant[]; candidates?: QuestionVariant[]; onChange: (variants: QuestionVariant[]) => void; onCandidatesChange?: (candidates: QuestionVariant[]) => void; onGenerate?: () => void; busy?: boolean; label?: string }) {
  const update = (id: string, content: string) => onChange(variants.map((item) => item.id === id ? { ...item, content } : item));
  const move = (index: number, direction: -1 | 1) => { const next = [...variants]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  const updateCandidate = (id: string, content: string) => onCandidatesChange?.(candidates.map((item) => item.id === id ? { ...item, content } : item));
  const dismissCandidate = (id: string) => onCandidatesChange?.(candidates.filter((item) => item.id !== id));
  const acceptCandidate = (item: QuestionVariant) => { if (!item.content.trim()) return; onChange([...variants, item]); dismissCandidate(item.id); };
  return <fieldset className="question-variants"><legend>{label}</legend><div className="variant-intro"><p>记录同一知识点的不同说法。它们共享答案与复习进度。</p>{onGenerate && <Button type="button" variant="secondary" className="ai-variant-button" disabled={busy} onClick={onGenerate}><Sparkles size={16}/>{busy ? "正在构思…" : "AI 补充 3 种问法"}</Button>}</div>{variants.length > 0 && <div className="variant-list">{variants.map((item, index) => <div className="variant-row" key={item.id}><span className={`variant-source ${item.source}`}>{item.source === "ai" ? "AI 补充" : "我的问法"}</span><input value={item.content} onChange={(event) => update(item.id, event.target.value)} placeholder="换一种方式问同一个知识点…" /><div className="point-controls"><button type="button" aria-label="上移问法" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15}/></button><button type="button" aria-label="下移问法" disabled={index === variants.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15}/></button><button type="button" aria-label="删除问法" onClick={() => onChange(variants.filter((entry) => entry.id !== item.id))}><Trash2 size={15}/></button></div></div>)}</div>}<Button type="button" variant="ghost" className="add-point" onClick={() => onChange([...variants, variant()])}><Plus size={16}/> 添加我的问法</Button>{candidates.length > 0 && <section className="ai-candidates"><div className="candidate-heading"><Sparkles size={17}/><div><strong>AI 候选问法</strong><p>确认它仍能用原答案回答，再逐条采纳。</p></div></div>{candidates.map((item) => <div className="candidate-row" key={item.id}><input value={item.content} onChange={(event) => updateCandidate(item.id, event.target.value)} aria-label="AI 候选问法" /><Button type="button" variant="secondary" onClick={() => acceptCandidate(item)}><Check size={15}/> 采纳</Button><button type="button" className="candidate-dismiss" aria-label="忽略候选问法" onClick={() => dismissCandidate(item.id)}><X size={16}/></button></div>)}</section>}</fieldset>;
}
