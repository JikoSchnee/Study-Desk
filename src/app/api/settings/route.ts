import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnvironmentSettings } from "@/lib/environment";
import { getAppSettings, saveAppSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ ...getAppSettings(), llmConfigured: getEnvironmentSettings().apiKeyConfigured });
}
export async function PUT(request: Request) {
  const input = z.object({ dailyInitialTarget: z.number().int().min(0).max(100), dailyReviewTarget: z.number().int().min(0).max(200), answerComparisonMode: z.enum(["embedding", "llm"]).default("embedding") }).parse(await request.json());
  return NextResponse.json(saveAppSettings(input));
}
