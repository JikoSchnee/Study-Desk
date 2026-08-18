import { NextResponse } from "next/server";
import { z } from "zod";
import { exportKnowledgeBase, exportStudyPlan, importSharePackage, previewShareImport } from "@/lib/sharing";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = z.enum(["knowledge-base", "study-plan"]).parse(url.searchParams.get("type"));
    const id = z.string().uuid().parse(url.searchParams.get("id"));
    return NextResponse.json(type === "knowledge-base" ? exportKnowledgeBase(id) : exportStudyPlan(id), { headers: { "Content-Disposition": `attachment; filename="study-desk-${type}.json"` } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法导出分享文件。" }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "preview") return NextResponse.json(previewShareImport(body.package));
    if (body.action === "import") {
      const summary = importSharePackage(body.package, body.knowledgeBaseResolutions ?? {}, body.cardResolutions ?? {});
      (await import("@/lib/auto-backup")).triggerAutoBackup();
      return NextResponse.json({ summary });
    }
    return NextResponse.json({ error: "不支持的分享操作。" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法处理分享文件。" }, { status: 400 }); }
}
