import { beforeEach, describe, expect, it, vi } from "vitest";

const review = vi.hoisted(() => ({ result: { card: null as { id: string; question: string } | null, dueCount: 0 } }));
const learning = vi.hoisted(() => ({ summaries: {} as Record<string, unknown> }));

vi.mock("@/lib/review", () => ({ nextDueReview: () => review.result }));
vi.mock("@/lib/card-learning", () => ({ cardLearningSummaries: () => learning.summaries }));
vi.mock("@/lib/question-variants", () => ({ pickPresentedQuestion: (card: { question: string }) => `变体：${card.question}` }));

import { GET } from "@/app/api/review/next/route";

describe("GET /api/review/next", () => {
  beforeEach(() => { review.result = { card: null, dueCount: 0 }; learning.summaries = {}; });

  it("returns an empty due queue without falling back to a learning card", async () => {
    const response = await GET();

    expect(await response.json()).toEqual({ card: null, learning: null, dueCount: 0, presentedQuestion: null });
  });

  it("returns the first due card, its question variant, and the queue count", async () => {
    const card = { id: "card-1", question: "什么是间隔复习？" };
    review.result = { card, dueCount: 3 };
    const summary = { cardId: card.id, fsrsDifficulty: 6.4 };
    learning.summaries = { [card.id]: summary };

    const response = await GET();

    expect(await response.json()).toEqual({ card, learning: summary, dueCount: 3, presentedQuestion: "变体：什么是间隔复习？" });
  });
});
