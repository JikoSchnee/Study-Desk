import { describe, expect, it } from "vitest";
import { rankRelatedCardOptions } from "@/lib/related-card-options";
import type { Card } from "@/lib/types";

const card = (id: string, question: string, track = "Agent", tags: string[] = []): Card => ({ id, question, questionVariants: [], relations: [], answer: "", answerPoints: [], note: "", track, tags, difficulty: 3, status: "learning", createdAt: "2026-01-01", updatedAt: "2026-01-01" });

describe("related card options", () => {
  it("puts semantic matches first by score and keeps each card only once", () => {
    const cards = [card("plain", "普通问题"), card("lower", "较低相关问题"), card("higher", "较高相关问题")];
    const result = rankRelatedCardOptions(cards, "", [{ cardId: "lower", score: 58 }, { cardId: "higher", score: 82 }]);
    expect(result.map(({ card }) => card.id)).toEqual(["higher", "lower", "plain"]);
    expect(result.map(({ score }) => score)).toEqual([82, 58, undefined]);
  });

  it("filters before ranking so only search matches are displayed", () => {
    const cards = [card("agent", "Agent 协作模式", "Agent", ["协作"]), card("rag", "RAG 重排序", "检索", ["RAG"]), card("plain", "普通问题")];
    const result = rankRelatedCardOptions(cards, "rag", [{ cardId: "agent", score: 95 }, { cardId: "rag", score: 58 }]);
    expect(result.map(({ card }) => card.id)).toEqual(["rag"]);
    expect(result[0]?.score).toBe(58);
  });
});
