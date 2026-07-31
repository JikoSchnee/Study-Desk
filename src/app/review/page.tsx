"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpenCheck, BrainCircuit, CheckCircle2, ChevronLeft, ChevronRight, Dices, Eye, GraduationCap, Lightbulb, MessageSquareText, PencilLine, RefreshCw, Sparkles, Target } from "lucide-react";
import { Button, Chip, EmptyState } from "@/components/ui";
import { PageHeader, PageLayout } from "@/components/page-layout";
import { SpeechRecorder } from "@/components/speech-recorder";
import { AnswerComparisonView } from "@/components/answer-comparison";
import { ComparisonModeControl } from "@/components/comparison-mode-control";
import { SemanticComparisonProgress } from "@/components/semantic-comparison-progress";
import { useSemanticComparisonProgress } from "@/components/use-semantic-comparison-progress";
import { difficultyTier } from "@/lib/card-filters";
import { answerPointLabels } from "@/lib/import";
import { usePageState } from "@/components/page-state-cache";
import { ReviewCardEditorDialog } from "@/components/review-card-editor-dialog";
import { ReviewLearningChat } from "@/components/review-learning-chat";
import type { AnswerComparisonMode, Card, CardLearningSummary, Evaluation, RatingName } from "@/lib/types";

type QueueKind = "initial" | "review" | "weak";
type SessionKind = QueueKind | "random";
type QueueProgress = Record<QueueKind, { pending: number; completedToday: number }>;

const queueCopy: Record<QueueKind, { label: string; title: string; description: string; icon: typeof GraduationCap }> = {
  initial: { label: "首次学习", title: "先看懂，再进入回忆。", description: "逐条看完答案要点后，明天再进行第一次主动回忆。", icon: GraduationCap },
  review: { label: "到期复习", title: "把记忆再叫回来。", description: "按 FSRS 到期时间复习，稳住已经学过的内容。", icon: RefreshCw },
  weak: { label: "薄弱复习", title: "把难点再练一遍。", description: "这里的练习不改变 FSRS 排程，只帮你集中补弱。", icon: Target },
};

const randomQueueCopy = { label: "随机抽题", title: "随手抽一题热身", description: "从题库随机抽取一张卡，随时练习，不影响 FSRS 复习排程。", icon: Dices };

function progressText(stats: { pending: number; completedToday: number }) {
  return `今日完成 ${stats.completedToday} · 待完成 ${stats.pending}`;
}

function ReviewPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetQueue = searchParams.get("queue");
  const targetCardId = searchParams.get("cardId");
  const [session, setSession] = usePageState<SessionKind | null>("review:session", null);
  const [card, setCard] = usePageState<Card | null | undefined>("review:card", null);
  const [learning, setLearning] = usePageState<CardLearningSummary | null>("review:learning", null);
  const [progress, setProgress] = usePageState<QueueProgress | null>("review:progress", null);
  const [presentedQuestion, setPresentedQuestion] = usePageState("review:presented-question", "");
  const [answer, setAnswer] = usePageState("review:answer", "");
  const [evaluation, setEvaluation] = usePageState<Evaluation | null>("review:evaluation", null);
  const [busy, setBusy] = usePageState("review:busy", false);
  const [activeHint, setActiveHint] = usePageState<number | null>("review:active-hint", null);
  const [seenRandomIds, setSeenRandomIds] = usePageState<string[]>("review:seen-random", []);
  const [comparisonMode, setComparisonMode] = usePageState<AnswerComparisonMode>("review:comparison-mode", "embedding");
  const [llmConfigured, setLlmConfigured] = usePageState("review:llm-configured", false);
  const [feedbackNotice, setFeedbackNotice] = usePageState("review:feedback-notice", "");
  const [followUpQuestion, setFollowUpQuestion] = usePageState("review:follow-up-question", "");
  const [followUpAnswer, setFollowUpAnswer] = usePageState("review:follow-up-answer", "");
  const [followUpFeedback, setFollowUpFeedback] = usePageState<Evaluation | null>("review:follow-up-feedback", null);
  const [followUpBusy, setFollowUpBusy] = usePageState("review:follow-up-busy", false);
  const [followUpDraftBusy, setFollowUpDraftBusy] = usePageState("review:follow-up-draft-busy", false);
  const [submitError, setSubmitError] = usePageState("review:submit-error", "");
  const [revealedStudyPoints, setRevealedStudyPoints] = usePageState<number[]>("review:revealed-points", []);
  const [studyBusy, setStudyBusy] = usePageState("review:study-busy", false);
  const [studyError, setStudyError] = usePageState("review:study-error", "");
  const [studyEditMode, setStudyEditMode] = usePageState<Record<string, "note" | "hint">>("review:point-edit-mode", {});
  const [studyEditErrors, setStudyEditErrors] = usePageState<Record<string, string>>("review:point-edit-errors", {});
  const [fullEditorOpen, setFullEditorOpen] = usePageState("review:full-editor-open", false);
  const [tagExpansion, setTagExpansion] = usePageState<Record<string, boolean>>("review:tag-expansion", {});
  const [learningChatOpen, setLearningChatOpen] = usePageState<boolean | null>("review:learning-chat-open", null);
  const studySaveTimers = useRef<Record<string, number>>({});
  const launchedQueueTarget = useRef<string | null>(null);
  const reviewCardRef = useRef<HTMLElement | null>(null);
  const learningChatRef = useRef<HTMLElement | null>(null);
  const learningChatAnimationTimer = useRef<number | null>(null);
  const semanticProgress = useSemanticComparisonProgress();

  useEffect(() => () => { if (learningChatAnimationTimer.current !== null) window.clearTimeout(learningChatAnimationTimer.current); }, []);

  const loadQueueProgress = useCallback(async () => {
    const response = await fetch("/api/review/queue");
    if (!response.ok) throw new Error("无法读取练习队列");
    const data = await response.json();
    setProgress(data.progress);
  }, [setProgress]);

  useEffect(() => {
    void loadQueueProgress().catch(() => setProgress({ initial: { pending: 0, completedToday: 0 }, review: { pending: 0, completedToday: 0 }, weak: { pending: 0, completedToday: 0 } }));
    fetch("/api/settings").then((response) => response.json()).then((settings) => {
      const configured = Boolean(settings.llmConfigured);
      setComparisonMode(settings.answerComparisonMode === "llm" && configured ? "llm" : "embedding");
      setLlmConfigured(configured);
    }).catch(() => undefined);
  }, [loadQueueProgress, setComparisonMode, setLlmConfigured, setProgress]);

  const loadSession = useCallback(async (nextSession: SessionKind, excludedIds: string[] = [], requestedCardId?: string | null) => {
    setSession(nextSession);
    setCard(undefined);
    setLearning(null);
    setAnswer("");
    setEvaluation(null);
    setFeedbackNotice("");
    setFollowUpQuestion("");
    setFollowUpAnswer("");
    setFollowUpFeedback(null);
    setFollowUpDraftBusy(false);
    setActiveHint(null);
    setPresentedQuestion("");
    setRevealedStudyPoints([]);
    setStudyBusy(false);
    setStudyError("");
    const query = nextSession === "random"
      ? (excludedIds.length ? `?${excludedIds.map((id) => `exclude=${encodeURIComponent(id)}`).join("&")}` : "")
      : `?queue=${nextSession}${requestedCardId ? `&cardId=${encodeURIComponent(requestedCardId)}` : ""}`;
    const endpoint = nextSession === "random" ? `/api/review/random${query}` : `/api/review/next${query}`;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error("无法读取下一张卡片");
      const data = await response.json();
      setCard(data.card ?? null);
      setLearning(data.learning ?? null);
      setPresentedQuestion(data.presentedQuestion ?? data.card?.question ?? "");
      if (nextSession !== "random") setProgress(data.progress);
      if (nextSession === "random" && data.card?.id) setSeenRandomIds((ids) => ids.includes(data.card.id) ? ids : [...ids, data.card.id]);
    } catch {
      setCard(null);
    }
  }, [setActiveHint, setAnswer, setCard, setEvaluation, setFeedbackNotice, setFollowUpAnswer, setFollowUpDraftBusy, setFollowUpFeedback, setFollowUpQuestion, setLearning, setPresentedQuestion, setProgress, setRevealedStudyPoints, setSeenRandomIds, setSession, setStudyBusy, setStudyError]);

  useEffect(() => {
    if (targetQueue !== "initial" && targetQueue !== "review" && targetQueue !== "weak") return;
    if (session === targetQueue) return;
    const target = `${targetQueue}:${targetCardId ?? ""}`;
    if (launchedQueueTarget.current === target) return;
    launchedQueueTarget.current = target;
    void loadSession(targetQueue, [], targetCardId);
  }, [loadSession, session, targetCardId, targetQueue]);
  useEffect(() => () => Object.values(studySaveTimers.current).forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    if (!card || !session || evaluation) return;
    const saved = window.localStorage.getItem(`mock-interview:draft:${session}:${card.id}`);
    if (saved) setAnswer(saved);
  }, [card, evaluation, session, setAnswer]);

  useEffect(() => {
    if (!card || !session || !answer.trim() || evaluation) return;
    const key = `mock-interview:draft:${session}:${card.id}`;
    const timer = window.setTimeout(() => window.localStorage.setItem(key, answer), 300);
    return () => window.clearTimeout(timer);
  }, [answer, card, evaluation, session]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !evaluation && answer.trim()) { event.preventDefault(); void evaluate(); return; }
      if (editable) return;
      if (event.key.toLowerCase() === "h" && card?.answerPoints.some((point) => point.hint.trim())) { event.preventDefault(); setActiveHint((value) => value === null ? 0 : null); }
      if (evaluation && ["1", "2", "3", "4"].includes(event.key)) { event.preventDefault(); void confirm((["again", "hard", "good", "easy"] as RatingName[])[Number(event.key) - 1]); }
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  });

  const actOnFeedback = useCallback(async (action: "weak" | "priority" | "removeWeak") => {
    if (!card || !evaluation) return;
    const response = await fetch("/api/review/focus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id, action, gaps: evaluation.gaps }) });
    if (!response.ok) { setFeedbackNotice("操作未保存，请重试。"); return; }
    setFeedbackNotice(action === "weak" ? "已加入薄弱复习队列。" : action === "priority" ? "下一次练习会优先出现这张卡。" : "已移出薄弱复习队列。");
  }, [card, evaluation, setFeedbackNotice]);

  const createSupplement = () => {
    if (!card || !evaluation) return;
    window.localStorage.setItem("mock-interview:supplement-draft", JSON.stringify({ question: `补充：${card.question}`, answerPoints: evaluation.gaps.length ? evaluation.gaps : ["补充这道题的关键要点"], track: card.track, tags: [...card.tags, "薄弱补充"] }));
    router.push("/library");
  };

  const generateFollowUp = async () => {
    if (!card || !evaluation) return;
    setFollowUpBusy(true); setFeedbackNotice("");
    try {
      const response = await fetch("/api/follow-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", cardId: card.id, answer, gaps: evaluation.gaps }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法生成追问。");
      setFollowUpQuestion(data.question); setFollowUpAnswer(""); setFollowUpFeedback(null);
    } catch (error) { setFeedbackNotice(error instanceof Error ? error.message : "无法生成追问。"); }
    finally { setFollowUpBusy(false); }
  };

  const evaluateFollowUp = async () => {
    if (!card || !followUpQuestion || !followUpAnswer.trim()) return;
    setFollowUpBusy(true);
    try {
      const response = await fetch("/api/follow-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "evaluate", cardId: card.id, question: followUpQuestion, answer: followUpAnswer }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法评估追问回答。");
      setFollowUpFeedback(data.evaluation);
    } catch (error) { setFeedbackNotice(error instanceof Error ? error.message : "无法评估追问回答。"); }
    finally { setFollowUpBusy(false); }
  };

  const addFollowUpToLibrary = async () => {
    if (!card || !evaluation || !followUpQuestion) return;
    setFollowUpDraftBusy(true); setFeedbackNotice("");
    try {
      const response = await fetch("/api/follow-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", cardId: card.id, question: followUpQuestion, answer, gaps: evaluation.gaps }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "暂时无法生成追问卡草稿。");
      window.localStorage.setItem("mock-interview:follow-up-card-draft", JSON.stringify(data.draft));
      router.push("/library");
    } catch (error) { setFeedbackNotice(error instanceof Error ? error.message : "暂时无法生成追问卡草稿。"); }
    finally { setFollowUpDraftBusy(false); }
  };

  const startQueue = useCallback((kind: QueueKind) => { void loadSession(kind); }, [loadSession]);
  const loadRandom = useCallback(() => void loadSession("random", seenRandomIds), [loadSession, seenRandomIds]);
  const leaveSession = useCallback(() => { setSession(null); setCard(null); setEvaluation(null); void loadQueueProgress(); }, [loadQueueProgress, setCard, setEvaluation, setSession]);

  const saveCurrentStudyEdits = useCallback(async () => {
    if (!card) return;
    Object.values(studySaveTimers.current).forEach((timer) => window.clearTimeout(timer));
    studySaveTimers.current = {};
    const response = await fetch("/api/cards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: card.id, question: card.question, questionVariants: card.questionVariants, relations: card.relations, answerPoints: card.answerPoints, note: card.note, track: card.track, tags: card.tags, difficulty: card.difficulty, source: card.source ?? "" }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "无法保存当前批注和提示。");
    setCard(data.card);
  }, [card, setCard]);

  const completeStudy = useCallback(async (): Promise<string | void> => {
    if (!card || session !== "initial") return "当前卡片无法完成首次学习。";
    if (revealedStudyPoints.length < card.answerPoints.length) return "请先看完全部要点。";
    setStudyBusy(true); setStudyError("");
    try {
      await saveCurrentStudyEdits();
      const response = await fetch("/api/review/study", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法完成首次学习。");
      await loadSession("initial");
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法完成首次学习。";
      setStudyError(message);
      return message;
    } finally { setStudyBusy(false); }
  }, [card, loadSession, revealedStudyPoints.length, saveCurrentStudyEdits, session, setStudyBusy, setStudyError]);

  const evaluate = useCallback(async (): Promise<string | void> => {
    if (!card || !answer.trim()) return "请先写一段自己的回答，下一步会用同一个提交操作生成报告。";
    setBusy(true); setSubmitError("");
    try {
      const result = await semanticProgress.request<{ evaluation?: Evaluation }>("/api/review/submit", { action: "evaluate", cardId: card.id, presentedQuestion, answer, comparisonMode }, comparisonMode === "embedding");
      if (result.evaluation) setEvaluation(result.evaluation);
      else { const message = "未收到评估结果，请重试。"; setSubmitError(message); return message; }
    } catch { const message = "提交失败，答案已保留。请检查网络后重试。"; setSubmitError(message); return message; }
    finally { setBusy(false); }
  }, [answer, card, comparisonMode, presentedQuestion, semanticProgress, setBusy, setEvaluation, setSubmitError]);

  const confirm = useCallback(async (rating: RatingName): Promise<string | void> => {
    if (!card || !session || session === "random") return "当前题目无法确认评级。";
    if (session === "weak") {
      if (rating === "good" || rating === "easy") await actOnFeedback("removeWeak");
      await loadSession("weak");
      return;
    }
    setBusy(true);
    try {
      const result = await semanticProgress.request<{ error?: string }>("/api/review/submit", { action: "confirm", cardId: card.id, presentedQuestion, answer, rating, comparisonMode }, comparisonMode === "embedding");
      if (result.error) return result.error;
      window.localStorage.removeItem(`mock-interview:draft:${session}:${card.id}`);
      await loadSession(session);
    } catch { return "评级提交失败，请检查网络后重试。"; }
    finally { setBusy(false); }
  }, [actOnFeedback, answer, card, comparisonMode, loadSession, presentedQuestion, semanticProgress, session, setBusy]);

  if (!progress && session === null) return <div className="loading">正在准备今天的练习…</div>;

  if (session === null && progress) return <PageLayout>
    <PageHeader eyebrow={<><BrainCircuit size={15}/> 主动回忆</>} title="今天想先练哪一类？" description="导入不会算作练习；第一次作答与之后的复习，会分别留下清晰记录。" tour="review" />
    <section className="review-queue-grid" data-tour="review-initial" aria-label="选择练习队列">
      {(["initial", "review", "random", "weak"] as const).map((kind) => {
        const isRandomQueue = kind === "random";
        const copy = isRandomQueue ? randomQueueCopy : queueCopy[kind];
        const Icon = copy.icon;
        const stats = isRandomQueue ? { pending: 0, completedToday: 0 } : progress[kind];
        return <article className={`review-queue-card ${kind}`} key={kind} data-tour={kind === "initial" ? "review-initial-card" : undefined}>
          <div className="review-queue-icon"><Icon size={23}/></div>
          <div><p className="eyebrow">{copy.label}</p><h2>{isRandomQueue ? copy.title : kind === "initial" ? "先把新题学明白" : kind === "review" ? "巩固已学内容" : "集中补弱"}</h2><p>{copy.description}</p></div>
          <div className="review-queue-progress">{isRandomQueue ? <><strong>自由</strong><span>练习</span><small>不影响复习排程</small></> : <><strong>{stats.pending}</strong><span>题待完成</span><small>{progressText(stats)}</small></>}</div>
          <Button disabled={!isRandomQueue && !stats.pending} onClick={() => { if (isRandomQueue) loadRandom(); else startQueue(kind); }}>{isRandomQueue ? <><Dices size={17}/> 随机抽题</> : stats.pending ? <>开始{copy.label}<ArrowRight size={17}/></> : "今日暂无待完成"}</Button>
        </article>;
      })}
    </section>
  </PageLayout>;

  if (card === undefined) return <div className="loading">正在准备下一道练习题…</div>;

  if (!card && session === "random") return <PageLayout><PageHeader eyebrow={<><Dices size={15}/> 随机练习</>} title="题库还没有可抽取的卡片。" description="先创建一张卡片，把一个知识点练成能说出口的话。" tour="review" actions={<Button variant="secondary" onClick={leaveSession}>退出</Button>} /><EmptyState title="还没有可练习的卡片" detail="创建卡片后就可以随时随机抽题。" action={<Link href="/library"><Button>去建立卡片</Button></Link>} /></PageLayout>;

  if (!card && session !== null && session !== "random") {
    const other = session === "initial" ? "review" : session === "review" ? "initial" : null;
    const otherStats = other ? progress?.[other] ?? { pending: 0, completedToday: 0 } : { pending: 0, completedToday: 0 };
    const copy = queueCopy[session];
    return <PageLayout><PageHeader eyebrow={<><BookOpenCheck size={15}/> {copy.label}</>} title={`${copy.label}已完成。`} description={`${progress ? `${progressText(progress[session])}。` : ""}${other && otherStats.pending ? ` 接下来还有 ${otherStats.pending} 道${queueCopy[other].label}。` : " 今天的练习告一段落。"}`} tour="review" actions={<Button variant="secondary" onClick={leaveSession}>退出</Button>} /><EmptyState title={other && otherStats.pending ? "继续下一类练习" : "今天的练习告一段落"} detail={other && otherStats.pending ? `确认后进入${queueCopy[other].label}，进度会继续累计。` : "明天再来复习，记忆会更牢。"} action={other && otherStats.pending ? <Button onClick={() => startQueue(other)}>继续{queueCopy[other].label}<ArrowRight size={17}/></Button> : <Link href="/library"><Button>查看题库</Button></Link>} /></PageLayout>;
  }

  const queue = session as SessionKind;
  const isRandom = queue === "random";
  const isInitial = queue === "initial";
  const activeCard = card as Card;
  const hints = activeCard.answerPoints.map((point) => point.hint.trim()).filter(Boolean);
  const difficulty = difficultyTier(learning?.fsrsDifficulty);
  const otherQuestions = [activeCard.question, ...activeCard.questionVariants.map((item) => item.content)].filter((question) => question !== presentedQuestion);
  const MoreQuestions = () => otherQuestions.length > 0 ? <section className="more-questions"><p className="eyebrow">这题还可能这样问</p><ul>{otherQuestions.map((question) => <li key={question}>{question}</li>)}</ul></section> : null;
  const switchHint = (direction: -1 | 1) => setActiveHint((current) => current === null ? 0 : Math.max(0, Math.min(hints.length - 1, current + direction)));
  const handleHintKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft" && activeHint !== null && activeHint > 0) { event.preventDefault(); switchHint(-1); }
    if (event.key === "ArrowRight" && activeHint !== null && activeHint < hints.length - 1) { event.preventDefault(); switchHint(1); }
  };
  const stats = !isRandom ? progress?.[queue] : null;
  const sessionCopy = !isRandom ? queueCopy[queue] : null;
  const tagsOpen = tagExpansion[activeCard.id] ?? isInitial;
  const tagProgressTotal = stats ? stats.pending + stats.completedToday : 0;
  const tagProgressPercent = tagProgressTotal ? Math.round((stats!.completedToday / tagProgressTotal) * 100) : 0;
  const chatOpen = learningChatOpen ?? isInitial;
  const setChatOpenWithFlip = (nextOpen: boolean) => {
    const cardElement = reviewCardRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 800px)").matches;
    if (!cardElement || reducedMotion || mobile) { setLearningChatOpen(nextOpen); return; }
    const first = cardElement.getBoundingClientRect();
    if (learningChatAnimationTimer.current !== null) window.clearTimeout(learningChatAnimationTimer.current);
    setLearningChatOpen(nextOpen);
    window.requestAnimationFrame(() => {
      const last = cardElement.getBoundingClientRect();
      cardElement.style.transformOrigin = "top left";
      cardElement.style.willChange = "transform";
      cardElement.style.transition = "none";
      cardElement.style.transform = `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / Math.max(last.width, 1)}, ${first.height / Math.max(last.height, 1)})`;
      void cardElement.getBoundingClientRect();
      window.requestAnimationFrame(() => {
        cardElement.style.transition = "transform 210ms cubic-bezier(.22, .8, .28, 1)";
        cardElement.style.transform = "";
        learningChatAnimationTimer.current = window.setTimeout(() => {
          cardElement.style.transition = "";
          cardElement.style.transformOrigin = "";
          cardElement.style.willChange = "";
          learningChatAnimationTimer.current = null;
        }, 230);
      });
    });
  };

  const allStudyPointsRevealed = revealedStudyPoints.length === activeCard.answerPoints.length;
  const studyPointLabels = answerPointLabels(activeCard.answerPoints);
  const revealStudyPoint = (index: number) => setRevealedStudyPoints((current) => current.includes(index) ? current : [...current, index]);
  const updateStudyPoint = (pointId: string, field: "note" | "hint", value: string) => {
    if (!card) return;
    const updated = { ...card, answerPoints: card.answerPoints.map((point) => point.id === pointId ? { ...point, [field]: value } : point) };
    setCard(updated);
    setStudyEditErrors((errors) => ({ ...errors, [pointId]: "" }));
    window.clearTimeout(studySaveTimers.current[pointId]);
    studySaveTimers.current[pointId] = window.setTimeout(() => {
      void fetch("/api/cards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: updated.id, question: updated.question, questionVariants: updated.questionVariants, relations: updated.relations, answerPoints: updated.answerPoints, note: updated.note, track: updated.track, tags: updated.tags, difficulty: updated.difficulty, source: updated.source ?? "" }) })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "无法保存修改。");
          setCard(data.card);
        })
        .catch((error) => setStudyEditErrors((errors) => ({ ...errors, [pointId]: error instanceof Error ? error.message : "保存失败，请重试。" })));
    }, 450);
  };

  return <PageLayout>
    {fullEditorOpen && <ReviewCardEditorDialog card={activeCard} onClose={() => setFullEditorOpen(false)} onSaved={(updatedCard) => { setCard(updatedCard); setFullEditorOpen(false); }} />}
    <SemanticComparisonProgress open={semanticProgress.open} progress={semanticProgress.progress}/>
    <PageHeader eyebrow={<><BrainCircuit size={15}/> {isRandom ? "随机练习" : sessionCopy?.label}</>} title={isRandom ? "随机抽一题，说说看。" : isInitial ? "先看懂，再进入回忆。" : queue === "weak" ? "把难点练扎实。" : "把记忆再叫回来。"} description={isRandom ? "这次练习只提供反馈，不会影响复习排程。" : isInitial ? "这不是考试：逐条看完答案要点后，明天再进行第一次主动回忆。" : queue === "weak" ? "薄弱复习不改变排程，练好后可以把它移出队列。" : "说不完整没关系，关键是把思路调出来。"} tour="review" actions={<>{!isRandom && <Button variant="ghost" onClick={() => setFullEditorOpen(true)}><PencilLine size={17}/> 编辑</Button>}{isRandom && <Button variant="ghost" onClick={loadRandom}><Dices size={17}/> 再抽一题</Button>}<Button variant="secondary" onClick={leaveSession}>退出</Button></>} />
    <div className={`review-learning-layout page-focus-content${isInitial ? " initial-session" : ""}`}>
    {stats && <section className="review-session-progress" aria-label={`${sessionCopy?.label}进度`}><div><span>{sessionCopy?.label}</span><strong>今日完成 {stats.completedToday} / {tagProgressTotal}</strong></div><div className="progress-track"><i style={{ width: `${tagProgressPercent}%` }} /></div></section>}
    <article ref={reviewCardRef} className="review-card">
      <div><div className="review-question-heading"><p className="eyebrow">问题</p>{isInitial ? <Chip tone="green">首次学习</Chip> : difficulty && <span className={`difficulty-badge difficulty-${difficulty.className}`} title={`FSRS 难度 ${learning?.fsrsDifficulty?.toFixed(1)} / 10`}>难度 {difficulty.label}<small>{learning?.fsrsDifficulty?.toFixed(1)}</small></span>}</div><h2 className="review-question">{presentedQuestion}</h2>{activeCard.tags.length > 0 && <details className="review-card-tags" open={tagsOpen} onToggle={(event) => { const open = event.currentTarget.open; setTagExpansion((current) => ({ ...current, [activeCard.id]: open })); }}><summary>标签（{activeCard.tags.length}）</summary><div>{activeCard.tags.map((tag) => <Chip key={tag} tone="ink">#{tag}</Chip>)}</div></details>}</div>
      {isInitial ? <section className="initial-study-flow" data-tour="initial-study-flow" aria-label="首次学习步骤">
        <ol className="initial-study-points">
          {activeCard.answerPoints.map((point, index) => {
            const revealed = revealedStudyPoints.includes(index);
            const pointLabel = point.role === "key" || !point.role ? studyPointLabels.get(point.id) ?? String(index + 1) : point.role === "opening" ? "开场" : "收束";
            const editMode = studyEditMode[point.id];
            const toggleStudyEditor = (nextMode: "note" | "hint") => setStudyEditMode((current) => { const next = { ...current }; if (next[point.id] === nextMode) delete next[point.id]; else next[point.id] = nextMode; return next; });
            const editorLabel = editMode === "note" ? "要点批注" : "回忆提示";
            const editorValue = editMode ? point[editMode] : "";
            return <li className={`${revealed ? "revealed" : ""}${point.parentId ? " initial-study-subpoint" : ""}`} key={point.id}><div className="initial-study-point-number">{revealed ? <CheckCircle2 size={17}/> : pointLabel}</div><div><p className="eyebrow">要点 {pointLabel}</p>{revealed ? <><p className="initial-study-answer">{point.content}</p>{!point.parentId && <div className="initial-study-point-actions"><button type="button" onClick={() => toggleStudyEditor("note")}><MessageSquareText size={15}/> 批注</button><button type="button" onClick={() => toggleStudyEditor("hint")}><Lightbulb size={15}/> 编辑提示</button></div>}{!point.parentId && editMode && <label className="initial-study-inline-editor">{editorLabel}<span className="initial-study-editor-current">当前{editorLabel}：{editorValue.trim() || "尚未填写"}</span><textarea rows={2} value={editorValue} onChange={(event) => updateStudyPoint(point.id, editMode, event.target.value)} placeholder={editMode === "note" ? "记录补充、案例或待核实内容" : "用一句线索帮助下次回忆"} />{studyEditErrors[point.id] && <span className="danger">{studyEditErrors[point.id]}</span>}</label>}</> : <><p className="initial-study-hint"><Lightbulb size={16}/>{point.hint.trim() || "先用自己的话想一想这个关键点。"}</p><Button type="button" onClick={() => revealStudyPoint(index)}><Eye size={16}/> 查看完整要点</Button></>}</div></li>;
          })}
        </ol>
        <div className="form-actions initial-study-actions"><small>{allStudyPointsRevealed ? "全部要点已看完；完成后，第一次正式主动回忆会安排在明天上午。" : `还需查看 ${activeCard.answerPoints.length - revealedStudyPoints.length} 个要点`}</small><Button disabled={!allStudyPointsRevealed || studyBusy} onClick={() => void completeStudy()}>{studyBusy ? "正在安排复习…" : <><CheckCircle2 size={17}/> 完成首次学习</>}</Button>{studyError && <span className="danger" role="alert">{studyError}</span>}</div>
      </section> : !evaluation ? <div className="form-grid" data-tour="review-answer">
        {activeHint !== null && <section className="review-hints" aria-live="polite" aria-label="回忆提示" tabIndex={0} onKeyDown={handleHintKeys}><div className="review-hint"><Lightbulb size={17}/><div className="review-hint-content"><div className="hint-title"><strong>提示 {activeHint + 1}/{hints.length}</strong><span>可用左右方向键切换</span></div><p>{hints[activeHint]}</p><div className="hint-navigation"><button type="button" aria-label="上一条提示" disabled={activeHint === 0} onClick={() => switchHint(-1)}><ChevronLeft size={17}/> 上一条</button><span>{activeHint + 1} / {hints.length}</span><button type="button" aria-label="下一条提示" disabled={activeHint === hints.length - 1} onClick={() => switchHint(1)}>下一条 <ChevronRight size={17}/></button></div></div></div></section>}
        <textarea className="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void evaluate(); } }} placeholder="建议按要点分行作答（如 1. … 换行 2. …），识别和高亮效果最佳。" />
        <ComparisonModeControl mode={comparisonMode} onChange={setComparisonMode} llmConfigured={llmConfigured} compact />
        <div className="form-actions review-answer-actions"><small className="shortcut-hint">⌘/Ctrl + Enter 提交 · H 提示</small><div className="review-answer-buttons">{hints.length ? <Button type="button" variant="ghost" className="hint-button" onClick={() => setActiveHint((current) => current === null ? 0 : null)}><Lightbulb size={17}/>{activeHint === null ? "需要提示" : "收起提示"}</Button> : <p className="hint-unavailable"><Lightbulb size={16}/> 此卡暂未设置提示</p>}<SpeechRecorder onTranscript={(value) => setAnswer((old) => `${old}${old ? "\n" : ""}${value}`)} /><Button disabled={!answer.trim() || busy} onClick={evaluate}>{busy ? "正在准备比对…" : "提交回答"}</Button></div>{submitError && <span className="danger" role="alert">{submitError} <button type="button" onClick={() => void evaluate()}>重试</button></span>}</div>
      </div> : isRandom ? <div className="random-feedback"><div className="feedback"><strong>{evaluation.score} 分 · 随机练习反馈</strong><p>{evaluation.feedback}</p>{evaluation.gaps.length > 0 && <p>待补充：{evaluation.gaps.join("、")}</p>}</div><AnswerComparisonView comparison={evaluation.comparison} answer={answer}/><MoreQuestions/><details className="feedback-actions"><summary>可选：把遗漏要点变成后续训练</summary><div className="feedback-actions-content"><Button variant="ghost" disabled={!llmConfigured || followUpBusy || Boolean(followUpQuestion)} onClick={generateFollowUp}><Sparkles size={16}/> {followUpBusy ? "正在生成追问…" : followUpQuestion ? "已生成追问" : "AI 拓展追问"}</Button>{feedbackNotice && <span className="muted-copy" role="status">{feedbackNotice}</span>}</div>{followUpQuestion && <section className="follow-up-card"><p className="eyebrow"><Sparkles size={15}/> AI 拓展追问</p><h3>{followUpQuestion}</h3><Button variant="secondary" disabled={followUpBusy || followUpDraftBusy} onClick={addFollowUpToLibrary}><BookOpenCheck size={16}/>{followUpDraftBusy ? "正在生成卡片草稿…" : "加入藏品"}</Button>{!followUpFeedback ? <><textarea className="answer compact-answer" value={followUpAnswer} onChange={(event) => setFollowUpAnswer(event.target.value)} placeholder="回答这条追问；不会改变本卡的 FSRS 排程。" /><Button disabled={!followUpAnswer.trim() || followUpBusy} onClick={evaluateFollowUp}>{followUpBusy ? "正在评估…" : "提交追问回答"}</Button></> : <div className="feedback"><strong>{followUpFeedback.score} 分 · 追问反馈</strong><p>{followUpFeedback.feedback}</p>{followUpFeedback.gaps.length > 0 && <p>待补充：{followUpFeedback.gaps.join("、")}</p>}</div>}</section>}</details><Button variant="secondary" onClick={loadRandom}><Dices size={17}/> 再抽一题</Button></div> : <div className="stack"><section className="stack" data-tour="review-report"><div className="feedback"><strong>{evaluation.score} 分 · 建议：{evaluation.suggestedRating}</strong><p>{evaluation.feedback}</p>{evaluation.gaps.length > 0 && <p>待补充：{evaluation.gaps.join("、")}</p>}</div><AnswerComparisonView comparison={evaluation.comparison} answer={answer}/><MoreQuestions/></section><section className="review-rating-section" data-tour="review-rating"><div className="review-rating-heading"><div><p className="eyebrow">下一步：安排复习</p><h3>这次记得怎么样？</h3><p>选择后更新下一次复习计划。</p></div><span className="rating-shortcuts">快捷键 1–4</span></div><div className="rating-row"><Button className="again rating-choice" disabled={busy} onClick={() => confirm("again")}><span className="rating-key">1</span><strong>忘记</strong><small>重新练习</small></Button><Button className="hard rating-choice" disabled={busy} onClick={() => confirm("hard")}><span className="rating-key">2</span><strong>困难</strong><small>更快复习</small></Button><Button className="good rating-choice" disabled={busy} onClick={() => confirm("good")}><span className="rating-key">3</span><strong>良好</strong><small>按计划复习</small></Button><Button className="easy rating-choice" disabled={busy} onClick={() => confirm("easy")}><span className="rating-key">4</span><strong>轻松</strong><small>更长间隔</small></Button></div></section><details className="feedback-actions"><summary>可选：把遗漏要点变成后续训练</summary><div className="feedback-actions-content"><Button variant="secondary" onClick={() => actOnFeedback("weak")}>加入薄弱复习</Button><Button variant="outline" onClick={() => actOnFeedback("priority")}>下次优先练习</Button><Button variant="ghost" onClick={createSupplement}>生成补充卡</Button><Button variant="ghost" disabled={!llmConfigured || followUpBusy || Boolean(followUpQuestion)} onClick={generateFollowUp}><Sparkles size={16}/> {followUpBusy ? "正在生成追问…" : followUpQuestion ? "已生成追问" : "AI 拓展追问"}</Button>{queue === "weak" && <Button variant="ghost" onClick={() => actOnFeedback("removeWeak")}>移出薄弱队列</Button>}{feedbackNotice && <span className="muted-copy" role="status">{feedbackNotice}</span>}</div>{followUpQuestion && <section className="follow-up-card"><p className="eyebrow"><Sparkles size={15}/> AI 拓展追问</p><h3>{followUpQuestion}</h3><Button variant="secondary" disabled={followUpBusy || followUpDraftBusy} onClick={addFollowUpToLibrary}><BookOpenCheck size={16}/>{followUpDraftBusy ? "正在生成卡片草稿…" : "加入藏品"}</Button>{!followUpFeedback ? <><textarea className="answer compact-answer" value={followUpAnswer} onChange={(event) => setFollowUpAnswer(event.target.value)} placeholder="回答这条追问；不会改变本卡的 FSRS 排程。" /><Button disabled={!followUpAnswer.trim() || followUpBusy} onClick={evaluateFollowUp}>{followUpBusy ? "正在评估…" : "提交追问回答"}</Button></> : <div className="feedback"><strong>{followUpFeedback.score} 分 · 追问反馈</strong><p>{followUpFeedback.feedback}</p>{followUpFeedback.gaps.length > 0 && <p>待补充：{followUpFeedback.gaps.join("、")}</p>}</div>}</section>}</details></div>}
    </article>
    <ReviewLearningChat card={activeCard} llmConfigured={llmConfigured} open={chatOpen} onOpenChange={setChatOpenWithFlip} panelRef={learningChatRef} />
    </div>
  </PageLayout>;
}

export default function ReviewPage() {
  return <Suspense fallback={<div className="loading">正在准备今天的练习…</div>}><ReviewPageContent /></Suspense>;
}
