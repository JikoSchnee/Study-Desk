import { NextResponse } from "next/server";
import { getLocalEmbeddingModelStatus, restartLocalEmbeddingModelPrewarm, startLocalEmbeddingModelPrewarm } from "@/lib/answer-comparison";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getLocalEmbeddingModelStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({})) as { force?: unknown };
  if (input.force === true) await restartLocalEmbeddingModelPrewarm();
  else startLocalEmbeddingModelPrewarm();
  return NextResponse.json(await getLocalEmbeddingModelStatus(), { status: 202, headers: { "Cache-Control": "no-store" } });
}
