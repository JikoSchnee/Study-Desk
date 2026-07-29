import { describe, expect, it } from "vitest";
import { difficultyTier, filterAndSortCards } from "@/lib/card-filters";
import type { Card, CardLearningSummary } from "@/lib/types";

const cards: Card[] = [
  { id: "a", question: "RAG 如何重排序？", questionVariants: [{ id: "a-v", content: "如何给检索结果排序", source: "manual" }], relations: [], answer: "通过 rerank 提高相关性", answerPoints: [{ id: "a-p", content: "重排序", hint: "二阶段", note: "面试重点" }], note: "准备例子", track: "Agent", tags: ["RAG", "检索"], difficulty: 3, status: "review", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" },
  { id: "b", question: "JVM GC", questionVariants: [], relations: [], answer: "分代回收", answerPoints: [{ id: "b-p", content: "分代", hint: "", note: "" }], note: "", track: "Java 后端", tags: ["JVM"], difficulty: 3, status: "review", createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
  { id: "legacy", question: "旧卡片", questionVariants: [], relations: [], answer: "旧答案", answerPoints: [{ id: "legacy-p", content: "旧内容", hint: "", note: "" }], note: "", track: "Agent", tags: ["旧"], difficulty: 1, status: "learning", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
];

const learning: Record<string, CardLearningSummary> = {
  a: { cardId: "a", initialStudyAt: "2026-01-01T00:00:00.000Z", nextReviewAt: "2026-01-10T00:00:00.000Z", lastReviewAt: "2026-01-09T00:00:00.000Z", practiceCount: 2, reviewCount: 1, hasInitialPractice: true, averageScore: 88, fsrsDifficulty: 6.4 },
  b: { cardId: "b", initialStudyAt: "2026-01-01T00:00:00.000Z", nextReviewAt: "2026-01-08T00:00:00.000Z", lastReviewAt: "2026-01-10T00:00:00.000Z", practiceCount: 1, reviewCount: 0, hasInitialPractice: true, averageScore: null, fsrsDifficulty: 2.8 },
};

describe("card filters", () => {
  it("maps FSRS difficulty boundaries into five visible tiers", () => {
    expect(difficultyTier(1)?.label).toBe("N");
    expect(difficultyTier(2.8)?.label).toBe("R");
    expect(difficultyTier(4.6)?.label).toBe("SR");
    expect(difficultyTier(6.4)?.label).toBe("SSR");
    expect(difficultyTier(8.2)?.label).toBe("UR");
    expect(difficultyTier(null)).toBeNull();
  });

  it("searches every card text field and combines track with any selected tag", () => {
    const result = filterAndSortCards(cards, learning, { query: "面试重点", track: "Agent", tags: new Set(["JVM", "RAG"]), sort: "updated", direction: "desc" });
    expect(result.map((card) => card.id)).toEqual(["a"]);
  });

  it("sorts time and FSRS difficulty with missing legacy values last", () => {
    expect(filterAndSortCards(cards, learning, { query: "", track: "", tags: new Set(), sort: "review", direction: "asc" }).map((card) => card.id)).toEqual(["b", "a", "legacy"]);
    expect(filterAndSortCards(cards, learning, { query: "", track: "", tags: new Set(), sort: "practice", direction: "desc" }).map((card) => card.id)).toEqual(["b", "a", "legacy"]);
    expect(filterAndSortCards(cards, learning, { query: "", track: "", tags: new Set(), sort: "difficulty", direction: "desc" }).map((card) => card.id)).toEqual(["a", "b", "legacy"]);
  });

  it("sorts matching cards by creation time in either direction", () => {
    const filters = { query: "", track: "Agent", tags: new Set(["RAG", "旧"]), sort: "created" as const };
    expect(filterAndSortCards(cards, learning, { ...filters, direction: "desc" }).map((card) => card.id)).toEqual(["a", "legacy"]);
    expect(filterAndSortCards(cards, learning, { ...filters, direction: "asc" }).map((card) => card.id)).toEqual(["legacy", "a"]);
  });
});
