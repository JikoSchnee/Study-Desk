"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Laptop, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import type { CommunityKnowledgeBase } from "@shared/community";

type ProtectedCard = { id: string; position: number; question: string; answerPoints: string[]; note: string; version: number };

export function CommunityPractice({ knowledgeBase, hasAccess }: { knowledgeBase: CommunityKnowledgeBase; hasAccess: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [card, setCard] = useState<ProtectedCard | null>(null);
  const [loadError, setLoadError] = useState("");
  const loadCard = useCallback(async (position: number) => {
    setCard(null); setLoadError(""); setRevealed(false);
    try {
      const response = await fetch(`/api/community/knowledge-bases/${encodeURIComponent(knowledgeBase.id)}/cards/${position}`, { cache: "no-store", headers: hasAccess && !knowledgeBase.isFree ? { "x-community-demo-access": "1" } : {} });
      const data = await response.json() as { card?: ProtectedCard; error?: string };
      if (!response.ok || !data.card) throw new Error(data.error ?? "无法读取当前题目。");
      setCard(data.card);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "无法读取当前题目。"); }
  }, [hasAccess, knowledgeBase.id, knowledgeBase.isFree]);
  useEffect(() => { if (hasAccess) void loadCard(questionIndex); }, [hasAccess, loadCard, questionIndex]);
  const next = () => setQuestionIndex((value) => (value + 1) % knowledgeBase.previewQuestions.length);
  if (!hasAccess) return <section className="community-practice-locked"><LockKeyhole size={42}/><p className="eyebrow">需要有效权益</p><h1>这套知识库仍然锁着</h1><p>登录购买账号后，服务端会重新检查知识库、作者订阅和退款状态。链接本身不会携带内容或转移权益。</p><Link href="/community"><Button><ArrowLeft size={17}/> 返回社区购买</Button></Link></section>;
  return <div className="community-practice-page">
    <header><Link href="/community"><ArrowLeft size={18}/> 返回社区</Link><div><ShieldCheck size={18}/><span>账号在线授权</span></div><a href={`study-desk://community/practice/${knowledgeBase.id}`}><Laptop size={18}/> 在桌面端打开</a></header>
    <section className="community-practice-heading"><p className="eyebrow">{knowledgeBase.title}</p><h1>先说出来，再看答案。</h1><p>第 {questionIndex + 1} 题 · 本次会话仅请求当前题目</p></section>
    <article className="community-practice-card"><div className="practice-watermark" aria-hidden="true">DEMO USER · {new Date().toLocaleDateString("zh-CN")}</div>{loadError ? <div className="community-practice-error" role="alert"><strong>题目加载失败</strong><p>{loadError}</p><Button variant="outline" onClick={() => void loadCard(questionIndex)}>重新加载</Button></div> : !card ? <div className="community-practice-loading">正在校验账号权益并加载当前题目…</div> : <><span>思考题</span><h2>{card.question}</h2>{revealed ? <div className="community-answer"><strong><Check size={18}/> 回答路径</strong><ol>{card.answerPoints.map((point) => <li key={point}>{point}</li>)}</ol></div> : <div className="community-recall-space"><i/><i/><i/><small>先用自己的话回答，准备好后再揭示要点。</small></div>}<div className="community-practice-actions">{revealed ? <><Button variant="outline" onClick={() => setRevealed(false)}><RotateCcw size={17}/> 再想一次</Button><Button onClick={next}>下一题 <ChevronRight size={17}/></Button></> : <Button onClick={() => setRevealed(true)}>查看回答路径</Button>}</div></>}</article>
    <p className="community-session-note"><ShieldCheck size={16}/> 内容按题加载；关闭会话后不保留完整知识库副本。</p>
  </div>;
}
