import "server-only";
import { sqlite } from "@/lib/db";
import type { AnswerComparisonMode } from "@/lib/types";

export type AppSettings = {
  dailyMinutes: number;
  weeklyInterviews: number;
  answerComparisonMode: AnswerComparisonMode;
};

const defaults: AppSettings = { dailyMinutes: 30, weeklyInterviews: 2, answerComparisonMode: "embedding" };

export function getAppSettings(): AppSettings {
  const rows = sqlite.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    dailyMinutes: Number(values.dailyMinutes) || defaults.dailyMinutes,
    weeklyInterviews: Number(values.weeklyInterviews) || defaults.weeklyInterviews,
    answerComparisonMode: values.answerComparisonMode === "llm" ? "llm" : "embedding",
  };
}

export function saveAppSettings(input: AppSettings) {
  const statement = sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  statement.run("dailyMinutes", String(input.dailyMinutes));
  statement.run("weeklyInterviews", String(input.weeklyInterviews));
  statement.run("answerComparisonMode", input.answerComparisonMode);
  return input;
}
