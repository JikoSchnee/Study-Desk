import { NextResponse } from "next/server";
import { reviewQueueProgress } from "@/lib/review";

export async function GET() {
  return NextResponse.json({ progress: reviewQueueProgress() });
}
