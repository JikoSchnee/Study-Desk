"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ClipboardList, Flame, Mic2, RefreshCw, Target } from "lucide-react";
import { TrainingCalendar } from "@/components/training-calendar";
import { Button, Panel } from "@/components/ui";
import { TourButton, useTour } from "@/components/tour";
import type { DailyTask } from "@/lib/types";

type DashboardData = {
  date: string;
  tasks: DailyTask[];
  totals: { dueReview: number; reviewedToday: number; completed: number };
};

export default function TodayPage() {
  const { startOnboarding } = useTour();
  const [data, setData] = useState<DashboardData | null>(null);
  const load = useCallback(() => fetch("/api/dashboard").then((response) => response.json()).then(setData), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="loading">正在铺开今天的学习路径…</div>;
  const goals = ([
    { kind: "learn", queue: "initial", label: "今日需学习", idle: "先录入一张卡片，今天的学习目标会自动出现。", action: "开始学习" },
    { kind: "review", queue: "review", label: "今日需复习", idle: "今天没有到期复习，完成学习后会自动进入后续安排。", action: "开始复习" },
  ] as const).map((goal) => {
    const tasks = data.tasks.filter((task) => task.kind === goal.kind);
    const completed = tasks.filter((task) => task.status === "done").length;
    const total = tasks.length;
    return { ...goal, completed, total, percent: total ? Math.round((completed / total) * 100) : 0, complete: total > 0 && completed === total };
  });
  const activeGoals = goals.filter((goal) => goal.total > 0);
  const completedGoals = activeGoals.filter((goal) => goal.complete).length;
  const totalPercent = activeGoals.length ? Math.round((completedGoals / activeGoals.length) * 100) : 0;
  const TutorialLauncher = () => {
    const frame = useRef<number | null>(null); const last = useRef(0); const y = useRef(0); const velocity = useRef(-370); const bounces = useRef(0); const pauseUntil = useRef(0); const [offset, setOffset] = useState(0); const [active, setActive] = useState(true); const [starting, setStarting] = useState(false);
    useEffect(() => {
      if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const tick = (time: number) => { const delta = Math.min((time - (last.current || time)) / 1000, .04); last.current = time; if (time < pauseUntil.current) { frame.current = requestAnimationFrame(tick); return; } velocity.current += 1850 * delta; y.current += velocity.current * delta; if (y.current >= 0) { y.current = 0; if (bounces.current >= 3) { bounces.current = 0; velocity.current = -370; pauseUntil.current = time + 360; } else { velocity.current = -velocity.current * .52; bounces.current += 1; } } setOffset(y.current); frame.current = requestAnimationFrame(tick); };
      frame.current = requestAnimationFrame(tick); return () => { if (frame.current) cancelAnimationFrame(frame.current); };
    }, [active]);
    const launch = async () => {
      if (starting) return;
      setActive(false); setStarting(true);
      try { await startOnboarding(); }
      catch { setActive(true); }
      finally { setStarting(false); }
    };
    return <section className="tutorial-panel" data-tour="home-tutorial"><div><p className="eyebrow">基础教程</p><h2>3 分钟，完成第一轮训练</h2><p>自动准备一张演示卡，真实作答一次，再看看它如何进入后续复习与管理。</p></div><div className="tutorial-launcher" style={{ transform: `translateY(${offset}px)` }}><Button disabled={starting} onClick={() => void launch()}><BookOpen size={17}/> {starting ? "正在准备样例…" : "开始基础教程"}</Button></div></section>;
  };
  return <>
    <section className="today-hero">
      <div><p className="eyebrow"><Flame size={15}/> 今天的训练</p><h1>即刻开始</h1><p>从一个小问题开始，今天也能让表达更清楚一点。</p><div className="hero-actions"><Link href="/cards"><Button><BookOpen size={17}/> 学习</Button></Link><Link href="/review"><Button variant="secondary"><RefreshCw size={17}/> 复习</Button></Link><Link href="/interview"><Button variant="outline"><Mic2 size={17}/> 模拟面试</Button></Link><TourButton tour="today" /></div></div>
      <div className="hero-summary" data-tour="today-summary" aria-label="今日复习概况"><div className="hero-stat"><strong>{data.totals.dueReview}</strong><span>此刻待复习</span></div><div className="hero-stat"><strong>{data.totals.reviewedToday}</strong><span>今日已复习</span></div><div className="hero-stat"><strong>{totalPercent}%</strong><span>目标完成</span></div></div>
    </section>
    <div className="two-column" style={{ marginTop: 20 }}>
      <div className="stack"><TutorialLauncher/><Panel data-tour="daily-tasks"><div className="section-title"><div><p className="eyebrow"><Target size={15}/> 任务路径</p><h2>今天的小步</h2></div><strong>{completedGoals}/{activeGoals.length}</strong></div><div className="progress-track goal-total-progress" aria-label={`已完成 ${completedGoals} 个今日目标，共 ${activeGoals.length} 个`}><i style={{ width: `${totalPercent}%` }} /></div><div className="daily-goals" aria-label="今日学习与复习目标">{goals.map((goal) => <section className={`daily-goal ${goal.kind} ${goal.complete ? "complete" : ""}`} key={goal.kind}><div className="daily-goal-heading"><div><span className="kind">{goal.kind === "learn" ? "学" : "复"}</span><strong>{goal.label}</strong></div><b>{goal.completed}/{goal.total}</b></div><div className="progress-track" aria-label={`${goal.label}：${goal.completed}/${goal.total}`}><i style={{ width: `${goal.percent}%` }} /></div><div className="daily-goal-footer"><small>{goal.total === 0 ? goal.idle : goal.complete ? "今日目标已完成，仍可继续练习。" : `还差 ${goal.total - goal.completed} 张`}</small>{goal.complete ? <span className="goal-complete"><Check size={15}/> 已完成</span> : goal.total > 0 ? <Link href={`/review?queue=${goal.queue}`}><Button variant={goal.kind === "learn" ? "primary" : "secondary"}>{goal.action}</Button></Link> : goal.kind === "learn" ? <Link href="/cards"><Button variant="ghost">去录入</Button></Link> : <Button variant="ghost" disabled>暂无复习</Button>}</div></section>)}</div></Panel></div>
      <div className="stack"><Panel className="lime-panel continuous-training" data-tour="training-calendar"><p className="eyebrow"><ClipboardList size={15}/> 连续训练</p><h2>每天一点，<br/>就会更稳。</h2><p className="muted-copy">看见你持续练习的每一天。</p><TrainingCalendar /></Panel></div>
    </div>
  </>;
}
