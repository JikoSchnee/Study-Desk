"use client";

import { useEffect } from "react";
import { CalendarClock, ChartNoAxesCombined, CircleCheckBig, ClipboardCheck, Clock3, GraduationCap, History, MessageSquareText, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnswerComparisonView } from "@/components/answer-comparison";
import { difficultyTier } from "@/lib/card-filters";
import type { Card, CardLearningDetails, RatingName } from "@/lib/types";

const ratingLabel: Record<RatingName, string> = { again: "忘记", hard: "困难", good: "良好", easy: "轻松" };

function exactTime(value: string | null) {
  if (!value) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function relativeTime(value: string | null, future = false) {
  if (!value) return "待首次作答";
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (future) {
    if (minutes <= 0) return "现在可复习";
    if (minutes < 60) return `${minutes} 分钟后`;
    if (minutes < 24 * 60) return `${Math.round(minutes / 60)} 小时后`;
    return `${Math.round(minutes / 1440)} 天后`;
  }
  const elapsed = Math.max(0, -minutes);
  if (elapsed < 60) return "刚刚练习";
  if (elapsed < 24 * 60) return `${Math.round(elapsed / 60)} 小时前`;
  return `${Math.round(elapsed / 1440)} 天前`;
}

function intervalLabel(minutes: number | null) {
  if (minutes === null) return "待积累";
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时`;
  return `${Math.round(minutes / 1440)} 天`;
}

type ChartPoint = { label: string; fullDate: string; score: number; interval: number | null; rating: RatingName };

function StudyTooltip({ active, payload, kind }: { active?: boolean; payload?: Array<{ payload: ChartPoint }>; kind: "score" | "interval" }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="study-chart-tooltip"><strong>{item.fullDate}</strong><span>{kind === "score" ? `${item.score} 分 · ${ratingLabel[item.rating]}` : `下次间隔：${intervalLabel(item.interval)}`}</span></div>;
}

export function CardDetailsDialog({ card, learning, onClose }: { card: Card; learning: CardLearningDetails; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const scoreData: ChartPoint[] = learning.history.filter((item) => !item.isInitial && item.score !== null).map((item) => ({
    label: new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(item.reviewedAt)),
    fullDate: exactTime(item.reviewedAt),
    score: item.score!,
    interval: item.intervalMinutes,
    rating: item.rating,
  }));
  const intervalData = learning.history.map((item) => ({
    label: new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(item.reviewedAt)),
    fullDate: exactTime(item.reviewedAt),
    score: item.score ?? 0,
    interval: item.intervalMinutes,
    rating: item.rating,
  })).filter((item) => item.interval !== null);
  const tier = difficultyTier(learning.fsrsDifficulty);
  const difficulty = learning.fsrsDifficulty === null ? "待首次练习" : `${tier?.label ?? "—"} · ${learning.fsrsDifficulty.toFixed(1)} / 10`;
  return <div className="card-editor-backdrop card-details-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="card-editor-modal card-details-modal" role="dialog" aria-modal="true" aria-labelledby="card-details-title">
      <div className="card-editor-heading card-details-heading">
        <div><p className="eyebrow"><GraduationCap size={15}/> 卡片详情</p><h2 id="card-details-title">这张卡的学习轨迹</h2><p>内容不变，进步看得见。</p></div>
        <button className="icon-close" type="button" onClick={onClose} aria-label="关闭卡片详情"><X size={19}/></button>
      </div>
      <div className="card-details-body">
        <section className="detail-question"><p className="eyebrow">主问题</p><h3>{card.question}</h3><div className="detail-card-metadata" aria-label="卡片基础信息"><div><span>知识库类型</span><strong>{card.track}</strong></div><div><span>难度</span><strong>{difficulty}</strong></div></div></section>
        <section className="learning-overview" aria-label="学习概况">
          <div className="learning-stat next"><CalendarClock size={20}/><span>下次复习</span><strong>{relativeTime(learning.nextReviewAt, true)}</strong><small>{exactTime(learning.nextReviewAt)}</small></div>
          <div className="learning-stat last"><History size={20}/><span>上次练习</span><strong>{relativeTime(learning.lastReviewAt)}</strong><small>{exactTime(learning.lastReviewAt)}</small></div>
          <div className="learning-stat score"><ChartNoAxesCombined size={20}/><span>平均得分</span><strong>{learning.averageScore === null ? "—" : `${learning.averageScore} 分`}</strong><small>{learning.answerCount ? `${learning.reviewCount} 次练习 · ${learning.answerCount} 次作答` : learning.reviewCount ? "已完成 FSRS 初始化，等待首次作答" : "等待首次练习"}</small></div>
        </section>
        <section className="learning-curves" aria-label="学习曲线">
          <div className="curve-heading"><div><p className="eyebrow">最近 10 次</p><h3>得分走势</h3></div><span className="curve-chip"><CircleCheckBig size={15}/> 每次作答后更新</span></div>
          {scoreData.length ? <div className="study-chart score-chart"><ResponsiveContainer width="100%" height={210}><LineChart data={scoreData} margin={{ top: 16, right: 14, bottom: 0, left: -18 }}><CartesianGrid vertical={false} stroke="#d9f0cf" strokeDasharray="4 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#718176", fontSize: 11, fontWeight: 800 }} dy={8}/><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#718176", fontSize: 11, fontWeight: 800 }} tickCount={5}/><Tooltip cursor={{ stroke: "#84c957", strokeWidth: 2, strokeDasharray: "4 4" }} content={<StudyTooltip kind="score"/>}/><Line type="monotone" dataKey="score" stroke="#58b72d" strokeWidth={4} dot={{ r: 5, fill: "#fff", stroke: "#58b72d", strokeWidth: 3 }} activeDot={{ r: 7, fill: "#58b72d", stroke: "#fff", strokeWidth: 3 }}/></LineChart></ResponsiveContainer></div> : <div className="curve-empty">完成第一次真实作答后，这里会长出你的得分轨迹。</div>}
        </section>
        <section className="learning-curves interval-curve" aria-label="复习间隔走势">
          <div className="curve-heading"><div><p className="eyebrow">FSRS 排程</p><h3>复习间隔走势</h3></div><span className="curve-chip blue"><Clock3 size={15}/> 从本次练习到下次复习</span></div>
          {intervalData.length ? <div className="study-chart interval-chart"><ResponsiveContainer width="100%" height={210}><LineChart data={intervalData} margin={{ top: 16, right: 14, bottom: 0, left: -18 }}><CartesianGrid vertical={false} stroke="#cdeafa" strokeDasharray="4 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#718176", fontSize: 11, fontWeight: 800 }} dy={8}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#718176", fontSize: 11, fontWeight: 800 }} tickFormatter={(value) => intervalLabel(Number(value))} width={42}/><Tooltip cursor={{ stroke: "#54b6e6", strokeWidth: 2, strokeDasharray: "4 4" }} content={<StudyTooltip kind="interval"/>}/><Line type="monotone" dataKey="interval" stroke="#269fd8" strokeWidth={4} dot={{ r: 5, fill: "#fff", stroke: "#269fd8", strokeWidth: 3 }} activeDot={{ r: 7, fill: "#269fd8", stroke: "#fff", strokeWidth: 3 }}/></LineChart></ResponsiveContainer></div> : <div className="curve-empty">历史记录尚未保存排程间隔；从今后复习开始累积。</div>}
        </section>
        <section className="latest-practice" aria-label="最近一次完整练习记录"><div className="curve-heading"><div><p className="eyebrow">最近一次</p><h3>练习回放</h3></div><span className="curve-chip blue"><ClipboardCheck size={15}/> 正式复习记录</span></div>{learning.latestPractice ? <div className="latest-practice-body"><div className="practice-question"><p className="eyebrow">当次问题</p><strong>{learning.latestPractice.presentedQuestion ?? "此旧记录未保存当次题面。"}</strong><small>{exactTime(learning.latestPractice.reviewedAt)}</small></div><div className="practice-status-grid"><div><span>本次得分</span><strong>{learning.latestPractice.score} 分</strong></div><div><span>建议状态</span><strong>{ratingLabel[learning.latestPractice.suggestedRating]}</strong></div><div><span>确认状态</span><strong>{ratingLabel[learning.latestPractice.confirmedRating]}</strong></div><div><span>下次复习</span><strong>{relativeTime(learning.latestPractice.nextReviewAt, true)}</strong></div></div><div className="practice-feedback"><MessageSquareText size={18}/><div><p className="eyebrow">练习评价</p><p>{learning.latestPractice.feedback ?? "此旧记录未保存文字评价。"}</p></div></div>{learning.latestPractice.comparison ? <AnswerComparisonView comparison={learning.latestPractice.comparison} answer={learning.latestPractice.response}/> : <div className="practice-record-missing">此旧记录未保存答案对照。已保留当次作答：<p>{learning.latestPractice.response}</p></div>}</div> : <div className="curve-empty">完成一次正式复习并确认记忆状态后，这里会保留完整回放。</div>}</section>
        <section className="detail-content"><div><p className="eyebrow">答案要点</p><ol>{card.answerPoints.map((point) => <li key={point.id}>{point.content}</li>)}</ol></div>{card.questionVariants.length > 0 && <div><p className="eyebrow">其他问法</p><ul>{card.questionVariants.map((item) => <li key={item.id}>{item.content}</li>)}</ul></div>}{card.note && <div><p className="eyebrow">学习备注</p><p>{card.note}</p></div>}</section>
      </div>
    </section>
  </div>;
}
