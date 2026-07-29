import "server-only";
import { sqlite } from "@/lib/db";
import { rarityPreset, type StabilityRarityPreset } from "@/lib/card-tiers";
import type { AnswerComparisonMode } from "@/lib/types";

export type AppSettings = {
  dailyInitialTarget: number;
  dailyReviewTarget: number;
  answerComparisonMode: AnswerComparisonMode;
  stabilityRarityPreset: StabilityRarityPreset;
};

const defaults: AppSettings = { dailyInitialTarget: 5, dailyReviewTarget: 10, answerComparisonMode: "embedding", stabilityRarityPreset: "memory-cycle" };

export function getAppSettings(): AppSettings {
  const rows = sqlite.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    // Keep existing installations usable while they migrate to count-based goals.
    dailyInitialTarget: Number(values.dailyInitialTarget) || defaults.dailyInitialTarget,
    dailyReviewTarget: Number(values.dailyReviewTarget) || defaults.dailyReviewTarget,
    answerComparisonMode: values.answerComparisonMode === "llm" ? "llm" : "embedding",
    stabilityRarityPreset: rarityPreset(values.stabilityRarityPreset),
  };
}

export function saveAppSettings(input: AppSettings) {
  const statement = sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  statement.run("dailyInitialTarget", String(input.dailyInitialTarget));
  statement.run("dailyReviewTarget", String(input.dailyReviewTarget));
  statement.run("answerComparisonMode", input.answerComparisonMode);
  statement.run("stabilityRarityPreset", input.stabilityRarityPreset);
  return input;
}
