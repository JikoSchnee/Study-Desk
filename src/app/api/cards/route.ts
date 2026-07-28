import { NextResponse } from "next/server";
import { z } from "zod";
import { createCard, listCards, updateCard } from "@/lib/cards";
import { cardLearningSummaries } from "@/lib/card-learning";
import { answerFromPoints, answerPointsFromText, hasCoreAnswerPoint } from "@/lib/import";

const questionVariantSchema = z.object({ id: z.string().min(1), content: z.string(), source: z.enum(["manual", "ai"]) });
const answerPointSchema = z.object({ id: z.string().min(1), content: z.string(), hint: z.string().optional().default(""), note: z.string().optional().default(""), role: z.enum(["opening", "key", "closing"]).optional().default("key") });
const cardInputSchema = z.object({ question: z.string().min(3), questionVariants: z.array(questionVariantSchema).default([]), answer: z.string().optional(), answerPoints: z.array(answerPointSchema).optional(), note: z.string().optional().default(""), track: z.string().trim().min(1), tags: z.array(z.string()).default([]), difficulty: z.number().int().min(1).max(5).default(3), source: z.string().optional() });

function validateCard(value: z.infer<typeof cardInputSchema>, context: z.RefinementCtx) {
  const answerPoints = value.answerPoints?.length ? value.answerPoints : answerPointsFromText(value.answer ?? "");
  const answer = value.answer ?? answerFromPoints(answerPoints);
  if (answer.trim().length < 3 || !hasCoreAnswerPoint(answerPoints)) { context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 1, type: "array", inclusive: true, message: "请至少填写一条核心答案要点。", path: ["answerPoints"] }); return z.NEVER; }
  return { ...value, answerPoints, answer };
}

const cardSchema = cardInputSchema.transform(validateCard);
const updateCardSchema = cardInputSchema.extend({ id: z.string().uuid(), answerPoints: z.array(answerPointSchema).min(1) }).transform((value, context) => {
  const answer = answerFromPoints(value.answerPoints);
  if (answer.trim().length < 3 || !hasCoreAnswerPoint(value.answerPoints)) { context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 1, type: "array", inclusive: true, message: "请至少填写一条核心答案要点。", path: ["answerPoints"] }); return z.NEVER; }
  return { ...value, answer };
});

export async function GET() {
  const cards = listCards();
  return NextResponse.json({ cards, learning: cardLearningSummaries(cards.map((card) => card.id)) });
}
export async function POST(request: Request) {
  try {
    const input = cardSchema.parse(await request.json());
    const created = createCard(input);
    return NextResponse.json({ card: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存卡片。" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const input = updateCardSchema.parse(await request.json());
    const card = updateCard(input.id, input);
    if (!card) return NextResponse.json({ error: "找不到卡片。" }, { status: 404 });
    return NextResponse.json({ card });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法更新卡片。" }, { status: 400 });
  }
}
