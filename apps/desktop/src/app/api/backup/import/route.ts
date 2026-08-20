import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ action: z.enum(["preview", "restore"]), backup: z.unknown(), mode: z.enum(["merge", "replace"]).optional() });
export async function POST(request: Request) {
  try {
    const expected = process.env.STUDY_DESK_LOCAL_IPC_TOKEN;
    if (!expected || request.headers.get("x-study-desk-ipc") !== expected) return NextResponse.json({ error: "迁移文件只能由 Study Desk 桌面端导入。" }, { status: 403 });
    // Keep SQLite startup failures inside the JSON API boundary for desktop
    // clients, rather than letting Next render an HTML error document.
    const { parseBackup, previewBackup, restoreBackup } = await import("@/lib/backup");
    const input = schema.parse(await request.json());
    const backup = parseBackup(input.backup);
    if (input.action === "preview") return NextResponse.json({ preview: previewBackup(backup) });
    if (!input.mode) return NextResponse.json({ error: "请选择恢复模式。" }, { status: 400 });
    const autoBackup = await import("@/lib/auto-backup");
    if (input.mode === "replace") {
      const safety = autoBackup.triggerAutoBackup(new Date(), true);
      if (safety.state !== "created") throw new Error("无法创建替换前的加密安全备份，已取消恢复。 ");
    }
    restoreBackup(backup, input.mode);
    const recovery = autoBackup.triggerAutoBackup(new Date(), true);
    return NextResponse.json({ ok: true, recoveryCreated: recovery.state === "created", backupWarning: recovery.state === "created" ? null : "数据已恢复，但无法创建新的加密恢复点。" });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法恢复备份。" }, { status: 400 }); }
}
