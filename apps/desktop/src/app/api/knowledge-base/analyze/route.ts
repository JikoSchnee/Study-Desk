import { NextResponse } from "next/server";
import { refreshKnowledgeProposals } from "@/lib/knowledge-base";
import { listCards } from "@/lib/cards";

export async function GET() {
  const proposals = refreshKnowledgeProposals(listCards());
  (await import("@/lib/auto-backup")).triggerAutoBackup();
  return NextResponse.json({ proposals });
}
