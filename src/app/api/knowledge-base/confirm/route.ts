import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmKnowledgeProposals } from "@/lib/knowledge-base";

export async function POST(request: Request) {
  const input = z.object({ ids: z.array(z.string().min(1)).min(1) }).parse(await request.json());
  const result = confirmKnowledgeProposals(input.ids);
  (await import("@/lib/auto-backup")).triggerAutoBackup();
  return NextResponse.json(result);
}
