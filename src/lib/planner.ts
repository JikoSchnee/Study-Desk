import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import { shanghaiDayBounds, todayShanghai } from "@/lib/utils";
import { listCards } from "@/lib/cards";
import { getAppSettings } from "@/lib/settings";
import type { DailyTask } from "@/lib/types";
import { dailyReportDates, refreshDailyLearningReport } from "@/lib/daily-reports";

function rowToTask(row: Record<string, unknown>): DailyTask {
  return {
    id: row.id as string, planDate: row.plan_date as string, kind: row.kind as DailyTask["kind"], title: row.title as string,
    detail: row.detail as string | null, cardId: row.card_id as string | null, estimateMinutes: row.estimate_minutes as number, status: row.status as DailyTask["status"], completedAt: row.completed_at as string | null,
  };
}

export function ensureDailyPlan(date = todayShanghai()) {
  const preference = getAppSettings();
  const exists = sqlite.prepare("SELECT date FROM daily_plans WHERE date = ?").get(date);
  if (!exists) sqlite.prepare("INSERT INTO daily_plans (date, budget_minutes, created_at) VALUES (?, ?, ?)").run(date, preference.dailyInitialTarget + preference.dailyReviewTarget, new Date().toISOString());

  // Interview tasks belonged to the old minute-budget planner. Remove them as
  // part of the migration instead of leaving misleading, disconnected tasks.
  sqlite.prepare("DELETE FROM daily_tasks WHERE plan_date = ? AND kind = 'interview'").run(date);
  const existingTasks = listDailyTasks(date);
  const assignedCards = new Set(listActiveDailyTasks(date).filter((task) => task.status === "todo").map((task) => task.cardId).filter(Boolean));
  const now = new Date().toISOString();
  const insertTask = (kind: "review" | "learn", title: string, cardId: string, estimate: number) => {
    sqlite.prepare("INSERT INTO daily_tasks (id, plan_date, kind, title, card_id, estimate_minutes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'todo', ?)")
      .run(randomUUID(), date, kind, title, cardId, estimate, now);
  };
  // A dashboard refresh calls this function again. Only fill the remaining
  // slots, otherwise every refresh would append another full daily target.
  const scheduledReviewCount = existingTasks.filter((task) => task.kind === "review").length;
  const scheduledLearningCount = existingTasks.filter((task) => task.kind === "learn").length;
  const remainingReviewSlots = Math.max(0, preference.dailyReviewTarget - scheduledReviewCount);
  const remainingLearningSlots = Math.max(0, preference.dailyInitialTarget - scheduledLearningCount);
  const dueRows = sqlite.prepare("SELECT c.id, c.question FROM cards c JOIN review_state r ON r.card_id = c.id WHERE c.status = 'review' AND r.due_at <= ? ORDER BY r.due_at ASC, c.id ASC LIMIT ?").all(now, remainingReviewSlots) as Array<{ id: string; question: string }>;
  for (const card of dueRows) if (!assignedCards.has(card.id)) { insertTask("review", `复习：${card.question}`, card.id, 3); assignedCards.add(card.id); }
  const learning = listCards().filter((card) => card.status === "learning" && !assignedCards.has(card.id)).slice(0, remainingLearningSlots);
  for (const card of learning) { insertTask("learn", `学习：${card.question}`, card.id, 5); assignedCards.add(card.id); }
  return listDailyTasks(date);
}

/** Shrinks the rolling plan from its newest tasks while keeping today's completed work. */
export function restartDailyPlan(date = todayShanghai()) {
  ensureDailyPlan(date);
  const preference = getAppSettings();
  const { start, end } = shanghaiDayBounds(date);
  sqlite.transaction(() => {
    const trimKind = (kind: "learn" | "review", target: number) => {
      const completed = sqlite.prepare("SELECT COUNT(*) AS count FROM daily_tasks WHERE kind = ? AND status = 'done' AND completed_at >= ? AND completed_at < ?").get(kind, start, end) as { count: number };
      const pending = sqlite.prepare("SELECT id FROM daily_tasks WHERE kind = ? AND status = 'todo' AND plan_date <= ? ORDER BY plan_date DESC, created_at DESC, id DESC").all(kind, date) as Array<{ id: string }>;
      const remove = Math.max(0, Number(completed.count) + pending.length - target);
      const deleteTask = sqlite.prepare("DELETE FROM daily_tasks WHERE id = ?");
      for (const task of pending.slice(0, remove)) deleteTask.run(task.id);
    };
    trimKind("learn", preference.dailyInitialTarget);
    trimKind("review", preference.dailyReviewTarget);
  })();
  refreshDailyLearningReport(date);
  return listActiveDailyTasks(date);
}

function nextExtraInitialStudyCard(date: string) {
  const assignedCardIds = new Set(listActiveDailyTasks(date).filter((task) => task.status === "todo").map((task) => task.cardId).filter(Boolean));
  return listCards()
    .filter((item) => item.status === "learning" && !assignedCardIds.has(item.id))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0] ?? null;
}

export function hasExtraInitialStudy(date = todayShanghai()) {
  ensureDailyPlan(date);
  return Boolean(nextExtraInitialStudyCard(date));
}

/** Adds one unplanned new card to today's first-study plan without changing the daily target. */
export function addExtraInitialStudy(date = todayShanghai()) {
  ensureDailyPlan(date);
  const card = nextExtraInitialStudyCard(date);
  if (!card) return null;

  const now = new Date().toISOString();
  const id = randomUUID();
  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO daily_tasks (id, plan_date, kind, title, card_id, estimate_minutes, status, created_at) VALUES (?, ?, 'learn', ?, ?, 5, 'todo', ?)")
      .run(id, date, `学习：${card.question}`, card.id, now);
    // A finished report is a snapshot of every planned task. Adding one means
    // it must wait until the new task is completed before being shown again.
    sqlite.prepare("DELETE FROM daily_report_items WHERE report_date = ?").run(date);
    sqlite.prepare("DELETE FROM daily_reports WHERE report_date = ?").run(date);
  })();
  return listDailyTasks(date).find((task) => task.id === id) ?? null;
}

export function listDailyTasks(date = todayShanghai()) {
  return (sqlite.prepare("SELECT * FROM daily_tasks WHERE plan_date = ? ORDER BY CASE kind WHEN 'review' THEN 1 WHEN 'learn' THEN 2 WHEN 'interview' THEN 3 ELSE 4 END").all(date) as Record<string, unknown>[]).map(rowToTask);
}

/** Today includes unfinished carry-over work plus tasks actually completed today. */
export function listActiveDailyTasks(date = todayShanghai()) {
  const { start, end } = shanghaiDayBounds(date);
  return (sqlite.prepare("SELECT * FROM daily_tasks WHERE plan_date <= ? AND (status = 'todo' OR (status = 'done' AND completed_at >= ? AND completed_at < ?)) ORDER BY plan_date ASC, created_at ASC, id ASC").all(date, start, end) as Record<string, unknown>[]).map(rowToTask);
}

export function updateTask(id: string, status: "todo" | "done" | "skipped") {
  sqlite.prepare("UPDATE daily_tasks SET status = ?, completed_at = ? WHERE id = ?").run(status, status === "done" ? new Date().toISOString() : null, id);
  return sqlite.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(id);
}

/** A plan is progress, not a checkbox: completing the matching learning action completes its task. */
export function completeTodayTaskForCard(cardId: string, kind: "learn" | "review") {
  sqlite.prepare("UPDATE daily_tasks SET status = 'done', completed_at = ? WHERE plan_date <= ? AND card_id = ? AND kind = ? AND status = 'todo'")
    .run(new Date().toISOString(), todayShanghai(), cardId, kind);
}

export function calendarSummary(month: string) {
  const reports = dailyReportDates(month);
  return (sqlite.prepare(`SELECT plan_date as date, COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed, SUM(estimate_minutes) as minutes FROM daily_tasks WHERE plan_date LIKE ? GROUP BY plan_date`).all(`${month}%`) as Array<{ date: string; total: number; completed: number; minutes: number }>).map((day) => ({ ...day, hasReport: reports.has(day.date) }));
}

export function dashboardReviewCounts(now = new Date()) {
  const due = sqlite.prepare("SELECT COUNT(*) AS count FROM cards c JOIN review_state r ON r.card_id = c.id WHERE c.status = 'review' AND r.due_at <= ?").get(now.toISOString()) as { count: number };
  const { start, end } = shanghaiDayBounds();
  const reviewed = sqlite.prepare("SELECT COUNT(DISTINCT card_id) AS count FROM review_logs WHERE created_at >= ? AND created_at < ?").get(start, end) as { count: number };
  return { dueNow: Number(due.count), reviewedToday: Number(reviewed.count) };
}
