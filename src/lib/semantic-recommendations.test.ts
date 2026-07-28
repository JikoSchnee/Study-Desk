import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/answer-comparison", () => ({
  embedTexts: vi.fn(async (values: string[]) => values.map((value) => value.includes("RAG") ? [1, 0] : [0, 1])),
  cosineSimilarity: (left: number[], right: number[]) => left[0] * right[0] + left[1] * right[1],
}));

import { recommendCardMetadata, recommendationText } from "./semantic-recommendations";
import type { Card } from "./types";

const card = (id: string, question: string, tags: string[]): Card => ({ id, question, questionVariants: [], relations: [], answer: question, answerPoints: [{ id: `${id}-point`, content: question, hint: "", note: "" }], note: "", track: "Agent", tags, difficulty: 3, status: "learning", createdAt: id, updatedAt: id });

describe("semantic metadata recommendations", () => {
  it("retrieves related cards and aggregates their unselected tags", async () => {
    const result = await recommendCardMetadata({ question: "RAG 为什么要重排序？", questionVariants: [], answerPoints: [{ id: "draft", content: "提升检索相关性", hint: "", note: "" }], note: "面试重点", track: "Agent", tags: ["RAG"] }, [card("rag", "RAG 的重排序作用", ["RAG", "检索", "排序"]), card("jvm", "JVM 垃圾回收", ["JVM"])]);
    expect(result.relatedCards).toEqual([{ cardId: "rag", question: "RAG 的重排序作用", track: "Agent", score: 100 }]);
    expect(result.tags).toEqual(expect.arrayContaining(["检索", "排序"]));
  });

  it("uses every card field as semantic recommendation input", () => {
    expect(recommendationText({ question: "主问题", questionVariants: [{ id: "variant", content: "其他问法", source: "manual" }], answerPoints: [{ id: "point", content: "答案要点", hint: "", note: "" }], note: "备注", track: "Agent", tags: ["标签"] })).toContain("答案要点");
  });
});
