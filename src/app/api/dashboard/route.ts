import { NextResponse } from "next/server";
import { localApiErrorResponse } from "@/lib/local-api-error";
import { todayShanghai } from "@/lib/utils";

export async function GET() {
  try {
    // Loading the SQLite-backed planner inside the handler keeps startup errors
    // within this JSON boundary. Otherwise Next renders an HTML error document,
    // which desktop clients cannot safely parse as an API response.
    const { dashboardReviewCounts, ensureDailyPlan } = await import("@/lib/planner");
    const tasks = ensureDailyPlan();
    const reviewCounts = dashboardReviewCounts();
    return NextResponse.json({ date: todayShanghai(), tasks, totals: { dueReview: reviewCounts.dueNow, reviewedToday: reviewCounts.reviewedToday, completed: tasks.filter((task) => task.status === "done").length } });
  } catch (error) {
    return localApiErrorResponse("Failed to load dashboard", error, "无法读取今日计划。");
  }
}
