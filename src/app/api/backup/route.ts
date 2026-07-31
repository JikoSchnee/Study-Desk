import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { createBackup } = await import("@/lib/backup");
    return NextResponse.json(createBackup(), { headers: { "Content-Disposition": "attachment; filename=mock-interview-backup.json" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建备份。" }, { status: 500 });
  }
}
