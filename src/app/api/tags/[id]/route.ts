import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteTag, updateTag } from "@/lib/tags";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const tag = updateTag((await params).id, z.object({ chinese: z.string().optional(), english: z.string().optional() }).parse(await request.json())); return tag ? NextResponse.json({ tag }) : NextResponse.json({ error: "找不到标签。" }, { status: 404 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法更新标签。" }, { status: 400 }); }
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { return deleteTag((await params).id) ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "找不到标签。" }, { status: 404 }); }
