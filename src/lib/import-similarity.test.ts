import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/answer-comparison", () => ({
  embedTexts: vi.fn(async (values: string[]) => values.map((value) => value.includes("重排序") ? [1, 0] : [0, 1])),
  cosineSimilarity: (left: number[], right: number[]) => left[0] * right[0] + left[1] * right[1],
}));

import { findSimilarImportQuestions } from "./import-similarity";
import type { Card } from "./types";

const card = (question: string): Card => ({
  id: "existing-rerank",
  question,
  questionVariants: [],
  answer: "通过重排序提高相关性",
  answerPoints: [],
  note: "",
  track: "Agent",
  tags: [],
  difficulty: 3,
  source: null,
  status: "learning",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("import semantic duplicate retrieval", () => {
  it("marks an incoming semantic match with its library source", async () => {
    const matches = await findSimilarImportQuestions([{ question: "为什么 RAG 要做重排序？" }], [card("RAG 的重排序有什么作用？")]);
    expect(matches.get(0)).toMatchObject({ question: "RAG 的重排序有什么作用？", cardId: "existing-rerank", source: "library", score: 1 });
  });

  it("checks later rows against earlier rows in the same import", async () => {
    const matches = await findSimilarImportQuestions([{ question: "重排序的用途是什么？" }, { question: "RAG 重排序为什么重要？" }], []);
    expect(matches.get(1)).toMatchObject({ question: "重排序的用途是什么？", source: "import", score: 1 });
    expect(matches.has(0)).toBe(false);
  });
});
