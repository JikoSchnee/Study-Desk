import { afterEach, describe, expect, it, vi } from "vitest";
import { generateQuestionVariants, parseGeneratedFollowUpCardDraft, parseGeneratedQuestionVariants } from "./ai";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AI question variant parsing", () => {
  it("accepts only unique non-empty strings and caps a generation at three", () => {
    const result = parseGeneratedQuestionVariants(
      JSON.stringify({ variants: ["另一种问法", "已有问法", "", 42, "第三种问法", "第四种问法", "第五种问法"] }),
      ["已有问法"],
    );
    expect(result.map((item) => item.content)).toEqual(["另一种问法", "第三种问法", "第四种问法"]);
    expect(result.every((item) => item.source === "ai" && item.id)).toBe(true);
  });

  it("rejects malformed model output", () => {
    expect(() => parseGeneratedQuestionVariants('{"answer":"wrong"}')).toThrow("模型没有返回问法列表");
    expect(() => parseGeneratedQuestionVariants("not-json")).toThrow();
  });

  it("explains missing model configuration without attempting a request", async () => {
    vi.stubEnv("LLM_BASE_URL", "");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LLM_MODEL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateQuestionVariants("什么是 RAG？", ["检索增强生成"], [])).rejects.toThrow("请先在设置中配置模型服务");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps provider failures actionable", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://model.example/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(generateQuestionVariants("什么是 RAG？", ["检索增强生成"], [])).rejects.toThrow("模型服务返回 503");
  });

  it("uses Anthropic's messages protocol for the Claude preset", async () => {
    vi.stubEnv("LLM_PROVIDER", "claude");
    vi.stubEnv("LLM_BASE_URL", "https://api.anthropic.com/v1");
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "claude-sonnet-4-20250514");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: "text", text: '{"variants":["请解释 RAG","RAG 如何工作？","RAG 的基本流程是什么？"]}' }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateQuestionVariants("什么是 RAG？", ["检索增强生成"], []);
    expect(result).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({ headers: expect.objectContaining({ "x-api-key": "test-key", "anthropic-version": "2023-06-01" }) }));
  });
});

describe("AI follow-up card drafts", () => {
  const card = {
    id: "source-card", question: "什么是 RAG？", questionVariants: [], relations: [], answer: "检索增强生成", answerPoints: [{ id: "p1", content: "检索外部知识", hint: "检索", note: "" }], note: "", track: "Agent", tags: ["RAG"], difficulty: 3, status: "learning", createdAt: "2026-01-01", updatedAt: "2026-01-01",
  } as const;

  it("keeps the generated follow-up as the question and maps source-parent to a child relation", () => {
    const draft = parseGeneratedFollowUpCardDraft(JSON.stringify({ answerPoints: [{ content: "重排序提升候选文档的相关性。", hint: "精排" }], questionVariants: ["为什么 RAG 需要精排？", "为什么 RAG 需要精排？"], note: "聚焦召回后的排序。", track: "Agent", tags: ["RAG", "重排序", "重排序"], relationToSource: "source_parent" }), card, "RAG 为什么需要重排序？");

    expect(draft.question).toBe("RAG 为什么需要重排序？");
    expect(draft.relationType).toBe("child");
    expect(draft.questionVariants.map((item) => item.content)).toEqual(["为什么 RAG 需要精排？"]);
    expect(draft.tags).toEqual(["RAG", "重排序"]);
  });

  it("falls back to a related relationship but rejects drafts without a core answer point", () => {
    const draft = parseGeneratedFollowUpCardDraft(JSON.stringify({ answerPoints: ["补充答案要点"], relationToSource: "unknown" }), card, "追问的主问题");
    expect(draft.relationType).toBe("related");
    expect(() => parseGeneratedFollowUpCardDraft(JSON.stringify({ answerPoints: [] }), card, "追问的主问题")).toThrow("核心答案要点");
  });
});
