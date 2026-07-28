"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ClipboardList, Flame, Mic2, RefreshCw, Target } from "lucide-react";
import { TrainingCalendar } from "@/components/training-calendar";
import { Button, EmptyState, Panel } from "@/components/ui";
import type { DailyTask } from "@/lib/types";

type DashboardData = {
  date: string;
  tasks: DailyTask[];
  totals: { dueReview: number; reviewedToday: number; completed: number };
};

export default function TodayPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const load = useCallback(() => fetch("/api/dashboard").then((response) => response.json()).then(setData), []);
  useEffect(() => { load(); }, [load]);
  const update = async (id: string, status: "todo" | "skipped") => {
    await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  };
  if (!data) return <div className="loading">正在铺开今天的学习路径…</div>;
  const done = data.tasks.filter((task) => task.status === "done").length;
  const percent = data.tasks.length ? Math.round((done / data.tasks.length) * 100) : 0;
  return <>
    <section className="today-hero">
      <div><p className="eyebrow"><Flame size={15}/> 今天的训练</p><h1>即刻开始</h1><p>从一个小问题开始，今天也能让表达更清楚一点。</p><div className="hero-actions"><Link href="/cards"><Button><BookOpen size={17}/> 学习</Button></Link><Link href="/review"><Button variant="secondary"><RefreshCw size={17}/> 复习</Button></Link><Link href="/interview"><Button variant="outline"><Mic2 size={17}/> 模拟面试</Button></Link></div></div>
      <div className="hero-summary" aria-label="今日复习概况"><div className="hero-stat"><strong>{data.totals.dueReview}</strong><span>此刻待复习</span></div><div className="hero-stat"><strong>{data.totals.reviewedToday}</strong><span>今日已复习</span></div><div className="hero-stat"><strong>{percent}%</strong><span>任务完成</span></div></div>
    </section>
    <div className="two-column" style={{ marginTop: 20 }}>
      <div className="stack"><Panel><div className="section-title"><div><p className="eyebrow"><Target size={15}/> 任务路径</p><h2>今天的小步</h2></div><strong>{done}/{data.tasks.length}</strong></div><div className="progress-track" aria-label={`完成度 ${percent}%`}><i style={{ width: `${percent}%` }} /></div>{data.tasks.length ? <div className="task-list" style={{ marginTop: 16 }}>{data.tasks.map((task) => { const queue = task.kind === "learn" ? "initial" : "review"; return <div key={task.id} className={`task ${task.status === "done" ? "done" : ""}`}><span className="kind">{task.kind === "review" ? "复" : "学"}</span><div className="task-title">{task.title}<small>{task.status === "skipped" ? "已跳过" : task.status === "done" ? "已同步完成" : `约 ${task.estimateMinutes} 分钟`}</small></div>{task.status === "done" ? <Button variant="ghost" disabled><Check size={17}/> 已完成</Button> : task.status === "skipped" ? <Button variant="ghost" onClick={() => update(task.id, "todo")}>恢复任务</Button> : <div className="task-actions"><Link href={`/review?queue=${queue}&cardId=${task.cardId ?? ""}`}><Button>开始</Button></Link><Button variant="ghost" aria-label={`跳过：${task.title}`} onClick={() => update(task.id, "skipped")}>跳过</Button></div>}</div>; })}</div> : <EmptyState title="从第一张卡片开始" detail="把准备过的一个问题和答案写下来，今日计划会自动出现。" action={<Link href="/cards"><Button>创建第一张卡片</Button></Link>} />}</Panel></div>
      <div className="stack"><Panel className="lime-panel continuous-training"><p className="eyebrow"><ClipboardList size={15}/> 连续训练</p><h2>每天一点，<br/>就会更稳。</h2><p className="muted-copy">看见你持续练习的每一天。</p><TrainingCalendar /></Panel></div>
    </div>
  </>;
}
