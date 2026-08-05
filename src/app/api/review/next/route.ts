import { NextResponse } from "next/server";
import { cardLearningSummaries } from "@/lib/card-learning";
import { nextReviewCard, type ReviewQueueKind } from "@/lib/review";
import { pickPresentedQuestion } from "@/lib/question-variants";
import { hasExtraInitialStudy } from "@/lib/planner";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const queue = params.get("queue");
  if (queue !== "initial" && queue !== "review" && queue !== "weak") return NextResponse.json({ error: "请选择练习队列。" }, { status: 400 });
  const { card, pending, progress } = nextReviewCard(queue as ReviewQueueKind, params.get("cardId"));
  const learning = card ? cardLearningSummaries([card.id])[card.id] ?? null : null;
  return NextResponse.json({ card, learning, pending, progress, extraInitialStudyAvailable: hasExtraInitialStudy(), presentedQuestion: card ? pickPresentedQuestion(card) : null });
}
