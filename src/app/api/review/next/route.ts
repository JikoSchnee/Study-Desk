import { NextResponse } from "next/server";
import { dueCards } from "@/lib/review";
import { listCards } from "@/lib/cards";
import { pickPresentedQuestion } from "@/lib/question-variants";

export async function GET() {
  const due = dueCards();
  const card = due[0] ?? listCards().find((item) => item.status === "learning") ?? null;
  return NextResponse.json({ card, presentedQuestion: card ? pickPresentedQuestion(card) : null });
}
