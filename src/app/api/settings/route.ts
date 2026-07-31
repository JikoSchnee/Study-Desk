import { NextResponse } from "next/server";
import { z } from "zod";
import { isNativeAddonError, localApiErrorResponse } from "@/lib/local-api-error";

export async function GET() {
  try {
    const [{ getEnvironmentSettings }, { getAppSettings }] = await Promise.all([import("@/lib/environment"), import("@/lib/settings")]);
    return NextResponse.json({ ...getAppSettings(), llmConfigured: getEnvironmentSettings().apiKeyConfigured });
  } catch (error) {
    return localApiErrorResponse("Failed to read settings", error, "无法读取设置。");
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
      knowledgeBasePath: z.string().trim().max(4096).default(""),
    }).parse(await request.json());
    const { saveAppSettings } = await import("@/lib/settings");
    return NextResponse.json(saveAppSettings(input));
  } catch (error) {
    if (isNativeAddonError(error)) return localApiErrorResponse("Failed to save settings", error, "无法保存设置。");
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存设置。" }, { status: 400 });
  }
}
export async function PATCH(request: Request) {
  try {
    const input = z.union([
      z.object({ embeddingModelSource: z.enum(["automatic", "offline"]) }),
      z.object({ knowledgeBasePath: z.string().trim().max(4096) }),
    ]).parse(await request.json());
    const { getAppSettings, saveEmbeddingModelSource, saveKnowledgeBasePath } = await import("@/lib/settings");
    if ("knowledgeBasePath" in input) return NextResponse.json({ ...getAppSettings(), knowledgeBasePath: saveKnowledgeBasePath(input.knowledgeBasePath) });
    const embeddingModelSource = saveEmbeddingModelSource(input.embeddingModelSource);
    if (embeddingModelSource === "offline") {
      const { stopLocalEmbeddingModelPrewarm } = await import("@/lib/answer-comparison");
      stopLocalEmbeddingModelPrewarm();
    }
    return NextResponse.json({ ...getAppSettings(), embeddingModelSource });
  } catch (error) {
    if (isNativeAddonError(error)) return localApiErrorResponse("Failed to save the embedding model source", error, "无法保存模型方案。");
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存模型方案。" }, { status: 400 });
  }
}
