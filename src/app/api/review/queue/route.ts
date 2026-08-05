import { NextResponse } from "next/server";
import { reviewQueueProgress } from "@/lib/review";
import { hasExtraInitialStudy } from "@/lib/planner";

export async function GET() {
  return NextResponse.json({ progress: reviewQueueProgress(), extraInitialStudyAvailable: hasExtraInitialStudy() });
}
