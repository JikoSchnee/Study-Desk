import { NextResponse } from "next/server";
import { refreshKnowledgeProposals } from "@/lib/knowledge-base";
import { listCards } from "@/lib/cards";

export async function GET() { return NextResponse.json({ proposals: refreshKnowledgeProposals(listCards()) }); }
