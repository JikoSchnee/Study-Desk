import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import { shanghaiDayBounds, todayShanghai } from "@/lib/utils";
import { listCards } from "@/lib/cards";
import type { DailyTask } from "@/lib/types";

function rowToTask(row: Record<string, unknown>): DailyTask {
  return {
    id: row.id as string, planDate: row.plan_date as string, kind: row.kind as DailyTask["kind"], title: row.title as string,
    detail: row.detail as string | null, cardId: row.card_id as string | null, estimateMinutes: row.estimate_minutes as number, status: row.status as DailyTask["status"],
  };
}

export function ensureDailyPlan(date = todayShanghai(), budgetMinutes?: number) {
  const preference = sqlite.prepare("SELECT value FROM settings WHERE key = 'dailyMinutes'").get() as { value: string } | undefined;
  const resolvedBudget = budgetMinutes ?? Number(preference?.value ?? 30);
  const exists = sqlite.prepare("SELECT date FROM daily_plans WHERE date = ?").get(date);
  if (!exists) sqlite.prepare("INSERT INTO daily_plans (date, budget_minutes, created_at) VALUES (?, ?, ?)").run(date, resolvedBudget, new Date().toISOString());

  const existingTasks = listDailyTasks(date);
  const assignedCards = new Set(existingTasks.map((task) => task.cardId).filter(Boolean));
  let allocated = existingTasks.reduce((sum, task) => sum + task.estimateMinutes, 0);
  const now = new Date().toISOString();
  const insertTask = (kind: "review" | "learn" | "interview", title: string, cardId: string | null, estimate: number) => {
    sqlite.prepare("INSERT INTO daily_tasks (id, plan_date, kind, title, card_id, estimate_minutes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'todo', ?)")
      .run(randomUUID(), date, kind, title, cardId, estimate, now);
    allocated += estimate;
  };
  const dueRows = sqlite.prepare("SELECT c.id, c.question FROM cards c JOIN review_state r ON r.card_id = c.id WHERE c.status = 'review' AND r.due_at <= ? ORDER BY r.due_at ASC LIMIT 8").all(now) as Array<{ id: string; question: string }>;
  for (const card of dueRows) if (!assignedCards.has(card.id)) { insertTask("review", `复习：${card.question}`, card.id, 3); assignedCards.add(card.id); }
  const learning = listCards().filter((card) => card.status === "learning" && !assignedCards.has(card.id));
  for (const card of learning) {
    if (allocated + 5 > resolvedBudget || existingTasks.filter((task) => task.kind === "learn").length >= 5) break;
    insertTask("learn", `学习：${card.question}`, card.id, 5); assignedCards.add(card.id);
  }
  if (!existingTasks.some((task) => task.kind === "interview") && allocated <= resolvedBudget - 10) insertTask("interview", "完成 10 分钟迷你模拟", null, 10);
  return listDailyTasks(date);
}

export function listDailyTasks(date = todayShanghai()) {
  return (sqlite.prepare("SELECT * FROM daily_tasks WHERE plan_date = ? ORDER BY CASE kind WHEN 'review' THEN 1 WHEN 'learn' THEN 2 WHEN 'interview' THEN 3 ELSE 4 END").all(date) as Record<string, unknown>[]).map(rowToTask);
}

export function updateTask(id: string, status: "todo" | "done" | "skipped") {
  sqlite.prepare("UPDATE daily_tasks SET status = ? WHERE id = ?").run(status, id);
  return sqlite.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(id);
}

export function calendarSummary(month: string) {
  return sqlite.prepare(`SELECT plan_date as date, COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed, SUM(estimate_minutes) as minutes FROM daily_tasks WHERE plan_date LIKE ? GROUP BY plan_date`).all(`${month}%`);
}

export function dashboardReviewCounts(now = new Date()) {
  const due = sqlite.prepare("SELECT COUNT(*) AS count FROM cards c JOIN review_state r ON r.card_id = c.id WHERE c.status = 'review' AND r.due_at <= ?").get(now.toISOString()) as { count: number };
  const { start, end } = shanghaiDayBounds();
  const reviewed = sqlite.prepare("SELECT COUNT(DISTINCT card_id) AS count FROM review_logs WHERE created_at >= ? AND created_at < ?").get(start, end) as { count: number };
  return { dueNow: Number(due.count), reviewedToday: Number(reviewed.count) };
}
