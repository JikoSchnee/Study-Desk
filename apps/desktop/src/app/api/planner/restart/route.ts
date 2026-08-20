import { NextResponse } from "next/server";
import { restartDailyPlan } from "@/lib/planner";

export async function POST() {
  try {
    const tasks = restartDailyPlan();
    (await import("@/lib/auto-backup")).triggerAutoBackup();
    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法重启今天的计划。" }, { status: 500 });
  }
}
