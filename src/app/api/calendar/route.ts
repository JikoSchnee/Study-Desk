import { NextResponse } from "next/server";
import { calendarSummary } from "@/lib/planner";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  return NextResponse.json({ month, days: calendarSummary(month) });
}
