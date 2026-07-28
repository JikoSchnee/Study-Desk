"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit, ChevronLeft, ChevronRight, Dices, Lightbulb } from "lucide-react";
import { Button, Chip, EmptyState } from "@/components/ui";
import { SpeechRecorder } from "@/components/speech-recorder";
import { AnswerComparisonView } from "@/components/answer-comparison";
import { ComparisonModeControl } from "@/components/comparison-mode-control";
import { SemanticComparisonProgress } from "@/components/semantic-comparison-progress";
import { useSemanticComparisonProgress } from "@/components/use-semantic-comparison-progress";
import { difficultyTier } from "@/lib/card-filters";
import type { AnswerComparisonMode, Card, CardLearningSummary, Evaluation, RatingName } from "@/lib/types";

type SessionMode = "review" | "random";

export default function ReviewPage() {
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [learning, setLearning] = useState<CardLearningSummary | null>(null);
  const [presentedQuestion, setPresentedQuestion] = useState("");
  const [mode, setMode] = useState<SessionMode>("review");
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeHint, setActiveHint] = useState<number | null>(null);
  const [seenRandomIds, setSeenRandomIds] = useState<string[]>([]);
  const [reviewSessionTotal, setReviewSessionTotal] = useState(0);
  const [reviewCompleted, setReviewCompleted] = useState(0);
  const [comparisonMode, setComparisonMode] = useState<AnswerComparisonMode>("embedding");
  const [llmConfigured, setLlmConfigured] = useState(false);
  const semanticProgress = useSemanticComparisonProgress();

  useEffect(() => { fetch("/api/settings").then((response) => response.json()).then((settings) => { const configured = Boolean(settings.llmConfigured); setComparisonMode(settings.answerComparisonMode === "llm" && configured ? "llm" : "embedding"); setLlmConfigured(configured); }).catch(() => undefined); }, []);

  const requestCard = useCallback(async (nextMode: SessionMode, excludedIds: string[] = [], advanceReview = false) => {
    setCard(undefined);
    setMode(nextMode);
    setAnswer("");
    setEvaluation(null);
    setActiveHint(null);
    setPresentedQuestion("");
    setLearning(null);
    const query = excludedIds.length ? `?${excludedIds.map((id) => `exclude=${encodeURIComponent(id)}`).join("&")}` : "";
    const endpoint = nextMode === "random" ? `/api/review/random${query}` : "/api/review/next";
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error("无法读取下一张卡片");
      const data = await response.json();
      setCard(data.card ?? null);
      setLearning(data.learning ?? null);
      setPresentedQuestion(data.presentedQuestion ?? data.card?.question ?? "");
      if (nextMode === "review") {
        if (advanceReview) {
          setReviewCompleted((current) => {
            const completed = current + 1;
            setReviewSessionTotal((total) => Math.max(total, completed + Number(data.dueCount ?? 0)));
            return completed;
          });
        } else {
          setReviewSessionTotal(Number(data.dueCount ?? 0));
          setReviewCompleted(0);
        }
      }
      if (nextMode === "random" && data.card?.id) setSeenRandomIds((ids) => ids.includes(data.card.id) ? ids : [...ids, data.card.id]);
    } catch { setCard(null); }
  }, []);

  const loadReview = useCallback((advance = false) => requestCard("review", [], advance), [requestCard]);
  const loadRandom = useCallback(() => requestCard("random", seenRandomIds), [requestCard, seenRandomIds]);
  useEffect(() => { loadReview(); }, [loadReview]);

  const evaluate = async () => {
    if (!card || !answer.trim()) return;
    setBusy(true);
    try {
      const result = await semanticProgress.request<{ evaluation?: Evaluation }>("/api/review/submit", { action: "evaluate", cardId: card.id, presentedQuestion, answer, comparisonMode }, comparisonMode === "embedding");
      if (result.evaluation) setEvaluation(result.evaluation);
    } finally { setBusy(false); }
  };

  const confirm = async (rating: RatingName) => {
    if (!card) return;
    setBusy(true);
    try {
      const result = await semanticProgress.request<{ error?: string }>("/api/review/submit", { action: "confirm", cardId: card.id, presentedQuestion, answer, rating, comparisonMode }, comparisonMode === "embedding");
      if (result.error) return;
      await loadReview(true);
    } finally { setBusy(false); }
  };

  if (card === undefined) return <div className="loading">正在准备下一道{mode === "random" ? "随机练习题" : "复习题"}…</div>;
  if (!card) return <>
    <header className="page-header">
      <div>
        <p className="eyebrow"><BrainCircuit size={15}/> {mode === "random" ? "随机练习" : "主动回忆"}</p>
        <h1>{mode === "random" ? "题库还没有可抽取的卡片。" : "今天的复习清空了。"}</h1>
        <p>{mode === "random" ? "创建一张未归档卡片后，就可以开始随机练习。" : reviewSessionTotal ? `本轮已完成 ${reviewCompleted} / ${reviewSessionTotal} 题。` : "新卡完成首次作答后，会在这里排队。"}</p>
      </div>
      <Button variant="secondary" onClick={loadRandom}><Dices size={17}/> 随机抽题</Button>
    </header>
    <EmptyState title={mode === "random" ? "还没有可练习的卡片" : "还没有待复习卡片"} detail="先创建一张卡片，把一个知识点练成能说出口的话。" action={<Link href="/cards"><Button>去建立卡片</Button></Link>} />
  </>;

  const hints = card.answerPoints.map((point) => point.hint.trim()).filter(Boolean);
  const isRandom = mode === "random";
  const difficulty = difficultyTier(learning?.fsrsDifficulty);
  const otherQuestions = [card.question, ...card.questionVariants.map((item) => item.content)].filter((question) => question !== presentedQuestion);
  const MoreQuestions = () => otherQuestions.length > 0 ? <section className="more-questions"><p className="eyebrow">这题还可能这样问</p><ul>{otherQuestions.map((question) => <li key={question}>{question}</li>)}</ul></section> : null;
  const switchHint = (direction: -1 | 1) => setActiveHint((current) => current === null ? 0 : Math.max(0, Math.min(hints.length - 1, current + direction)));
  const handleHintKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" && activeHint !== null && activeHint > 0) { event.preventDefault(); switchHint(-1); }
    if (event.key === "ArrowRight" && activeHint !== null && activeHint < hints.length - 1) { event.preventDefault(); switchHint(1); }
  };

  return <>
    <SemanticComparisonProgress open={semanticProgress.open} progress={semanticProgress.progress}/>
    <header className="page-header">
      <div>
        <p className="eyebrow"><BrainCircuit size={15}/> {isRandom ? "随机练习" : "主动回忆"}</p>
        <h1>{isRandom ? "随机抽一题，说说看。" : "先想，再看答案。"}</h1>
        <p>{isRandom ? "这次练习只提供反馈，不会影响复习排程。" : "说不完整没关系，关键是把思路调出来。"}</p>
      </div>
      <div className="header-actions">
        {isRandom ? <Chip tone="blue">随机练习</Chip> : reviewSessionTotal > 0 && <Chip tone="green">第 {Math.min(reviewCompleted + 1, reviewSessionTotal)} / {reviewSessionTotal} 题 · 按到期时间</Chip>}
        <Button variant="secondary" onClick={loadRandom}><Dices size={17}/> 随机抽题</Button>
      </div>
    </header>
    <article className="review-card">
      <div><div className="review-question-heading"><p className="eyebrow">问题</p>{difficulty && <span className={`difficulty-badge difficulty-${difficulty.label.toLowerCase()}`} title={`FSRS 难度 ${learning?.fsrsDifficulty?.toFixed(1)} / 10`}>难度 {difficulty.label}<small>{learning?.fsrsDifficulty?.toFixed(1)}</small></span>}</div><h2 className="review-question">{presentedQuestion}</h2></div>
      {!evaluation ? <div className="form-grid">
        {activeHint !== null && <section className="review-hints" aria-live="polite" aria-label="回忆提示" tabIndex={0} onKeyDown={handleHintKeys}>
          <div className="review-hint"><Lightbulb size={17}/><div className="review-hint-content"><div className="hint-title"><strong>提示 {activeHint + 1}/{hints.length}</strong><span>可用左右方向键切换</span></div><p>{hints[activeHint]}</p><div className="hint-navigation"><button type="button" aria-label="上一条提示" disabled={activeHint === 0} onClick={() => switchHint(-1)}><ChevronLeft size={17}/> 上一条</button><span>{activeHint + 1} / {hints.length}</span><button type="button" aria-label="下一条提示" disabled={activeHint === hints.length - 1} onClick={() => switchHint(1)}>下一条 <ChevronRight size={17}/></button></div></div></div>
        </section>}
        <textarea className="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="建议按要点分行作答（如 1. … 换行 2. …），识别和高亮效果最佳。" />
        <ComparisonModeControl mode={comparisonMode} onChange={setComparisonMode} llmConfigured={llmConfigured} compact />
        <div className="form-actions">
          {hints.length ? <Button type="button" variant="ghost" className="hint-button" onClick={() => setActiveHint((current) => current === null ? 0 : null)}><Lightbulb size={17}/>{activeHint === null ? "需要提示" : "收起提示"}</Button> : <p className="hint-unavailable"><Lightbulb size={16}/> 此卡暂未设置提示</p>}
          <SpeechRecorder onTranscript={(value) => setAnswer((old) => `${old}${old ? "\n" : ""}${value}`)} />
          <Button disabled={!answer.trim() || busy} onClick={evaluate}>{busy ? "正在准备比对…" : "提交回答"}</Button>
        </div>
      </div> : isRandom ? <div className="random-feedback">
        <div className="feedback"><strong>{evaluation.score} 分 · 随机练习反馈</strong><p>{evaluation.feedback}</p>{evaluation.gaps.length > 0 && <p>待补充：{evaluation.gaps.join("、")}</p>}</div>
        <AnswerComparisonView comparison={evaluation.comparison} answer={answer}/><MoreQuestions/>
        <Button variant="secondary" onClick={loadRandom}><Dices size={17}/> 再抽一题</Button>
      </div> : <div className="stack">
        <div className="feedback"><strong>{evaluation.score} 分 · 建议：{evaluation.suggestedRating}</strong><p>{evaluation.feedback}</p>{evaluation.gaps.length > 0 && <p>待补充：{evaluation.gaps.join("、")}</p>}</div>
        <AnswerComparisonView comparison={evaluation.comparison} answer={answer}/><MoreQuestions/>
        <div><p className="eyebrow">确认本次记忆状态</p><div className="rating-row"><Button className="again" disabled={busy} onClick={() => confirm("again")}>忘记</Button><Button className="hard" disabled={busy} onClick={() => confirm("hard")}>困难</Button><Button className="good" disabled={busy} onClick={() => confirm("good")}>良好</Button><Button className="easy" disabled={busy} onClick={() => confirm("easy")}>轻松</Button></div></div>
      </div>}
    </article>
    {isRandom && <div className="form-actions" style={{ marginTop: 18 }}><Button variant="ghost" onClick={loadRandom}><Dices size={17}/> 再抽一题</Button></div>}
  </>;
}
