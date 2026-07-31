import { NextResponse } from "next/server";
import { z } from "zod";
import { getCard, updateCardStatus } from "@/lib/cards";
import { evaluateAnswer } from "@/lib/ai";
import { submitReview } from "@/lib/review";
import { isCardQuestion } from "@/lib/question-variants";
import { getAppSettings } from "@/lib/settings";

const schema = z.object({ action: z.enum(["evaluate", "confirm"]), cardId: z.string().uuid(), presentedQuestion: z.string().min(3), answer: z.string().min(1), rating: z.enum(["again", "hard", "good", "easy"]).optional(), comparisonMode: z.enum(["embedding", "llm"]).optional(), comparisonProgressId: z.string().min(1).optional() });
export async function POST(request: Request) {
  const { action, cardId, presentedQuestion, answer, rating, comparisonMode, comparisonProgressId } = schema.parse(await request.json());
  const card = getCard(cardId);
  if (!card) return NextResponse.json({ error: "找不到卡片" }, { status: 404 });
  if (!isCardQuestion(card, presentedQuestion)) return NextResponse.json({ error: "本次问法不属于这张卡片" }, { status: 400 });
  const evaluation = await evaluateAnswer({ ...card, question: presentedQuestion }, answer, comparisonMode ?? getAppSettings().answerComparisonMode, comparisonProgressId);
  if (action === "evaluate") return NextResponse.json({ evaluation });
  if (!rating) return NextResponse.json({ error: "请选择记忆评级" }, { status: 400 });
  updateCardStatus(cardId, "review");
  const result = submitReview(cardId, answer, evaluation.score, evaluation.suggestedRating, rating, evaluation.comparison, presentedQuestion, evaluation.feedback);
  (await import("@/lib/auto-backup")).triggerAutoBackup();
  return NextResponse.json({ evaluation, ...result });
}
