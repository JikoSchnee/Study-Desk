import { NextResponse } from "next/server";
import { z } from "zod";
import { importCards } from "@/lib/cards";
import { answerFromPoints, answerPointsFromText, hasCoreAnswerPoint } from "@/lib/import";

const questionVariantSchema = z.object({ id: z.string().min(1), content: z.string(), source: z.enum(["manual", "ai"]) });
const answerPointSchema = z.object({ id: z.string().min(1), content: z.string(), hint: z.string().optional().default(""), note: z.string().optional().default(""), role: z.enum(["opening", "key", "closing"]).optional().default("key") });
const importSchema = z.object({ cards: z.array(z.object({ question: z.string(), questionVariants: z.array(questionVariantSchema).default([]), answer: z.string().optional(), answerPoints: z.array(answerPointSchema).optional(), track: z.string().trim().min(1).default("Agent"), tags: z.array(z.string()).default([]), difficulty: z.number().int().min(1).max(5).default(3) })).min(1) });
export async function POST(request: Request) {
  const input = importSchema.parse(await request.json());
  const cards = input.cards.map((card) => {
    const answerPoints = card.answerPoints?.length ? card.answerPoints : answerPointsFromText(card.answer ?? "");
    return { ...card, answerPoints, answer: card.answer ?? answerFromPoints(answerPoints) };
  });
  if (cards.some((card) => !hasCoreAnswerPoint(card.answerPoints))) {
    return NextResponse.json({ error: "每张卡片至少需要一条核心答案要点。" }, { status: 400 });
  }
  const result = await importCards(cards);
  return NextResponse.json(result);
}
