"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, PencilLine, X } from "lucide-react";
import { AnswerStructureEditor, QuestionWordingsEditor, RelatedCardsEditor, TagRecommendations, useCardRecommendations } from "@/components/card-form-editors";
import { LLMConfigurationDialog } from "@/components/llm-configuration-dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui";
import { splitTags } from "@/lib/import";
import type { AnswerPoint, Card, CardRelation, QuestionVariant } from "@/lib/types";

type Draft = { question: string; questionVariants: QuestionVariant[]; relations: CardRelation[]; answerPoints: AnswerPoint[]; note: string; track: string; tags: string; source: string };

function draftFrom(card: Card): Draft {
  return { question: card.question, questionVariants: card.questionVariants.map((item) => ({ ...item })), relations: card.relations.map((item) => ({ ...item })), answerPoints: card.answerPoints.map((item) => ({ ...item })), note: card.note, track: card.track, tags: card.tags.join(", "), source: card.source ?? "" };
}

export function ReviewCardEditorDialog({ card, onClose, onSaved }: { card: Card; onClose: () => void; onSaved: (card: Card) => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(card));
  const [cards, setCards] = useState<Card[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tracks, setTracks] = useState<string[]>([card.track]);
  const [candidates, setCandidates] = useState<QuestionVariant[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsLLMConfiguration, setNeedsLLMConfiguration] = useState(false);
  const recommendationDraft = useMemo(() => ({ question: draft.question, questionVariants: draft.questionVariants, answerPoints: draft.answerPoints, note: draft.note, track: draft.track, tags: splitTags(draft.tags) }), [draft]);
  const recommendations = useCardRecommendations(recommendationDraft, card.id, draft.relations);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/cards/options", { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ cards: Card[] }>; }),
      fetch("/api/cards?limit=100", { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ facets: { tracks: string[]; tags: string[] } }>; }),
    ]).then(([options, catalog]) => { setCards(options.cards); setTracks(catalog.facets.tracks); setTags(catalog.facets.tags); }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const generateVariants = async () => {
    if (draft.question.trim().length < 3 || !draft.answerPoints.some((point) => point.content.trim())) { setError("请先填写主问题和至少一条答案要点，再让 AI 补充问法。"); return; }
    setAiBusy(true); setError("");
    try {
      const response = await fetch("/api/cards/question-variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: draft.question, answerPoints: draft.answerPoints.map((point) => point.content.trim()).filter(Boolean), existingQuestions: [...draft.questionVariants.map((item) => item.content), ...candidates.map((item) => item.content)] }) });
      const data = await response.json();
      if (!response.ok) { if (data.requiresConfiguration) setNeedsLLMConfiguration(true); throw new Error(data.error ?? "暂时无法生成问法。"); }
      setCandidates((current) => [...current, ...data.candidates]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "暂时无法生成问法。"); }
    finally { setAiBusy(false); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/cards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: card.id, ...draft, track: draft.track.trim(), tags: splitTags(draft.tags) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法保存卡片。");
      onSaved(data.card); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法保存卡片。"); }
    finally { setBusy(false); }
  };

  return <div className="card-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="card-editor-modal" role="dialog" aria-modal="true" aria-labelledby="review-card-editor-title" aria-busy={busy}><LLMConfigurationDialog open={needsLLMConfiguration} onClose={() => setNeedsLLMConfiguration(false)} purpose="AI 补充问法" /><div className="card-editor-heading"><div><p className="eyebrow"><PencilLine size={15}/> 编辑卡片</p><h2 id="review-card-editor-title">{draft.question.trim() || "未命名问题"}</h2><p>修改内容不会重置已有的复习进度。</p></div><button className="icon-close" type="button" onClick={onClose} disabled={busy} aria-label="关闭编辑卡片"><X size={19}/></button></div>{error && <div className="card-editor-save-error" role="alert">{error}</div>}<form className="card-editor-form" onSubmit={save}><QuestionWordingsEditor question={draft.question} variants={draft.questionVariants} candidates={candidates} onChange={({ question, variants }) => setDraft((current) => ({ ...current, question, questionVariants: variants }))} onCandidatesChange={setCandidates} onGenerate={generateVariants} busy={aiBusy}/><AnswerStructureEditor points={draft.answerPoints} onChange={(answerPoints) => setDraft((current) => ({ ...current, answerPoints }))} /><RelatedCardsEditor cards={cards} value={draft.relations} onChange={(relations) => setDraft((current) => ({ ...current, relations }))} excludeId={card.id} recommendations={recommendations.relatedCards} recommendationState={recommendations.state}/><label className="field card-note-field">学习备注<textarea rows={4} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="记录来源、待核实的信息，或下一次复习时想提醒自己的事。" /></label><div className="form-grid two"><label className="field">知识库类型<SearchableSelect value={draft.track} onChange={(track) => setDraft((current) => ({ ...current, track }))} options={tracks} placeholder="选择或输入新类型" ariaLabel="知识库类型" allowCustom required /></label><div className="tag-field-with-recommendations"><div className="field"><span>标签</span><SearchableSelect multiple value={splitTags(draft.tags)} onChange={(values) => setDraft((current) => ({ ...current, tags: values.join(", ") }))} options={tags} placeholder="选择或输入标签" ariaLabel="标签" allowCustom menuPlacement="top" menuHeader={<TagRecommendations tags={recommendations.tags} state={recommendations.state} onAdd={(tag) => setDraft((current) => ({ ...current, tags: splitTags([...splitTags(current.tags), tag].join(", ")).join(", ") }))}/>} /></div></div></div><div className="form-actions card-editor-actions"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>取消</Button><Button type="submit" disabled={busy}>{busy ? "正在保存…" : <><CheckCircle2 size={17}/> 保存修改</>}</Button></div></form></section></div>;
}
