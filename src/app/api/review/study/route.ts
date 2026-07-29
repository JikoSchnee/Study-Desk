import { NextResponse } from "next/server";
import { z } from "zod";
import { completeInitialStudy } from "@/lib/review";

const schema = z.object({ cardId: z.string().uuid() });

/** Completes an unscored first-study session and schedules tomorrow's first recall. */
export async function POST(request: Request) {
  try {
    const { cardId } = schema.parse(await request.json());
    return NextResponse.json(await completeInitialStudy(cardId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法完成首次学习。" }, { status: 400 });
  }
}
