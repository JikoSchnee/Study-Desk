import { describe, expect, it } from "vitest";
import { answerFromPoints, answerPointsFromStored, answerPointsFromText, answerPointsToJson, hasCoreAnswerPoint, normalizeAnswerPoints, previewImport, splitTags } from "./import";

describe("previewImport", () => {
  it("rejects repeated questions without discarding valid cards", () => {
    const result = previewImport([
      { question: "什么是 RAG？", answer: "检索增强生成", track: "Agent", tags: ["RAG"], difficulty: 2 },
      { question: "什么是 RAG？", answer: "重复", track: "Agent", tags: [], difficulty: 2 },
      { question: "", answer: "空问题", track: "Agent", tags: [], difficulty: 2 },
    ], ["什么是 Agent？"]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });
});

describe("card import normalization", () => {
  it("turns multi-line answers and common tag separators into readable fields", () => {
    expect(answerPointsFromText("定义\n- 原理\n• 场景", "概念\n机制")).toMatchObject([{ content: "定义", hint: "概念" }, { content: "原理", hint: "机制" }, { content: "场景", hint: "" }]);
    expect(splitTags("RAG，检索|评估, Agent")).toEqual(["RAG", "检索", "评估", "Agent"]);
    expect(splitTags("RAG, rag, 检索, 检索")).toEqual(["RAG", "检索"]);
  });

  it("keeps stored hints and safely falls back for legacy or malformed cards", () => {
    const stored = answerPointsToJson([{ id: "first", content: "检索候选", hint: "先想覆盖率", note: "补一个业务案例" }, { id: "second", content: "重排序", hint: "再想相关性", note: "" }]);
    expect(answerPointsFromStored(stored, "ignored")).toMatchObject([{ content: "检索候选", hint: "先想覆盖率", note: "补一个业务案例" }, { content: "重排序", hint: "再想相关性", note: "" }]);
    expect(answerPointsFromStored('[{"id":"legacy","content":"旧版要点","hint":"旧提示"}]', "ignored")).toMatchObject([{ content: "旧版要点", hint: "旧提示", note: "" }]);
    expect(answerPointsFromStored("not-json", "旧答案\n第二行")).toMatchObject([{ content: "旧答案", hint: "", note: "" }, { content: "第二行", hint: "", note: "" }]);
  });

  it("keeps a total-summary answer in canonical order while legacy points remain core points", () => {
    const points = normalizeAnswerPoints([
      { id: "closing", content: "最后回扣边界", hint: "ignored", note: "ignored", role: "closing" },
      { id: "key", content: "说明关键机制", hint: "机制", note: "", role: "key" },
      { id: "opening", content: "先给出总框架", hint: "ignored", note: "ignored", role: "opening" },
    ]);
    expect(points.map((point) => point.role)).toEqual(["opening", "key", "closing"]);
    expect(answerFromPoints(points)).toBe("先给出总框架\n说明关键机制\n最后回扣边界");
    expect(answerPointsFromStored('[{"id":"legacy","content":"旧版要点"}]', "")[0].role).toBe("key");
    expect(hasCoreAnswerPoint(points)).toBe(true);
    expect(hasCoreAnswerPoint(points.filter((point) => point.role !== "key"))).toBe(false);
  });
});
