import { beforeEach, describe, expect, it, vi } from "vitest";

const review = vi.hoisted(() => ({
  result: {
    card: null as { id: string; question: string } | null,
    pending: 0,
    progress: { initial: { pending: 1, completedToday: 0 }, review: { pending: 0, completedToday: 2 } },
  },
}));
const learning = vi.hoisted(() => ({ summaries: {} as Record<string, unknown> }));

vi.mock("@/lib/review", () => ({ nextReviewCard: () => review.result }));
vi.mock("@/lib/card-learning", () => ({ cardLearningSummaries: () => learning.summaries }));
vi.mock("@/lib/question-variants", () => ({ pickPresentedQuestion: (card: { question: string }) => `变体：${card.question}` }));

import { GET } from "@/app/api/review/next/route";

const request = (queue: "initial" | "review") => new Request(`http://localhost/api/review/next?queue=${queue}`);

describe("GET /api/review/next", () => {
  beforeEach(() => { review.result = { card: null, pending: 0, progress: { initial: { pending: 1, completedToday: 0 }, review: { pending: 0, completedToday: 2 } } }; learning.summaries = {}; });

  it("requires a queue selection", async () => {
    const response = await GET(new Request("http://localhost/api/review/next"));

    expect(response.status).toBe(400);
  });

  it("returns an empty selected queue with its progress", async () => {
    const response = await GET(request("review"));

    expect(await response.json()).toEqual({ card: null, learning: null, pending: 0, progress: review.result.progress, presentedQuestion: null });
  });

  it("returns the selected queue card, learning summary, and progress", async () => {
    const card = { id: "card-1", question: "什么是间隔复习？" };
    review.result = { card, pending: 3, progress: { initial: { pending: 1, completedToday: 0 }, review: { pending: 3, completedToday: 2 } } };
    const summary = { cardId: card.id, fsrsDifficulty: 6.4 };
    learning.summaries = { [card.id]: summary };

    const response = await GET(request("initial"));

    expect(await response.json()).toEqual({ card, learning: summary, pending: 3, progress: review.result.progress, presentedQuestion: "变体：什么是间隔复习？" });
  });
});
