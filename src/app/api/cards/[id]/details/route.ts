import { NextResponse } from "next/server";
import { getCard } from "@/lib/cards";
import { cardLearningDetails } from "@/lib/card-learning";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = getCard(id);
  if (!card) return NextResponse.json({ error: "找不到卡片。" }, { status: 404 });
  return NextResponse.json({ card, learning: cardLearningDetails(id) });
}
