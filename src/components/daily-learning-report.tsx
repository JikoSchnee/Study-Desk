import { BookOpenCheck, CalendarClock, CheckCircle2, RefreshCw, Trophy } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { DailyLearningReport } from "@/lib/types";

const ratingLabel = { again: "忘记", hard: "困难", good: "良好", easy: "轻松" };

export function DailyLearningReportView({ report, compact = false }: { report: DailyLearningReport; compact?: boolean }) {
  return <section className={`daily-learning-report${compact ? " compact" : ""}`} aria-label={`${report.date} 学习报告`}>
    <header><div><p className="eyebrow"><Trophy size={15}/> 今日学习报告</p><h3>{formatDate(report.date)} · 已完成 {report.total} 题</h3></div>{report.averageScore !== null && <strong className="daily-report-score">复习均分 {report.averageScore}</strong>}</header>
    <div className="daily-report-stats"><span><BookOpenCheck size={15}/> 首学 {report.initialCount}</span><span><RefreshCw size={15}/> 复习 {report.reviewCount}</span><span><CheckCircle2 size={15}/> 全部完成</span></div>
    <ul className="daily-report-items">{report.items.map((item) => <li key={item.taskId} className={item.kind}><div className="daily-report-item-heading"><span>{item.kind === "learn" ? "学" : "复"}</span><strong>{item.question}</strong>{item.score !== null && <b>{item.score} 分</b>}</div><p>{item.kind === "learn" ? "首次学习已完成，明天开始主动回忆。" : `${item.rating ? `${ratingLabel[item.rating]} · ` : ""}${item.feedback || "已完成本次复习。"}`}</p>{!compact && item.nextReviewAt && <small><CalendarClock size={14}/> 下次复习：{new Date(item.nextReviewAt).toLocaleString("zh-CN")}</small>}</li>)}</ul>
  </section>;
}
