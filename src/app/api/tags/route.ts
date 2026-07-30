import { NextResponse } from "next/server";
import { z } from "zod";
import { createTag, listTags } from "@/lib/tags";

export async function GET() { return NextResponse.json({ tags: listTags() }); }
export async function POST(request: Request) {
  try { return NextResponse.json({ tag: createTag(z.object({ chinese: z.string().optional(), english: z.string().optional() }).parse(await request.json())) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建标签。" }, { status: 400 }); }
}
