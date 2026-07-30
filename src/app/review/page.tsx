"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenCheck, BrainCircuit, CheckCircle2, ChevronLeft, ChevronRight, Dices, Eye, GraduationCap, Lightbulb, RefreshCw, Sparkles, Target } from "lucide-react";
import { Button, Chip, EmptyState } from "@/components/ui";
import { PageHeader, PageLayout } from "@/components/page-layout";
import { useTour } from "@/components/tour";
import { SpeechRecorder } from "@/components/speech-recorder";
import { AnswerComparisonView } from "@/components/answer-comparison";
import { ComparisonModeControl } from "@/components/comparison-mode-control";
import { SemanticComparisonProgress } from "@/components/semantic-comparison-progress";
import { useSemanticComparisonProgress } from "@/components/use-semantic-comparison-progress";
import { difficultyTier } from "@/lib/card-filters";
import { answerPointLabels } from "@/lib/import";
import type { AnswerComparisonMode, Card, CardLearningSummary, Evaluation, RatingName } from "@/lib/types";

type QueueKind = "initial" | "review" | "weak";
type SessionKind = QueueKind | "random";
type QueueProgress = Record<QueueKind, { pending: number; completedToday: number }>;

const queueCopy: Record<QueueKind, { label: string; title: string; description: string; icon: typeof GraduationCap }> = {
  initial: { label: "首次学习", title: "先看懂，再复述。", description: "逐条看完答案要点，口头复述后，明天再进行第一次主动回忆。", icon: GraduationCap },
  review: { label: "到期复习", title: "把记忆再叫回来。", description: "按 FSRS 到期时间复习，稳住已经学过的内容。", icon: RefreshCw },
  weak: { label: "薄弱复习", title: "把难点再练一遍。", description: "这里的练习不改变 FSRS 排程，只帮你集中补弱。", icon: Target },
};

const randomQueueCopy = { label: "随机抽题", title: "随手抽一题热身", description: "从题库随机抽取一张卡，随时练习，不影响 FSRS 复习排程。", icon: Dices };

function progressText(stats: { pending: number; completedToday: number }) {
  return `今日完成 ${stats.completedToday} · 待完成 ${stats.pending}`;
}

export default function ReviewPage() {
  const { activeId, completeCheckpoint, registerTourAction, tutorialCardId } = useTour();
  const router = useRouter();
  const [taskTarget] = useState(() => {
    if (typeof window === "undefined") return { queue: null as string | null, cardId: null as string | null };
    const params = new URLSearchParams(window.location.search);
    return { queue: params.get("queue"), cardId: params.get("cardId") };
  });
  const [session, setSession] = useState<SessionKind | null>(null);
  const [card, setCard] = useState<Card | null | undefined>(null);
  const [learning, setLearning] = useState<CardLearningSummary | null>(null);
  const [progress, setProgress] = useState<QueueProgress | null>(null);
  const [presentedQuestion, setPresentedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeHint, setActiveHint] = useState<number | null>(null);
  const [seenRandomIds, setSeenRandomIds] = useState<string[]>([]);
  const [comparisonMode, setComparisonMode] = useState<AnswerComparisonMode>("embedding");
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [followUpFeedback, setFollowUpFeedback] = useState<Evaluation | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpDraftBusy, setFollowUpDraftBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [revealedStudyPoints, setRevealedStudyPoints] = useState<number[]>([]);
  const [spokenBack, setSpokenBack] = useState(false);
  const [studyBusy, setStudyBusy] = useState(false);
  const [studyError, setStudyError] = useState("");
  const semanticProgress = useSemanticComparisonProgress();

  const loadQueueProgress = useCallback(async () => {
    const response = await fetch("/api/review/queue");
    if (!response.ok) throw new Error("无法读取练习队列");
    const data = await response.json();
    setProgress(data.progress);
  }, []);

  useEffect(() => {
    void loadQueueProgress().catch(() => setProgress({ initial: { pending: 0, completedToday: 0 }, review: { pending: 0, completedToday: 0 }, weak: { pending: 0, completedToday: 0 } }));
    fetch("/api/settings").then((response) => response.json()).then((settings) => {
      const configured = Boolean(settings.llmConfigured);
      setComparisonMode(settings.answerComparisonMode === "llm" && configured ? "llm" : "embedding");
      setLlmConfigured(configured);
    }).catch(() => undefined);
  }, [loadQueueProgress]);

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
    setSpokenBack(false);
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
  }, []);

  useEffect(() => {
    const { queue, cardId } = taskTarget;
    if ((queue === "initial" || queue === "review" || queue === "weak") && cardId) void loadSession(queue, [], cardId);
  }, [loadSession, taskTarget]);

  useEffect(() => {
    if (!card || !session || evaluation) return;
    const saved = window.localStorage.getItem(`mock-interview:draft:${session}:${card.id}`);
    if (saved) setAnswer(saved);
  }, [card, evaluation, session]);

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
  }, [card, evaluation]);

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
      router.push("/cards");
    } catch (error) { setFeedbackNotice(error instanceof Error ? error.message : "暂时无法生成追问卡草稿。"); }
    finally { setFollowUpDraftBusy(false); }
  };

  const startQueue = useCallback((kind: QueueKind) => { if (kind === "initial") { completeCheckpoint("review-started"); void loadSession(kind, [], activeId === "onboarding" ? tutorialCardId : undefined); return; } void loadSession(kind); }, [activeId, completeCheckpoint, loadSession, tutorialCardId]);
  const loadRandom = useCallback(() => void loadSession("random", seenRandomIds), [loadSession, seenRandomIds]);
  const leaveSession = useCallback(() => { setSession(null); setCard(null); setEvaluation(null); void loadQueueProgress(); }, [loadQueueProgress]);

  const completeStudy = useCallback(async (): Promise<string | void> => {
    if (!card || session !== "initial") return "当前卡片无法完成首次学习。";
    if (revealedStudyPoints.length < card.answerPoints.length || !spokenBack) return "请先看完全部要点，并完成口头复述。";
    setStudyBusy(true); setStudyError("");
    try {
      const response = await fetch("/api/review/study", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法完成首次学习。");
      completeCheckpoint("initial-study-completed");
      await loadSession("initial");
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法完成首次学习。";
      setStudyError(message);
      return message;
    } finally { setStudyBusy(false); }
  }, [card, completeCheckpoint, loadSession, revealedStudyPoints.length, session, spokenBack]);

  const evaluate = useCallback(async (): Promise<string | void> => {
    if (!card || !answer.trim()) return "请先写一段自己的回答，下一步会用同一个提交操作生成报告。";
    setBusy(true); setSubmitError("");
    try {
      const result = await semanticProgress.request<{ evaluation?: Evaluation }>("/api/review/submit", { action: "evaluate", cardId: card.id, presentedQuestion, answer, comparisonMode }, comparisonMode === "embedding");
      if (result.evaluation) { setEvaluation(result.evaluation); completeCheckpoint("answer-evaluated"); }
      else { const message = "未收到评估结果，请重试。"; setSubmitError(message); return message; }
    } catch { const message = "提交失败，答案已保留。请检查网络后重试。"; setSubmitError(message); return message; }
    finally { setBusy(false); }
  }, [answer, card, comparisonMode, completeCheckpoint, presentedQuestion, semanticProgress]);

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
  }, [actOnFeedback, answer, card, comparisonMode, loadSession, presentedQuestion, semanticProgress, session]);

  useEffect(() => {
    if (activeId !== "onboarding" || session !== null) return;
    return registerTourAction("review-started", () => { startQueue("initial"); });
  }, [activeId, registerTourAction, session, startQueue]);
  useEffect(() => {
    if (activeId !== "onboarding" || session !== "initial" || !card) return;
    return registerTourAction("initial-study-completed", async () => {
      setRevealedStudyPoints(card.answerPoints.map((_, index) => index));
      setSpokenBack(true);
      const response = await fetch("/api/review/study", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id }) });
      const data = await response.json();
      if (!response.ok) return data.error ?? "无法完成首次学习。";
      completeCheckpoint("initial-study-completed");
      await loadSession("initial");
    });
  }, [activeId, card, completeCheckpoint, loadSession, registerTourAction, session]);

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

  if (!card && session === "random") return <PageLayout><PageHeader eyebrow={<><Dices size={15}/> 随机练习</>} title="题库还没有可抽取的卡片。" description="先创建一张卡片，把一个知识点练成能说出口的话。" tour="review" actions={<Button variant="secondary" onClick={leaveSession}>返回练习选择</Button>} /><EmptyState title="还没有可练习的卡片" detail="创建卡片后就可以随时随机抽题。" action={<Link href="/library"><Button>去建立卡片</Button></Link>} /></PageLayout>;

  if (!card && session !== null && session !== "random") {
    const other = session === "initial" ? "review" : session === "review" ? "initial" : null;
    const otherStats = other ? progress?.[other] ?? { pending: 0, completedToday: 0 } : { pending: 0, completedToday: 0 };
    const copy = queueCopy[session];
    return <PageLayout><PageHeader eyebrow={<><BookOpenCheck size={15}/> {copy.label}</>} title={`${copy.label}已完成。`} description={`${progress ? `${progressText(progress[session])}。` : ""}${other && otherStats.pending ? ` 接下来还有 ${otherStats.pending} 道${queueCopy[other].label}。` : " 今天的练习告一段落。"}`} tour="review" actions={<Button variant="secondary" onClick={leaveSession}>返回练习选择</Button>} /><EmptyState title={other && otherStats.pending ? "继续下一类练习" : "今天的练习告一段落"} detail={other && otherStats.pending ? `确认后进入${queueCopy[other].label}，进度会继续累计。` : "明天再来复习，记忆会更牢。"} action={other && otherStats.pending ? <Button onClick={() => startQueue(other)}>继续{queueCopy[other].label}<ArrowRight size={17}/></Button> : <Link href="/library"><Button>查看题库</Button></Link>} /></PageLayout>;
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

  const allStudyPointsRevealed = revealedStudyPoints.length === activeCard.answerPoints.length;
  const studyPointLabels = answerPointLabels(activeCard.answerPoints);
  const revealStudyPoint = (index: number) => setRevealedStudyPoints((current) => current.includes(index) ? current : [...current, index]);

  return <PageLayout>
    <SemanticComparisonProgress open={semanticProgress.open} progress={semanticProgress.progress}/>
    <PageHeader eyebrow={<><BrainCircuit size={15}/> {isRandom ? "随机练习" : sessionCopy?.label}</>} title={isRandom ? "随机抽一题，说说看。" : isInitial ? "先看懂，再说出来。" : queue === "weak" ? "把难点练扎实。" : "把记忆再叫回来。"} description={isRandom ? "这次练习只提供反馈，不会影响复习排程。" : isInitial ? "这不是考试：逐条看完答案要点，口头复述后，明天再进行第一次主动回忆。" : queue === "weak" ? "薄弱复习不改变排程，练好后可以把它移出队列。" : "说不完整没关系，关键是把思路调出来。"} tour="review" actions={<>{isRandom ? <Chip tone="blue">随机练习</Chip> : stats && <Chip tone={isInitial ? "green" : "blue"}>{progressText(stats)}</Chip>}<Button variant="secondary" onClick={isRandom ? loadRandom : leaveSession}>{isRandom ? <><Dices size={17}/> 再抽一题</> : "切换练习"}</Button></>} />
    <article className="review-card page-focus-content">
      <div><div className="review-question-heading"><p className="eyebrow">问题</p>{isInitial ? <Chip tone="green">首次学习</Chip> : difficulty && <span className={`difficulty-badge difficulty-${difficulty.className}`} title={`FSRS 难度 ${learning?.fsrsDifficulty?.toFixed(1)} / 10`}>难度 {difficulty.label}<small>{learning?.fsrsDifficulty?.toFixed(1)}</small></span>}</div><h2 className="review-question">{presentedQuestion}</h2></div>
      {isInitial ? <section className="initial-study-flow" data-tour="initial-study-flow" aria-label="首次学习步骤">
        <div className="initial-study-intro"><div className="initial-study-orb"><GraduationCap size={24}/></div><div><p className="eyebrow">先理解，再回忆</p><h3>沿着提示，逐条看懂答案。</h3><p>每个要点先给出一个线索；点击后查看完整解释。不会评分，也不会记录为作答。</p></div></div>
        <ol className="initial-study-points">
          {activeCard.answerPoints.map((point, index) => {
            const revealed = revealedStudyPoints.includes(index);
            const pointLabel = point.role === "key" || !point.role ? studyPointLabels.get(point.id) ?? String(index + 1) : point.role === "opening" ? "开场" : "收束";
            return <li className={`${revealed ? "revealed" : ""}${point.parentId ? " initial-study-subpoint" : ""}`} key={point.id}><div className="initial-study-point-number">{revealed ? <CheckCircle2 size={17}/> : pointLabel}</div><div><p className="eyebrow">要点 {pointLabel}</p>{revealed ? <p className="initial-study-answer">{point.content}</p> : <><p className="initial-study-hint"><Lightbulb size={16}/>{point.hint.trim() || "先用自己的话想一想这个关键点。"}</p><Button type="button" variant="secondary" onClick={() => revealStudyPoint(index)}><Eye size={16}/> 查看完整要点</Button></>}</div></li>;
          })}
        </ol>
        {allStudyPointsRevealed && <div className="initial-study-recall"><div><p className="eyebrow">合上答案，试着说一遍</p><h3>用自己的话复述核心逻辑。</h3><p>不用输入或评分；只要能把关键点串起来，就可以继续。</p></div><label><input type="checkbox" checked={spokenBack} onChange={(event) => setSpokenBack(event.target.checked)}/> 我已完成口头复述</label></div>}
        <div className="form-actions initial-study-actions"><small>{allStudyPointsRevealed ? "完成后，第一次正式主动回忆会安排在明天上午。" : `还需查看 ${activeCard.answerPoints.length - revealedStudyPoints.length} 个要点`}</small><Button disabled={!allStudyPointsRevealed || !spokenBack || studyBusy} onClick={() => void completeStudy()}>{studyBusy ? "正在安排复习…" : <><CheckCircle2 size={17}/> 完成首次学习</>}</Button>{studyError && <span className="danger" role="alert">{studyError}</span>}</div>
      </section> : !evaluation ? <div className="form-grid" data-tour="review-answer">
        {activeHint !== null && <section className="review-hints" aria-live="polite" aria-label="回忆提示" tabIndex={0} onKeyDown={handleHintKeys}><div className="review-hint"><Lightbulb size={17}/><div className="review-hint-content"><div className="hint-title"><strong>提示 {activeHint + 1}/{hints.length}</strong><span>可用左右方向键切换</span></div><p>{hints[activeHint]}</p><div className="hint-navigation"><button type="button" aria-label="上一条提示" disabled={activeHint === 0} onClick={() => switchHint(-1)}><ChevronLeft size={17}/> 上一条</button><span>{activeHint + 1} / {hints.length}</span><button type="button" aria-label="下一条提示" disabled={activeHint === hints.length - 1} onClick={() => switchHint(1)}>下一条 <ChevronRight size={17}/></button></div></div></div></section>}
        <textarea className="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void evaluate(); } }} placeholder="建议按要点分行作答（如 1. … 换行 2. …），识别和高亮效果最佳。" />
        <ComparisonModeControl mode={comparisonMode} onChange={setComparisonMode} llmConfigured={llmConfigured} compact />
        <div className="form-actions">{hints.length ? <Button type="button" variant="ghost" className="hint-button" onClick={() => setActiveHint((current) => current === null ? 0 : null)}><Lightbulb size={17}/>{activeHint === null ? "需要提示" : "收起提示"}</Button> : <p className="hint-unavailable"><Lightbulb size={16}/> 此卡暂未设置提示</p>}<SpeechRecorder onTranscript={(value) => setAnswer((old) => `${old}${old ? "\n" : ""}${value}`)} /><Button disabled={!answer.trim() || busy} onClick={evaluate}>{busy ? "正在准备比对…" : "提交回答"}</Button><small className="shortcut-hint">⌘/Ctrl + Enter 提交 · H 提示</small>{submitError && <span className="danger" role="alert">{submitError} <button type="button" onClick={() => void evaluate()}>重试</button></span>}</div>
      </div> : isRandom ? <div className="random-feedback"><div className="feedback"><strong>{evaluation.score} 分 · 随机练习反馈</strong><p>{evaluation.feedback}</p>{evaluation.gaps.length > 0 && <p>待补充：{evaluation.gaps.join("、")}</p>}</div><AnswerComparisonView comparison={evaluation.comparison} answer={answer}/><MoreQuestions/><details className="feedback-actions"><summary>可选：把遗漏要点变成后续训练</summary><div className="feedback-actions-content"><Button variant="ghost" disabled={!llmConfigured || followUpBusy || Boolean(followUpQuestion)} onClick={generateFollowUp}><Sparkles size={16}/> {followUpBusy ? "正在生成追问…" : followUpQuestion ? "已生成追问" : "AI 拓展追问"}</Button>{feedbackNotice && <span className="muted-copy" role="status">{feedbackNotice}</span>}</div>{followUpQuestion && <section className="follow-up-card"><p className="eyebrow"><Sparkles size={15}/> AI 拓展追问</p><h3>{followUpQuestion}</h3><Button variant="secondary" disabled={followUpBusy || followUpDraftBusy} onClick={addFollowUpToLibrary}><BookOpenCheck size={16}/>{followUpDraftBusy ? "正在生成卡片草稿…" : "加入卡片库"}</Button>{!followUpFeedback ? <><textarea className="answer compact-answer" value={followUpAnswer} onChange={(event) => setFollowUpAnswer(event.target.value)} placeholder="回答这条追问；不会改变本卡的 FSRS 排程。" /><Button disabled={!followUpAnswer.trim() || followUpBusy} onClick={evaluateFollowUp}>{followUpBusy ? "正在评估…" : "提交追问回答"}</Button></> : <div className="feedback"><strong>{followUpFeedback.score} 分 · 追问反馈</strong><p>{followUpFeedback.feedback}</p>{followUpFeedback.gaps.length > 0 && <p>待补充：{followUpFeedback.gaps.join("、")}</p>}</div>}</section>}</details><Button variant="secondary" onClick={loadRandom}><Dices size={17}/> 再抽一题</Button></div> : <div className="stack"><section className="stack" data-tour="review-report"><div className="feedback"><strong>{evaluation.score} 分 · 建议：{evaluation.suggestedRating}</strong><p>{evaluation.feedback}</p>{evaluation.gaps.length > 0 && <p>待补充：{evaluation.gaps.join("、")}</p>}</div><AnswerComparisonView comparison={evaluation.comparison} answer={answer}/><MoreQuestions/></section><section className="review-rating-section" data-tour="review-rating"><div className="review-rating-heading"><div><p className="eyebrow">下一步：安排复习</p><h3>这次记得怎么样？</h3><p>选择后更新下一次复习计划。</p></div><span className="rating-shortcuts">快捷键 1–4</span></div><div className="rating-row"><Button className="again rating-choice" disabled={busy} onClick={() => confirm("again")}><span className="rating-key">1</span><strong>忘记</strong><small>重新练习</small></Button><Button className="hard rating-choice" disabled={busy} onClick={() => confirm("hard")}><span className="rating-key">2</span><strong>困难</strong><small>更快复习</small></Button><Button className="good rating-choice" disabled={busy} onClick={() => confirm("good")}><span className="rating-key">3</span><strong>良好</strong><small>按计划复习</small></Button><Button className="easy rating-choice" disabled={busy} onClick={() => confirm("easy")}><span className="rating-key">4</span><strong>轻松</strong><small>更长间隔</small></Button></div></section><details className="feedback-actions"><summary>可选：把遗漏要点变成后续训练</summary><div className="feedback-actions-content"><Button variant="secondary" onClick={() => actOnFeedback("weak")}>加入薄弱复习</Button><Button variant="outline" onClick={() => actOnFeedback("priority")}>下次优先练习</Button><Button variant="ghost" onClick={createSupplement}>生成补充卡</Button><Button variant="ghost" disabled={!llmConfigured || followUpBusy || Boolean(followUpQuestion)} onClick={generateFollowUp}><Sparkles size={16}/> {followUpBusy ? "正在生成追问…" : followUpQuestion ? "已生成追问" : "AI 拓展追问"}</Button>{queue === "weak" && <Button variant="ghost" onClick={() => actOnFeedback("removeWeak")}>移出薄弱队列</Button>}{feedbackNotice && <span className="muted-copy" role="status">{feedbackNotice}</span>}</div>{followUpQuestion && <section className="follow-up-card"><p className="eyebrow"><Sparkles size={15}/> AI 拓展追问</p><h3>{followUpQuestion}</h3><Button variant="secondary" disabled={followUpBusy || followUpDraftBusy} onClick={addFollowUpToLibrary}><BookOpenCheck size={16}/>{followUpDraftBusy ? "正在生成卡片草稿…" : "加入卡片库"}</Button>{!followUpFeedback ? <><textarea className="answer compact-answer" value={followUpAnswer} onChange={(event) => setFollowUpAnswer(event.target.value)} placeholder="回答这条追问；不会改变本卡的 FSRS 排程。" /><Button disabled={!followUpAnswer.trim() || followUpBusy} onClick={evaluateFollowUp}>{followUpBusy ? "正在评估…" : "提交追问回答"}</Button></> : <div className="feedback"><strong>{followUpFeedback.score} 分 · 追问反馈</strong><p>{followUpFeedback.feedback}</p>{followUpFeedback.gaps.length > 0 && <p>待补充：{followUpFeedback.gaps.join("、")}</p>}</div>}</section>}</details></div>}
    </article>
  </PageLayout>;
}
