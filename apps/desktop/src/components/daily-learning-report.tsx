"use client";

import { useState } from "react";
import { BookOpenCheck, CalendarClock, CheckCircle2, RefreshCw, Trophy } from "lucide-react";
import { CardDetailsDialog } from "@/components/card-details-dialog";
import { fetchJson } from "@/lib/client-api";
import { formatDate } from "@/lib/utils";
import type { Card, CardLearningDetails, CardRelationType, DailyLearningReport } from "@/lib/types";

const ratingLabel = { again: "忘记", hard: "困难", good: "良好", easy: "轻松" };

export function DailyLearningReportView({ report, compact = false }: { report: DailyLearningReport; compact?: boolean }) {
  const [detail, setDetail] = useState<{ card: Card; relatedCards: Array<Card & { relationType: CardRelationType }>; learning: CardLearningDetails } | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState("");
  const openCardReport = async (cardId: string) => {
    setLoadingCardId(cardId); setDetailError("");
    try {
      const data = await fetchJson<{ card: Card; relatedCards?: Array<Card & { relationType: CardRelationType }>; learning: CardLearningDetails }>(`/api/cards/${cardId}/details`, { label: "读取单卡学习报告" });
      setDetail({ card: data.card, relatedCards: data.relatedCards ?? [], learning: data.learning });
    } catch (error) { setDetailError(error instanceof Error ? error.message : "无法读取单卡学习报告。"); }
    finally { setLoadingCardId(null); }
  };
  return <section className={`daily-learning-report${compact ? " compact" : ""}`} aria-label={`${report.date} 学习报告`}>
    {detail && <CardDetailsDialog card={detail.card} relatedCards={detail.relatedCards} learning={detail.learning} onClose={() => setDetail(null)} />}
    <header><div><p className="eyebrow"><Trophy size={15}/> 今日学习报告</p><h3>{formatDate(report.date)} · 已完成 {report.total} 题</h3></div>{report.averageScore !== null && <strong className="daily-report-score">复习均分 {report.averageScore}</strong>}</header>
    <div className="daily-report-stats"><span><BookOpenCheck size={15}/> 首学 {report.initialCount}</span><span><RefreshCw size={15}/> 复习 {report.reviewCount}</span><span><CheckCircle2 size={15}/> 今日完成</span></div>
    <ul className="daily-report-items">{report.items.map((item) => <li key={item.taskId} className={item.kind}><div className="daily-report-item-heading"><span>{item.kind === "learn" ? "学" : "复"}</span>{item.cardId ? <button type="button" className="daily-report-card-link" disabled={loadingCardId === item.cardId} onClick={() => void openCardReport(item.cardId!)}>{loadingCardId === item.cardId ? "正在打开单卡报告…" : item.question}</button> : <strong>{item.question}</strong>}{item.score !== null && <b>{item.score} 分</b>}</div><p>{item.kind === "learn" ? "首次学习已完成，明天开始主动回忆。" : `${item.rating ? `${ratingLabel[item.rating]} · ` : ""}${item.feedback || "已完成本次复习。"}`}</p>{!compact && item.nextReviewAt && <small><CalendarClock size={14}/> 下次复习：{new Date(item.nextReviewAt).toLocaleString("zh-CN")}</small>}</li>)}</ul>{detailError && <p className="danger" role="alert">{detailError}</p>}
  </section>;
}
