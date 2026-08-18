import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ sqlite: { prepare: (sql: string) => ({ all: () => sql.includes("SELECT id FROM cards") ? [{ id: "card-1" }] : [], get: () => undefined, run: () => ({}) }), transaction: (operation: () => unknown) => operation } }));
vi.mock("@/lib/knowledge-bases", () => ({
  listKnowledgeBases: () => [{ id: "base-1", name: "系统设计", description: "架构题", cardCount: 1, createdAt: "now", updatedAt: "now" }],
  getKnowledgeBase: () => undefined, findKnowledgeBaseByName: () => undefined, createKnowledgeBase: vi.fn(),
}));
vi.mock("@/lib/cards", () => ({
  getCard: () => ({ id: "card-1", question: "如何限流？", questionVariants: [], relations: [], answer: "令牌桶", answerPoints: [{ id: "point-1", content: "使用令牌桶", hint: "令牌", note: "", role: "key" }], note: "", track: "系统设计", knowledgeBaseId: "base-1", knowledgeBase: { id: "base-1", name: "系统设计" }, tags: ["架构"], difficulty: 3, source: null, status: "review", createdAt: "now", updatedAt: "now" }),
  createCard: vi.fn(), updateCard: vi.fn(),
}));
vi.mock("@/lib/study-plans", () => ({ getStudyPlan: () => undefined, createStudyPlan: vi.fn() }));

import { exportKnowledgeBase, parseSharePackage } from "@/lib/sharing";

describe("share packages", () => {
  it("exports knowledge content without personal learning state", () => {
    const pkg = exportKnowledgeBase("base-1");
    expect(pkg.type).toBe("knowledge-base");
    expect(pkg.cards).toHaveLength(1);
    expect(pkg.cards[0]).toMatchObject({ question: "如何限流？", knowledgeBaseId: "base-1" });
    expect(JSON.stringify(pkg)).not.toMatch(/reviewLogs|review_state|response|dueAt/);
  });

  it("rejects unknown formats and versions", () => {
    expect(() => parseSharePackage({ format: "other", version: 1 })).toThrow("分享文件无效");
    expect(() => parseSharePackage({ format: "study-desk-share", version: 2 })).toThrow("分享文件无效");
  });
});

