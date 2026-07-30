"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, BookOpen, Check, CircleOff, ClipboardList, Flame, Mic2, RefreshCw, Target } from "lucide-react";
import { HomeTutorialDialog } from "@/components/home-tutorial-dialog";
import { TrainingCalendar } from "@/components/training-calendar";
import { Button, Panel } from "@/components/ui";
import { TourButton } from "@/components/tour";
import type { DailyTask } from "@/lib/types";

type DashboardData = {
  date: string;
  tasks: DailyTask[];
  totals: { dueReview: number; reviewedToday: number; completed: number };
};

function TutorialLauncher({ onLaunch }: { onLaunch: () => void }) {
  const frame = useRef<number | null>(null);
  const last = useRef(0);
  const offset = useRef(0);
  const velocity = useRef(-420);
  const bounces = useRef(0);
  const pauseUntil = useRef(0);
  const [y, setY] = useState(0);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    last.current = 0;
    offset.current = 0;
    velocity.current = -420;
    bounces.current = 0;
    pauseUntil.current = 0;
    const tick = (time: number) => {
      const delta = Math.min((time - (last.current || time)) / 1000, .035);
      last.current = time;
      if (time >= pauseUntil.current) {
        velocity.current += 2200 * delta;
        offset.current += velocity.current * delta;
        if (offset.current >= 0) {
          offset.current = 0;
          if (bounces.current >= 6) {
            bounces.current = 0;
            velocity.current = -420;
            pauseUntil.current = time + 1300;
          } else {
            velocity.current = -velocity.current * .82;
            bounces.current += 1;
          }
        }
        setY(offset.current);
      }
      frame.current = window.requestAnimationFrame(tick);
    };
    frame.current = window.requestAnimationFrame(tick);
    return () => { if (frame.current) window.cancelAnimationFrame(frame.current); };
  }, [active]);

  const launch = () => {
    setActive(false);
    setY(0);
    onLaunch();
  };

  return <section className="tutorial-panel" data-tour="home-tutorial"><div><p className="eyebrow">基础教程</p><h2>1 分钟，看懂训练流程</h2><p>不创建演示卡，只用一段缩略动画带你看完录入、整理、学习和复习。</p></div><div className="tutorial-launcher" style={{ transform: `translateY(${y}px)` }}><Button onClick={launch}><BookOpen size={17}/> 查看基础教程</Button></div></section>;
}

export default function TodayPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const load = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store", signal: controller.signal });
      const result = await response.json() as Partial<DashboardData> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? `读取今日计划失败（HTTP ${response.status}）。`);
      if (!Array.isArray(result.tasks) || !result.totals) throw new Error("今日计划返回的数据不完整。");
      setData(result as DashboardData);
    } catch (error) {
      setLoadError(error instanceof DOMException && error.name === "AbortError" ? "读取今日计划超时，请检查本地服务后重试。" : error instanceof Error ? error.message : "读取今日计划失败，请重试。");
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) return <div className="loading">正在铺开今天的学习路径…</div>;
  if (!data) return <Panel className="load-error" role="alert"><AlertCircle size={22}/><div><h2>今日页暂时无法加载</h2><p>{loadError || "请稍后重试。"}</p></div><Button type="button" variant="secondary" onClick={() => void load()}><RefreshCw size={17}/> 重试</Button></Panel>;
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
  return <>
    <HomeTutorialDialog open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    <section className="today-hero">
      <div><p className="eyebrow"><Flame size={15}/> 今天的训练</p><h1>即刻开始</h1><p>从一个小问题开始，今天也能让表达更清楚一点。</p><div className="hero-actions"><Link href="/review?queue=initial"><Button><BookOpen size={17}/> 学习</Button></Link><Link href="/review?queue=review"><Button variant="secondary"><RefreshCw size={17}/> 复习</Button></Link><span className="disabled-interview-action" title="模拟面试暂未开放" aria-label="模拟面试暂未开放"><Button variant="outline" disabled><Mic2 size={17}/> 模拟面试</Button><span className="disabled-interview-badge" aria-hidden="true"><CircleOff size={15}/></span></span><TourButton tour="today" /></div></div>
      <div className="hero-summary" data-tour="today-summary" aria-label="今日复习概况"><div className="hero-stat"><strong>{data.totals.dueReview}</strong><span>此刻待复习</span></div><div className="hero-stat"><strong>{data.totals.reviewedToday}</strong><span>今日已复习</span></div><div className="hero-stat"><strong>{totalPercent}%</strong><span>目标完成</span></div></div>
    </section>
    <div className="two-column" style={{ marginTop: 20 }}>
      <div className="stack"><TutorialLauncher onLaunch={() => setTutorialOpen(true)} /><Panel data-tour="daily-tasks"><div className="section-title"><div><p className="eyebrow"><Target size={15}/> 任务路径</p><h2>今天的小步</h2></div><strong>{completedGoals}/{activeGoals.length}</strong></div><div className="progress-track goal-total-progress" aria-label={`已完成 ${completedGoals} 个今日目标，共 ${activeGoals.length} 个`}><i style={{ width: `${totalPercent}%` }} /></div><div className="daily-goals" aria-label="今日学习与复习目标">{goals.map((goal) => <section className={`daily-goal ${goal.kind} ${goal.complete ? "complete" : ""}`} key={goal.kind}><div className="daily-goal-heading"><div><span className="kind">{goal.kind === "learn" ? "学" : "复"}</span><strong>{goal.label}</strong></div><b>{goal.completed}/{goal.total}</b></div><div className="progress-track" aria-label={`${goal.label}：${goal.completed}/${goal.total}`}><i style={{ width: `${goal.percent}%` }} /></div><div className="daily-goal-footer"><small>{goal.total === 0 ? goal.idle : goal.complete ? "今日目标已完成，仍可继续练习。" : `还差 ${goal.total - goal.completed} 张`}</small>{goal.complete ? <span className="goal-complete"><Check size={15}/> 已完成</span> : goal.total > 0 ? <Link href={`/review?queue=${goal.queue}`}><Button variant={goal.kind === "learn" ? "primary" : "secondary"}>{goal.action}</Button></Link> : goal.kind === "learn" ? <Link href="/library"><Button variant="ghost">去创建卡片</Button></Link> : <Button variant="ghost" disabled>暂无复习</Button>}</div></section>)}</div></Panel></div>
      <div className="stack"><Panel className="lime-panel continuous-training" data-tour="training-calendar"><p className="eyebrow"><ClipboardList size={15}/> 连续训练</p><h2>每天一点，<br/>就会更稳。</h2><p className="muted-copy">看见你持续练习的每一天。</p><TrainingCalendar /></Panel></div>
    </div>
  </>;
}
