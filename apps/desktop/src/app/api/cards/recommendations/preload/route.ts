import { NextResponse } from "next/server";
import { z } from "zod";
import { listCards } from "@/lib/cards";
import { preloadCardRecommendations } from "@/lib/semantic-recommendations";

const schema = z.object({ cardIds: z.array(z.string().uuid()).min(1).max(200) });

export async function POST(request: Request) {
  try {
    const { cardIds } = schema.parse(await request.json());
    return NextResponse.json({ recommendations: await preloadCardRecommendations(listCards(), [...new Set(cardIds)]) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "暂时无法预加载语义推荐。" }, { status: 400 });
  }
}
