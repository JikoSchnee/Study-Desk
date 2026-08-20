import { NextResponse } from "next/server";
import { z } from "zod";
import { completeKnowledgeProposal } from "@/lib/knowledge-base";

export async function POST(request: Request) {
  try {
    const input = z.object({ id: z.string().min(1) }).parse(await request.json());
    const result = completeKnowledgeProposal(input.id);
    (await import("@/lib/auto-backup")).triggerAutoBackup();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "状态更新失败" }, { status: 409 });
  }
}
