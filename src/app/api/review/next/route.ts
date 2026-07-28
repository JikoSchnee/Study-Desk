import { NextResponse } from "next/server";
import { cardLearningSummaries } from "@/lib/card-learning";
import { nextDueReview } from "@/lib/review";
import { pickPresentedQuestion } from "@/lib/question-variants";

export async function GET() {
  const { card, dueCount } = nextDueReview();
  const learning = card ? cardLearningSummaries([card.id])[card.id] ?? null : null;
  return NextResponse.json({ card, learning, dueCount, presentedQuestion: card ? pickPresentedQuestion(card) : null });
}
