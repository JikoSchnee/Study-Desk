import { NextResponse } from "next/server";
import { cardLearningSummaries } from "@/lib/card-learning";
import { listCards } from "@/lib/cards";
import { chooseRandomCard } from "@/lib/random-card";
import { pickPresentedQuestion } from "@/lib/question-variants";
import { activePlanCardIds } from "@/lib/study-plans";

export async function GET(request: Request) {
  const excluded = new URL(request.url).searchParams.getAll("exclude");
  const allowed = activePlanCardIds();
  const card = chooseRandomCard(listCards().filter((item) => allowed.has(item.id)), excluded);
  const learning = card ? cardLearningSummaries([card.id])[card.id] ?? null : null;
  return NextResponse.json({ card, learning, presentedQuestion: card ? pickPresentedQuestion(card) : null });
}
