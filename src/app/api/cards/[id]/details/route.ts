import { NextResponse } from "next/server";
import { getCard, listCards } from "@/lib/cards";
import { cardLearningDetails } from "@/lib/card-learning";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = getCard(id);
  if (!card) return NextResponse.json({ error: "找不到卡片。" }, { status: 404 });
  const relatedCards = listCards().filter((item) => card.relations.some((relation) => relation.cardId === item.id)).map((item) => ({ ...item, relationType: card.relations.find((relation) => relation.cardId === item.id)!.type }));
  return NextResponse.json({ card, relatedCards, learning: cardLearningDetails(id) });
}
