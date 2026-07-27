import { NextResponse } from "next/server";
import { listCards } from "@/lib/cards";
import { chooseRandomCard } from "@/lib/random-card";
import { pickPresentedQuestion } from "@/lib/question-variants";

export async function GET(request: Request) {
  const excluded = new URL(request.url).searchParams.getAll("exclude");
  const card = chooseRandomCard(listCards(), excluded);
  return NextResponse.json({ card, presentedQuestion: card ? pickPresentedQuestion(card) : null });
}
