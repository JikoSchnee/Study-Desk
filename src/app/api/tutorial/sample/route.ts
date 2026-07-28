import { NextResponse } from "next/server";
import { createTutorialCard } from "@/lib/cards";

export async function POST() {
  try { return NextResponse.json({ card: createTutorialCard() }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建演示卡。" }, { status: 500 }); }
}
