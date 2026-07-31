"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Mic2, Play, Sparkles, Volume2 } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { PageHeader, PageLayout } from "@/components/page-layout";
import { SpeechRecorder } from "@/components/speech-recorder";
import { AnswerComparisonView } from "@/components/answer-comparison";
import { ComparisonModeControl } from "@/components/comparison-mode-control";
import { SemanticComparisonProgress } from "@/components/semantic-comparison-progress";
import { useSemanticComparisonProgress } from "@/components/use-semantic-comparison-progress";
import type { AnswerComparisonMode, Evaluation } from "@/lib/types";

type Turn = { id: string; question: string; index: number; isExtension?: boolean };
type InterviewResult = Evaluation & { turnId: string; isExtension: boolean; question: string; answer: string; otherQuestions: string[] };

export default function InterviewPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [total, setTotal] = useState(0);
  const [answer, setAnswer] = useState("");
  const [scores, setScores] = useState<InterviewResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [draftBusyTurnId, setDraftBusyTurnId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [comparisonMode, setComparisonMode] = useState<AnswerComparisonMode>("embedding");
  const [llmConfigured, setLlmConfigured] = useState(false);
  const semanticProgress = useSemanticComparisonProgress();
  const [followUpCandidate, setFollowUpCandidate] = useState<{ turnId: string; question: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((response) => response.json()).then((settings) => {
      const configured = Boolean(settings.llmConfigured);
      setComparisonMode(settings.answerComparisonMode === "llm" && configured ? "llm" : "embedding");
      setLlmConfigured(configured);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!sessionId || !turn) return;
    const saved = window.localStorage.getItem(`mock-interview:interview-draft:${sessionId}:${turn.id}`);
    if (saved) setAnswer(saved);
  }, [sessionId, turn]);
  useEffect(() => {
    if (!sessionId || !turn || !answer.trim()) return;
    const key = `mock-interview:interview-draft:${sessionId}:${turn.id}`;
    const timer = window.setTimeout(() => window.localStorage.setItem(key, answer), 300);
    return () => window.clearTimeout(timer);
  }, [answer, sessionId, turn]);

  const start = async () => {
    setBusy(true); setError("");
    const data = await fetch("/api/interview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", mode: "real" }) }).then((response) => response.json());
    setBusy(false);
    if (data.error) { setError(data.error); return; }
    setSessionId(data.sessionId); setTurn(data.turn); setTotal(data.total); setScores([]); setFollowUpCandidate(null);
  };
  const speak = () => {
    if (turn && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(turn.question));
    }
  };
  const submit = async () => {
    if (!turn || !sessionId || !answer.trim()) return;
    setBusy(true);
    const submittedAnswer = answer;
    const answeredTurn = turn;
    const data = await semanticProgress.request<{ evaluation?: Evaluation; answeredQuestion?: string; otherQuestions?: string[]; answeredIsExtension?: boolean; finished?: boolean; turn?: Turn; total?: number; error?: string }>("/api/interview", { action: "answer", sessionId, turnId: turn.id, answer: submittedAnswer, comparisonMode }, comparisonMode === "embedding");
    setBusy(false);
    if (!data.evaluation) { setError(data.error ?? "无法完成本次比对。"); return; }
    window.localStorage.removeItem(`mock-interview:interview-draft:${sessionId}:${turn.id}`);
    setScores((items) => [...items, { ...data.evaluation!, turnId: answeredTurn.id, isExtension: Boolean(data.answeredIsExtension), question: data.answeredQuestion ?? turn.question, answer: submittedAnswer, otherQuestions: data.otherQuestions ?? [] }]);
    setFollowUpCandidate(data.answeredIsExtension ? null : { turnId: answeredTurn.id, question: data.answeredQuestion ?? answeredTurn.question });
    setAnswer("");
    if (data.finished) setTurn(null);
    else if (data.turn) { setTurn(data.turn); setTotal(data.total ?? total); }
  };
  const startFollowUp = async () => {
    if (!sessionId || !followUpCandidate) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/interview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "followup", sessionId, turnId: followUpCandidate.turnId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法生成追问。");
      setTurn(data.turn); setFollowUpCandidate(null);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "无法生成追问。"); }
    finally { setBusy(false); }
  };
  const addFollowUpToLibrary = async (turnId: string) => {
    if (!sessionId) return;
    setDraftBusyTurnId(turnId); setError("");
    try {
      const response = await fetch("/api/interview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "followupCardDraft", sessionId, turnId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "暂时无法生成追问卡草稿。");
      window.localStorage.setItem("mock-interview:follow-up-card-draft", JSON.stringify(data.draft));
      router.push("/library");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "暂时无法生成追问卡草稿。"); }
    finally { setDraftBusyTurnId(null); }
  };

  if (!sessionId) return <PageLayout><SemanticComparisonProgress open={semanticProgress.open} progress={semanticProgress.progress}/><PageHeader eyebrow={<><Mic2 size={15}/> 模拟面试</>} title="把答案放进真实语境。" description="问题来自你的卡片；邻近追问会清晰标为 AI 拓展。" tour="interview" /><Panel className="interview-intro" data-tour="interview-start"><div className="microphone-orb"><Mic2 size={34}/></div><h2>15 分钟真实模拟</h2><p>系统会逐题提问、记录你的回答，并在结束后给出表达和知识覆盖反馈。</p><Button onClick={start} disabled={busy}><Play size={17}/> {busy ? "准备中…" : "开始模拟"}</Button>{error && <p className="danger">{error} <Link href="/library">去创建卡片</Link></p>}</Panel></PageLayout>;
  if (!turn) {
    const average = scores.length ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length) : 0;
    return <PageLayout><SemanticComparisonProgress open={semanticProgress.open} progress={semanticProgress.progress}/><PageHeader eyebrow="面试报告" title="这场练习完成了。" description="把薄弱点带回复习队列，下一次会更稳。" tour="interview" /><Panel className="interview-stage page-focus-content" data-tour="interview-report"><div className="report-score">{average}</div><h2>综合表现</h2><div className="stack interview-results" style={{ marginTop: 20 }}>{scores.map((score, index) => <article className="interview-result" key={score.turnId}><p className="result-question">第 {index + 1} 题 · {score.question}</p><div className="feedback"><strong>{score.score} 分</strong><p>{score.feedback}</p>{score.gaps.length > 0 && <p>建议回流：{score.gaps.join("、")}</p>}</div><AnswerComparisonView comparison={score.comparison} answer={score.answer}/>{score.otherQuestions.length > 0 && <div className="more-questions compact"><p className="eyebrow">这题还可能这样问</p><ul>{score.otherQuestions.map((question) => <li key={question}>{question}</li>)}</ul></div>}{score.isExtension && <div className="follow-up-library-action"><Button variant="secondary" disabled={draftBusyTurnId === score.turnId} onClick={() => void addFollowUpToLibrary(score.turnId)}><BookOpenCheck size={16}/>{draftBusyTurnId === score.turnId ? "正在生成卡片草稿…" : "将这条追问加入藏品"}</Button></div>}</article>)}</div>{error && <p className="danger" role="alert">{error}</p>}<div className="form-actions" style={{ marginTop: 24 }}><Button onClick={() => { setSessionId(null); setScores([]); }}>再来一次</Button></div></Panel></PageLayout>;
  }
  return <PageLayout><SemanticComparisonProgress open={semanticProgress.open} progress={semanticProgress.progress}/><PageHeader eyebrow={<><Mic2 size={15}/> 模拟面试</>} title="逐题完成你的真实表达。" description="回答会被记录到本场报告；完成原题后可选择 AI 拓展追问。" tour="interview" /><section className="interview-stage page-focus-content"><p className="question-number">第 {turn.index} / {total} 题 · {turn.isExtension ? "AI 拓展追问" : "真实面试模式"}</p>{followUpCandidate && <div className="interview-follow-up" data-tour="interview-followup"><span>刚完成：{followUpCandidate.question}</span><Button type="button" variant="outline" disabled={!llmConfigured || busy} onClick={startFollowUp}><Sparkles size={16}/> AI 拓展追问</Button></div>}<h1 className="interview-question">{turn.question}</h1><div className="form-grid">{turn.isExtension && <div className="follow-up-library-action"><Button type="button" variant="secondary" disabled={draftBusyTurnId === turn.id} onClick={() => void addFollowUpToLibrary(turn.id)}><BookOpenCheck size={16}/>{draftBusyTurnId === turn.id ? "正在生成卡片草稿…" : "加入藏品"}</Button><span>AI 会预填内容并自动判断与原卡的关系。</span></div>}<textarea className="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }} placeholder="建议按要点分行作答（如 1. … 换行 2. …），识别和高亮效果最佳。" /><ComparisonModeControl mode={comparisonMode} onChange={setComparisonMode} llmConfigured={llmConfigured} compact /><p className="transcript-note">语音会转写到输入框，你可以在提交前修正措辞。⌘/Ctrl + Enter 可提交。</p>{error && <p className="danger" role="alert">{error}</p>}<div className="form-actions"><Button variant="ghost" onClick={speak}><Volume2 size={17}/> 朗读问题</Button><SpeechRecorder onTranscript={(value) => setAnswer((old) => `${old}${old ? "\n" : ""}${value}`)} /><Button disabled={!answer.trim() || busy} onClick={submit}>{busy ? "正在进行语义比对…" : "提交这一题"}</Button></div></div></section></PageLayout>;
}
