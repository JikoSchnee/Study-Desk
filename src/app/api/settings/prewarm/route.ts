import { NextResponse } from "next/server";
import { embedTexts } from "@/lib/answer-comparison";

export async function POST() {
  try {
    await embedTexts(["本地语义模型预热：八股训练台"]);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "本地模型预热失败。" }, { status: 500 }); }
}
