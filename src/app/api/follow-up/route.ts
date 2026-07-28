import { NextResponse } from "next/server";
import { z } from "zod";
import { getCard } from "@/lib/cards";
import { evaluateAnswer, generateFollowUpQuestion, hasRemoteModelConfig } from "@/lib/ai";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), cardId: z.string().uuid(), answer: z.string().min(1), gaps: z.array(z.string()).default([]) }),
  z.object({ action: z.literal("evaluate"), cardId: z.string().uuid(), question: z.string().min(3), answer: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const input = schema.parse(await request.json());
  const card = getCard(input.cardId);
  if (!card) return NextResponse.json({ error: "找不到卡片" }, { status: 404 });
  if (!hasRemoteModelConfig()) return NextResponse.json({ error: "请先在设置中配置模型服务，再使用 AI 拓展追问。", requiresConfiguration: true }, { status: 409 });
  if (input.action === "generate") return NextResponse.json({ question: await generateFollowUpQuestion(card, input.answer, input.gaps) });
  return NextResponse.json({ evaluation: await evaluateAnswer({ ...card, question: input.question }, input.answer, "llm") });
}
