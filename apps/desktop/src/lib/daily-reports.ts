import "server-only";
import { sqlite } from "@/lib/db";
import { getAppSettings } from "@/lib/settings";
import { shanghaiDayBounds, todayShanghai } from "@/lib/utils";
import type { DailyLearningReport, DailyReportItem, RatingName } from "@/lib/types";

type TaskRow = { id: string; card_id: string | null; title: string; kind: "learn" | "review"; status: string; completed_at: string | null };

function questionOf(task: TaskRow) { return task.title.replace(/^(学习|复习)：/, ""); }

function cutoffDate(days: number) {
  const date = new Date(`${todayShanghai()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date.toISOString().slice(0, 10);
}

export function pruneDailyReports() {
  const days = getAppSettings().dailyReportRetentionDays;
  if (days === null) return 0;
  const cutoff = cutoffDate(days);
  const deleted = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM daily_report_items WHERE report_date < ?").run(cutoff);
    return sqlite.prepare("DELETE FROM daily_reports WHERE report_date < ?").run(cutoff).changes;
  })();
  return Number(deleted);
}

function reportItems(date: string, tasks: TaskRow[]): DailyReportItem[] {
  const initial = sqlite.prepare("SELECT completed_at FROM initial_study_logs WHERE card_id = ? AND completed_at >= ? AND completed_at < ? ORDER BY completed_at DESC LIMIT 1");
  const review = sqlite.prepare("SELECT ai_score, confirmed_rating, feedback, next_due_at, created_at FROM review_logs WHERE card_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 1");
  const { start, end } = shanghaiDayBounds(date);
  return tasks.reduce<DailyReportItem[]>((items, task) => {
    if (!task.card_id) return items;
    if (task.kind === "learn") {
      const row = initial.get(task.card_id, start, end) as { completed_at?: string } | undefined;
      if (row?.completed_at) items.push({ taskId: task.id, cardId: task.card_id, question: questionOf(task), kind: "learn", completedAt: row.completed_at, score: null, rating: null, feedback: "已完成首次学习，明天开始主动回忆。", nextReviewAt: null });
      return items;
    }
    const row = review.get(task.card_id, start, end) as { ai_score?: number; confirmed_rating?: RatingName; feedback?: string | null; next_due_at?: string | null; created_at?: string } | undefined;
    if (row?.created_at) items.push({ taskId: task.id, cardId: task.card_id, question: questionOf(task), kind: "review", completedAt: row.created_at, score: Number(row.ai_score), rating: row.confirmed_rating ?? null, feedback: row.feedback ?? null, nextReviewAt: row.next_due_at ?? null });
    return items;
  }, []);
}

/** Creates a report from the work actually completed on the selected day. */
export function refreshDailyLearningReport(date = todayShanghai()) {
  pruneDailyReports();
  const { start, end } = shanghaiDayBounds(date);
  const tasks = sqlite.prepare("SELECT id, card_id, title, kind, status, completed_at FROM daily_tasks WHERE kind IN ('learn', 'review') AND status = 'done' AND completed_at >= ? AND completed_at < ? ORDER BY CASE kind WHEN 'learn' THEN 1 ELSE 2 END, completed_at, id").all(start, end) as TaskRow[];
  if (!tasks.length) {
    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM daily_report_items WHERE report_date = ?").run(date);
      sqlite.prepare("DELETE FROM daily_reports WHERE report_date = ?").run(date);
    })();
    return null;
  }
  const items = reportItems(date, tasks);
  if (!items.length) return null;
  const initialCount = items.filter((item) => item.kind === "learn").length;
  const reviews = items.filter((item) => item.kind === "review");
  const averageScore = reviews.length ? Math.round(reviews.reduce((total, item) => total + (item.score ?? 0), 0) / reviews.length) : null;
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO daily_reports (report_date, total, initial_count, review_count, average_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(report_date) DO UPDATE SET total = excluded.total, initial_count = excluded.initial_count, review_count = excluded.review_count, average_score = excluded.average_score, updated_at = excluded.updated_at").run(date, items.length, initialCount, reviews.length, averageScore, now, now);
    sqlite.prepare("DELETE FROM daily_report_items WHERE report_date = ?").run(date);
    const insert = sqlite.prepare("INSERT INTO daily_report_items (task_id, report_date, card_id, question, kind, completed_at, score, rating, feedback, next_review_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const item of items) insert.run(item.taskId, date, item.cardId, item.question, item.kind, item.completedAt, item.score, item.rating, item.feedback, item.nextReviewAt);
  })();
  return getDailyLearningReport(date);
}

export function getDailyLearningReport(date: string): DailyLearningReport | null {
  pruneDailyReports();
  const report = sqlite.prepare("SELECT report_date, total, initial_count, review_count, average_score FROM daily_reports WHERE report_date = ?").get(date) as { report_date: string; total: number; initial_count: number; review_count: number; average_score: number | null } | undefined;
  if (!report) return null;
  const items = sqlite.prepare("SELECT task_id, card_id, question, kind, completed_at, score, rating, feedback, next_review_at FROM daily_report_items WHERE report_date = ? ORDER BY CASE kind WHEN 'learn' THEN 1 ELSE 2 END, completed_at, task_id").all(date) as Array<{ task_id: string; card_id: string | null; question: string; kind: "learn" | "review"; completed_at: string; score: number | null; rating: RatingName | null; feedback: string | null; next_review_at: string | null }>;
  return { date: report.report_date, total: Number(report.total), initialCount: Number(report.initial_count), reviewCount: Number(report.review_count), averageScore: report.average_score === null ? null : Number(report.average_score), items: items.map((item) => ({ taskId: item.task_id, cardId: item.card_id, question: item.question, kind: item.kind, completedAt: item.completed_at, score: item.score === null ? null : Number(item.score), rating: item.rating, feedback: item.feedback, nextReviewAt: item.next_review_at })) };
}

export function dailyReportDates(month: string) {
  pruneDailyReports();
  return new Set((sqlite.prepare("SELECT report_date FROM daily_reports WHERE report_date LIKE ?").all(`${month}%`) as Array<{ report_date: string }>).map((row) => row.report_date));
}
