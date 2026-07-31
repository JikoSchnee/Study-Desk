import "server-only";
import { sqlite } from "@/lib/db";
import { rarityPreset, type StabilityRarityPreset } from "@/lib/card-tiers";
import type { AnswerComparisonMode, EmbeddingModelSource, TagDisplayLanguage } from "@/lib/types";

export type AppSettings = {
  dailyInitialTarget: number;
  dailyReviewTarget: number;
  answerComparisonMode: AnswerComparisonMode;
  embeddingModelSource: EmbeddingModelSource;
  stabilityRarityPreset: StabilityRarityPreset;
  tagDisplayLanguage: TagDisplayLanguage;
  knowledgeBasePath: string;
};

const defaults: AppSettings = { dailyInitialTarget: 5, dailyReviewTarget: 10, answerComparisonMode: "embedding", embeddingModelSource: "automatic", stabilityRarityPreset: "memory-cycle", tagDisplayLanguage: "zh", knowledgeBasePath: "" };

export function getAppSettings(): AppSettings {
  const rows = sqlite.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    // Keep existing installations usable while they migrate to count-based goals.
    dailyInitialTarget: Number(values.dailyInitialTarget) || defaults.dailyInitialTarget,
    dailyReviewTarget: Number(values.dailyReviewTarget) || defaults.dailyReviewTarget,
    answerComparisonMode: values.answerComparisonMode === "llm" ? "llm" : "embedding",
    embeddingModelSource: values.embeddingModelSource === "offline" ? "offline" : "automatic",
    stabilityRarityPreset: rarityPreset(values.stabilityRarityPreset),
    tagDisplayLanguage: values.tagDisplayLanguage === "en" || values.tagDisplayLanguage === "both" ? values.tagDisplayLanguage : "zh",
    knowledgeBasePath: values.knowledgeBasePath ?? defaults.knowledgeBasePath,
  };
}

export function saveAppSettings(input: AppSettings) {
  const statement = sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  statement.run("dailyInitialTarget", String(input.dailyInitialTarget));
  statement.run("dailyReviewTarget", String(input.dailyReviewTarget));
  statement.run("answerComparisonMode", input.answerComparisonMode);
  statement.run("embeddingModelSource", input.embeddingModelSource);
  statement.run("stabilityRarityPreset", input.stabilityRarityPreset);
  statement.run("tagDisplayLanguage", input.tagDisplayLanguage);
  statement.run("knowledgeBasePath", input.knowledgeBasePath);
  return input;
}

export function saveEmbeddingModelSource(embeddingModelSource: EmbeddingModelSource) {
  sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run("embeddingModelSource", embeddingModelSource);
  return embeddingModelSource;
}
