import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const expected = process.env.STUDY_DESK_LOCAL_IPC_TOKEN;
    if (!expected || request.headers.get("x-study-desk-ipc") !== expected) return NextResponse.json({ error: "加密迁移文件只能由 Study Desk 桌面端导出。" }, { status: 403 });
    const { createBackup } = await import("@/lib/backup");
    return NextResponse.json(createBackup(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建备份。" }, { status: 500 });
  }
}
