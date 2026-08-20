import { NextResponse } from "next/server";
import { communityCatalog } from "@shared/community";

export async function GET() {
  return NextResponse.json({ knowledgeBases: communityCatalog }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
