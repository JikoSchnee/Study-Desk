import { describe, expect, it } from "vitest";
import { cacheReviewEvaluation, getCachedReviewEvaluation } from "@/lib/review-evaluation-cache";
import type { Evaluation } from "@/lib/types";

const input = {
  cardId: "00000000-0000-4000-8000-000000000001",
  presentedQuestion: "如何验证缓存结果？",
  answer: "使用相同的缓存令牌完成评级。",
  comparisonMode: "embedding" as const,
};

const evaluation: Evaluation = {
  score: 80,
  suggestedRating: "good",
  feedback: "回答覆盖了关键点。",
  gaps: [],
  comparison: { requestedMode: "embedding", source: "lexical", points: [] },
};

describe("review evaluation cache", () => {
  it("returns the previous evaluation only for the same submission", () => {
    const id = cacheReviewEvaluation({ ...input, evaluation });

    expect(getCachedReviewEvaluation(id, input)).toEqual(evaluation);
    expect(getCachedReviewEvaluation(id, { ...input, answer: "不同的回答" })).toBeNull();
  });
});
