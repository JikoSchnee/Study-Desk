import { NextResponse } from "next/server";
import { dashboardReviewCounts, ensureDailyPlan } from "@/lib/planner";
import { todayShanghai } from "@/lib/utils";

export async function GET() {
  try {
    const tasks = ensureDailyPlan();
    const reviewCounts = dashboardReviewCounts();
    return NextResponse.json({ date: todayShanghai(), tasks, totals: { dueReview: reviewCounts.dueNow, reviewedToday: reviewCounts.reviewedToday, completed: tasks.filter((task) => task.status === "done").length } });
  } catch (error) {
    console.error("Failed to load dashboard", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取今日计划。" }, { status: 500 });
  }
}
