import { NextResponse } from "next/server";
import { z } from "zod";
import { importCards } from "@/lib/cards";
import { answerFromPoints } from "@/lib/import";
import { recordInitialReview } from "@/lib/review";

const questionVariantSchema = z.object({ id: z.string().min(1), content: z.string(), source: z.enum(["manual", "ai"]) });
const answerPointSchema = z.object({ id: z.string().min(1), content: z.string(), hint: z.string().optional().default(""), note: z.string().optional().default("") });
const importSchema = z.object({ cards: z.array(z.object({ question: z.string(), questionVariants: z.array(questionVariantSchema).default([]), answer: z.string().optional(), answerPoints: z.array(answerPointSchema).optional(), track: z.string().trim().min(1).default("Agent"), tags: z.array(z.string()).default([]), difficulty: z.number().int().min(1).max(5).default(3) })).min(1) });
export async function POST(request: Request) {
  const input = importSchema.parse(await request.json());
  const cards = input.cards.map((card) => ({ ...card, answer: card.answer ?? answerFromPoints(card.answerPoints ?? []) }));
  const result = importCards(cards);
  return NextResponse.json({ ...result, accepted: result.accepted.map((card) => recordInitialReview(card.id).card ?? card) });
}
