import { describe, expect, it } from "vitest";
import {
  findQuestionCollision,
  isCardQuestion,
  normalizeQuestionVariants,
  pickPresentedQuestion,
  questionVariantsFromStored,
} from "./question-variants";

const variants = [
  { id: "manual-1", content: "  请解释一下 RAG  ", source: "manual" as const },
  { id: "ai-1", content: "RAG 是如何工作的？", source: "ai" as const },
  { id: "duplicate", content: "请解释一下 RAG", source: "ai" as const },
];

describe("question variants", () => {
  it("normalizes content, preserves provenance, and removes in-card duplicates", () => {
    expect(normalizeQuestionVariants("什么是 RAG？", variants)).toEqual([
      { id: "manual-1", content: "请解释一下 RAG", source: "manual" },
      { id: "ai-1", content: "RAG 是如何工作的？", source: "ai" },
    ]);
  });

  it("reads legacy rows safely and detects collisions across every wording", () => {
    expect(questionVariantsFromStored(undefined)).toEqual([]);
    expect(questionVariantsFromStored('[{"id":"one","content":"另一种问法","source":"ai"}]')).toEqual([
      { id: "one", content: "另一种问法", source: "ai" },
    ]);
    expect(findQuestionCollision("新主问题", variants, ["rag 是如何工作的？"])).toBe("RAG 是如何工作的？");
  });

  it("selects a stable pool member and validates submitted wording", () => {
    const card = { question: "主问题", questionVariants: normalizeQuestionVariants("主问题", variants) };
    expect(pickPresentedQuestion(card, 0)).toBe("主问题");
    expect(pickPresentedQuestion(card, 0.34)).toBe("请解释一下 RAG");
    expect(pickPresentedQuestion(card, 0.99)).toBe("RAG 是如何工作的？");
    expect(isCardQuestion(card, "  请解释一下 RAG ")).toBe(true);
    expect(isCardQuestion(card, "无关问题")).toBe(false);
  });
});
