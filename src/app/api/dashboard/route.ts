import { NextResponse } from "next/server";
import { dashboardReviewCounts, ensureDailyPlan } from "@/lib/planner";
import { todayShanghai } from "@/lib/utils";

export async function GET() {
  const tasks = ensureDailyPlan();
  const reviewCounts = dashboardReviewCounts();
  return NextResponse.json({ date: todayShanghai(), tasks, totals: { dueReview: reviewCounts.dueNow, reviewedToday: reviewCounts.reviewedToday, completed: tasks.filter((task) => task.status === "done").length } });
}
