import { NextResponse } from "next/server";
import { z } from "zod";
import { getComparisonProgress } from "@/lib/comparison-progress";

export async function GET(request: Request) {
  const jobId = z.string().min(1).safeParse(new URL(request.url).searchParams.get("jobId"));
  if (!jobId.success) return NextResponse.json({ error: "缺少比对任务标识" }, { status: 400 });
  return NextResponse.json({ progress: getComparisonProgress(jobId.data) });
}
