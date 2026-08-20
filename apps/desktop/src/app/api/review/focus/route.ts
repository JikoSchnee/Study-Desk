import { NextResponse } from "next/server";
import { z } from "zod";
import { getCard } from "@/lib/cards";
import { setPriorityPractice, setWeakPractice } from "@/lib/practice-focus";
import { activePlanCardIds } from "@/lib/study-plans";

const schema = z.object({ cardId: z.string().uuid(), action: z.enum(["weak", "priority", "removeWeak"]), gaps: z.array(z.string()).default([]) });

export async function POST(request: Request) {
  const input = schema.parse(await request.json());
  if (!getCard(input.cardId)) return NextResponse.json({ error: "找不到卡片" }, { status: 404 });
  if (!activePlanCardIds().has(input.cardId)) return NextResponse.json({ error: "这张卡片不属于当前计划书。" }, { status: 403 });
  if (input.action === "weak") setWeakPractice(input.cardId, true, input.gaps.join("、"));
  if (input.action === "priority") setPriorityPractice(input.cardId, true);
  if (input.action === "removeWeak") setWeakPractice(input.cardId, false);
  (await import("@/lib/auto-backup")).triggerAutoBackup();
  return NextResponse.json({ ok: true });
}
