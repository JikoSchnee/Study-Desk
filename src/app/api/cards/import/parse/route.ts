import { NextResponse } from "next/server";
import { z } from "zod";
import { listCards } from "@/lib/cards";
import { inspectWorkbook, previewWorkbook } from "@/lib/import-parser";

const mappingSchema = z.object({ question: z.string(), variants: z.string().default(""), opening: z.string().default(""), answer: z.string(), hint: z.string(), closing: z.string().default(""), track: z.string(), tags: z.string(), difficulty: z.string() });

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择一个文件。" }, { status: 400 });
    if (form.get("phase") === "inspect") return NextResponse.json(await inspectWorkbook(file));
    const sheetName = z.string().min(1).parse(form.get("sheetName"));
    const mapping = mappingSchema.parse(JSON.parse(z.string().parse(form.get("mapping"))));
    return NextResponse.json(await previewWorkbook(file, sheetName, mapping, listCards()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法解析该文件。" }, { status: 400 });
  }
}
