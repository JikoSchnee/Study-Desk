import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ action: z.enum(["preview", "restore"]), backup: z.unknown(), mode: z.enum(["merge", "replace"]).optional() });
export async function POST(request: Request) {
  try {
    // Keep SQLite startup failures inside the JSON API boundary for desktop
    // clients, rather than letting Next render an HTML error document.
    const { parseBackup, previewBackup, restoreBackup } = await import("@/lib/backup");
    const input = schema.parse(await request.json());
    const backup = parseBackup(input.backup);
    if (input.action === "preview") return NextResponse.json({ preview: previewBackup(backup) });
    if (!input.mode) return NextResponse.json({ error: "请选择恢复模式。" }, { status: 400 });
    restoreBackup(backup, input.mode);
    (await import("@/lib/auto-backup")).triggerAutoBackup();
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法恢复备份。" }, { status: 400 }); }
}
