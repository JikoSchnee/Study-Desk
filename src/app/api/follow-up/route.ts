import { NextResponse } from "next/server";
import { z } from "zod";
import { getCard } from "@/lib/cards";
import { evaluateAnswer, generateFollowUpCardDraft, generateFollowUpQuestion, hasRemoteModelConfig } from "@/lib/ai";
import { activePlanCardIds } from "@/lib/study-plans";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), cardId: z.string().uuid(), answer: z.string().min(1), gaps: z.array(z.string()).default([]) }),
  z.object({ action: z.literal("evaluate"), cardId: z.string().uuid(), question: z.string().min(3), answer: z.string().min(1) }),
  z.object({ action: z.literal("draft"), cardId: z.string().uuid(), question: z.string().min(3), answer: z.string().optional().default(""), gaps: z.array(z.string()).default([]) }),
]);

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const card = getCard(input.cardId);
    if (!card) return NextResponse.json({ error: "找不到卡片" }, { status: 404 });
    if (!activePlanCardIds().has(input.cardId)) return NextResponse.json({ error: "这张卡片不属于当前计划书。" }, { status: 403 });
    if (!hasRemoteModelConfig()) return NextResponse.json({ error: "请先在设置中配置模型服务，再使用 AI 拓展追问。", requiresConfiguration: true }, { status: 409 });
    if (input.action === "generate") return NextResponse.json({ question: await generateFollowUpQuestion(card, input.answer, input.gaps) });
    if (input.action === "draft") return NextResponse.json({ draft: await generateFollowUpCardDraft(card, input.question, { answer: input.answer, gaps: input.gaps }) });
    return NextResponse.json({ evaluation: await evaluateAnswer({ ...card, question: input.question }, input.answer, "llm") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "暂时无法生成追问卡草稿。" }, { status: 400 });
  }
}
