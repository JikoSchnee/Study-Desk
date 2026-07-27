import { NextResponse } from "next/server";
import { z } from "zod";
import { generateQuestionVariants } from "@/lib/ai";

const schema = z.object({
  question: z.string().min(3),
  answerPoints: z.array(z.string().min(1)).min(1),
  existingQuestions: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const candidates = await generateQuestionVariants(
      input.question,
      input.answerPoints,
      [input.question, ...input.existingQuestions],
    );
    return NextResponse.json({ candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法生成问法。";
    return NextResponse.json(
      { error: message, requiresConfiguration: message.includes("请先在设置中配置模型服务") },
      { status: 400 },
    );
  }
}
