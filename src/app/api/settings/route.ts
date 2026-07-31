import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  try {
    const [{ getEnvironmentSettings }, { getAppSettings }] = await Promise.all([import("@/lib/environment"), import("@/lib/settings")]);
    return NextResponse.json({ ...getAppSettings(), llmConfigured: getEnvironmentSettings().apiKeyConfigured });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取设置。" }, { status: 500 });
  }
}
export async function PUT(request: Request) {
  try {
    const input = z.object({
      dailyInitialTarget: z.number().int().min(0).max(100),
      dailyReviewTarget: z.number().int().min(0).max(200),
      answerComparisonMode: z.enum(["embedding", "llm"]).default("embedding"),
      embeddingModelSource: z.enum(["automatic", "offline"]).default("automatic"),
      stabilityRarityPreset: z.enum(["fast", "memory-cycle", "long-term"]).default("memory-cycle"),
      tagDisplayLanguage: z.enum(["zh", "en", "both"]).default("zh"),
    }).parse(await request.json());
    const { saveAppSettings } = await import("@/lib/settings");
    return NextResponse.json(saveAppSettings(input));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存设置。" }, { status: 400 });
  }
}
export async function PATCH(request: Request) {
  try {
    const input = z.object({ embeddingModelSource: z.enum(["automatic", "offline"]) }).parse(await request.json());
    const { getAppSettings, saveEmbeddingModelSource } = await import("@/lib/settings");
    const embeddingModelSource = saveEmbeddingModelSource(input.embeddingModelSource);
    if (embeddingModelSource === "offline") {
      const { stopLocalEmbeddingModelPrewarm } = await import("@/lib/answer-comparison");
      stopLocalEmbeddingModelPrewarm();
    }
    return NextResponse.json({ ...getAppSettings(), embeddingModelSource });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存模型方案。" }, { status: 400 });
  }
}
