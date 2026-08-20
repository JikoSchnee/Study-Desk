import { NextResponse } from "next/server";
import { calendarSummary } from "@/lib/planner";
import { getDailyLearningReport } from "@/lib/daily-reports";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const month = params.get("month") ?? new Date().toISOString().slice(0, 7);
  const date = params.get("date");
  return NextResponse.json({ month, days: calendarSummary(month), ...(date ? { report: getDailyLearningReport(date) } : {}) });
}
