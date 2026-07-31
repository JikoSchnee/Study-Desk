import { beforeEach, describe, expect, it, vi } from "vitest";

const cards = vi.hoisted(() => ({ card: { id: "11111111-1111-4111-8111-111111111111", question: "什么是 RAG？" } as { id: string; question: string } | null }));
const ai = vi.hoisted(() => ({ configured: true, stream: vi.fn(), draft: vi.fn() }));

vi.mock("@/lib/cards", () => ({ getCard: (id: string) => cards.card?.id === id ? cards.card : null }));
vi.mock("@/lib/ai", () => ({
  hasRemoteModelConfig: () => ai.configured,
  streamLearningChatResponse: ai.stream,
  generateLearningChatCardDraft: ai.draft,
}));

import { POST } from "@/app/api/review/chat/route";

const cardId = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown) => new Request("http://localhost/api/review/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/review/chat", () => {
  beforeEach(() => { cards.card = { id: cardId, question: "什么是 RAG？" }; ai.configured = true; ai.stream.mockReset().mockResolvedValue(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("检索增强生成。")); controller.close(); } })); ai.draft.mockReset().mockResolvedValue({ question: "新卡", answerPoints: [{ content: "答案" }] }); });

  it("returns an assistant response for the current card", async () => {
    const response = await POST(request({ action: "chat", cardId, message: "解释一下", messages: [] }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("检索增强生成。");
  });

  it("requires a configured model service", async () => {
    ai.configured = false;
    const response = await POST(request({ action: "chat", cardId, message: "解释一下", messages: [] }));
    expect(response.status).toBe(409);
    expect((await response.json()).requiresConfiguration).toBe(true);
  });

  it("rejects a missing card and creates drafts from selected messages", async () => {
    const missing = await POST(request({ action: "chat", cardId: "22222222-2222-4222-8222-222222222222", message: "解释一下", messages: [] }));
    expect(missing.status).toBe(404);
    const response = await POST(request({ action: "draft", cardId, messages: [{ role: "assistant", content: "重排序用于精排。", cardId, question: "什么是 RAG？" }] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draft: { question: "新卡", answerPoints: [{ content: "答案" }] } });
  });
});
