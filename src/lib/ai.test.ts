import { afterEach, describe, expect, it, vi } from "vitest";
import { generateQuestionVariants, parseGeneratedQuestionVariants } from "./ai";

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
