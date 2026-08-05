import { NextResponse } from "next/server";
import { z } from "zod";
import { isNativeAddonError, localApiErrorResponse } from "@/lib/local-api-error";

export async function GET() {
  try {
    const [{ getEnvironmentSettings }, { getAppSettings }, { getAutoBackupStatus }] = await Promise.all([import("@/lib/environment"), import("@/lib/settings"), import("@/lib/auto-backup")]);
    return NextResponse.json({ ...getAppSettings(), autoBackupStatus: getAutoBackupStatus(), llmConfigured: getEnvironmentSettings().apiKeyConfigured });
  } catch (error) {
    return localApiErrorResponse("Failed to read settings", error, "无法读取设置。");
  }
}
export async function PUT(request: Request) {
  try {
    const input = z.object({
      dailyInitialTarget: z.number().int().min(0).max(100),
      dailyReviewTarget: z.number().int().min(0).max(200),
      dailyReportRetentionDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(365), z.null()]).default(30),
      answerComparisonMode: z.enum(["embedding", "llm"]).default("embedding"),
      embeddingModelSource: z.enum(["automatic", "offline"]).default("automatic"),
      stabilityRarityPreset: z.enum(["fast", "memory-cycle", "long-term"]).default("memory-cycle"),
      tagDisplayLanguage: z.enum(["zh", "en", "both"]).default("zh"),
      knowledgeBasePath: z.string().trim().max(4096).default(""),
      autoBackupEnabled: z.boolean().default(true),
      autoBackupMode: z.enum(["realtime", "daily", "weekly"]).default("daily"),
      autoBackupMaxStorageMb: z.number().int().min(1).max(10240).default(100),
      autoBackupOverflowPolicy: z.enum(["delete-oldest", "pause"]).default("delete-oldest"),
    }).parse(await request.json());
    if (input.autoBackupEnabled) {
      const { validateAutoBackupStorageMb, resumeAutoBackup } = await import("@/lib/auto-backup");
      validateAutoBackupStorageMb(input.autoBackupMaxStorageMb);
      resumeAutoBackup();
    }
    const { saveAppSettings } = await import("@/lib/settings");
    const saved = saveAppSettings(input);
    (await import("@/lib/daily-reports")).pruneDailyReports();
    const autoBackup = await import("@/lib/auto-backup");
    autoBackup.triggerAutoBackup();
    return NextResponse.json({ ...saved, autoBackupStatus: autoBackup.getAutoBackupStatus() });
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
    if ("knowledgeBasePath" in input) {
      const knowledgeBasePath = saveKnowledgeBasePath(input.knowledgeBasePath);
      (await import("@/lib/auto-backup")).triggerAutoBackup();
      return NextResponse.json({ ...getAppSettings(), knowledgeBasePath });
    }
    const embeddingModelSource = saveEmbeddingModelSource(input.embeddingModelSource);
    if (embeddingModelSource === "offline") {
      const { stopLocalEmbeddingModelPrewarm } = await import("@/lib/answer-comparison");
      stopLocalEmbeddingModelPrewarm();
    }
    (await import("@/lib/auto-backup")).triggerAutoBackup();
    return NextResponse.json({ ...getAppSettings(), embeddingModelSource });
  } catch (error) {
    if (isNativeAddonError(error)) return localApiErrorResponse("Failed to save the embedding model source", error, "无法保存模型方案。");
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存模型方案。" }, { status: 400 });
  }
}
