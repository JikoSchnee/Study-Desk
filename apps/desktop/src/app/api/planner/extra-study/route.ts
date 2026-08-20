import { NextResponse } from "next/server";
import { getCard } from "@/lib/cards";
import { addExtraInitialStudy } from "@/lib/planner";

export async function POST() {
  try {
    const task = addExtraInitialStudy();
    return NextResponse.json({ task, card: task?.cardId ? getCard(task.cardId) ?? null : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法加入加练题。" }, { status: 500 });
  }
}
