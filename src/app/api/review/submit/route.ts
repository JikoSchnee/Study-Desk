import { NextResponse } from "next/server";
import { z } from "zod";
import { getCard, updateCardStatus } from "@/lib/cards";
import { evaluateAnswer } from "@/lib/ai";
import { submitReview } from "@/lib/review";
import { isCardQuestion } from "@/lib/question-variants";
import { getAppSettings } from "@/lib/settings";
import { cacheReviewEvaluation, getCachedReviewEvaluation } from "@/lib/review-evaluation-cache";
import { scheduleAutoBackup } from "@/lib/schedule-auto-backup";
import { activePlanCardIds } from "@/lib/study-plans";

const schema = z.object({ action: z.enum(["evaluate", "confirm"]), cardId: z.string().uuid(), presentedQuestion: z.string().min(3), answer: z.string().min(1), rating: z.enum(["again", "hard", "good", "easy"]).optional(), comparisonMode: z.enum(["embedding", "llm"]).optional(), comparisonProgressId: z.string().min(1).optional(), evaluationId: z.string().uuid().optional() });
export async function POST(request: Request) {
  const { action, cardId, presentedQuestion, answer, rating, comparisonMode, comparisonProgressId, evaluationId } = schema.parse(await request.json());
  const card = getCard(cardId);
  if (!card) return NextResponse.json({ error: "找不到卡片" }, { status: 404 });
  if (!activePlanCardIds().has(cardId)) return NextResponse.json({ error: "这张卡片不属于当前计划书。" }, { status: 403 });
  if (!isCardQuestion(card, presentedQuestion)) return NextResponse.json({ error: "本次问法不属于这张卡片" }, { status: 400 });
  const resolvedComparisonMode = comparisonMode ?? getAppSettings().answerComparisonMode;
  if (action === "evaluate") {
    const evaluation = await evaluateAnswer({ ...card, question: presentedQuestion }, answer, resolvedComparisonMode, comparisonProgressId);
    const nextEvaluationId = cacheReviewEvaluation({ evaluation, cardId, presentedQuestion, answer, comparisonMode: resolvedComparisonMode });
    return NextResponse.json({ evaluation, evaluationId: nextEvaluationId });
  }
  if (!rating) return NextResponse.json({ error: "请选择记忆评级" }, { status: 400 });
  const evaluation = getCachedReviewEvaluation(evaluationId, { cardId, presentedQuestion, answer, comparisonMode: resolvedComparisonMode });
  if (!evaluation) return NextResponse.json({ error: "本次评估已过期，请重新提交回答。", evaluationExpired: true }, { status: 409 });
  updateCardStatus(cardId, "review");
  const result = submitReview(cardId, answer, evaluation.score, evaluation.suggestedRating, rating, evaluation.comparison, presentedQuestion, evaluation.feedback);
  scheduleAutoBackup();
  return NextResponse.json({ evaluation, ...result });
}
