import { NextResponse } from "next/server";
import { z } from "zod";
import { getCard } from "@/lib/cards";
import { generateLearningChatCardDraft, hasRemoteModelConfig, streamLearningChatResponse, type LearningChatMessage } from "@/lib/ai";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
  cardId: z.string().uuid(),
  question: z.string().trim().min(1).max(1_000),
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("chat"), cardId: z.string().uuid(), message: z.string().trim().min(1).max(4_000), messages: z.array(messageSchema).max(30).default([]) }),
  z.object({ action: z.literal("draft"), cardId: z.string().uuid(), messages: z.array(messageSchema).min(1).max(30) }),
]);

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const card = getCard(input.cardId);
    if (!card) return NextResponse.json({ error: "找不到当前卡片。" }, { status: 404 });
    if (!hasRemoteModelConfig()) return NextResponse.json({ error: "请先在设置中配置模型服务，再使用学习助手。", requiresConfiguration: true }, { status: 409 });
    const messages = input.messages as LearningChatMessage[];
    if (input.action === "chat") return new Response(await streamLearningChatResponse(card, messages, input.message), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
    return NextResponse.json({ draft: await generateLearningChatCardDraft(card, messages) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "学习助手暂时不可用。" }, { status: 400 });
  }
}
