import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnvironmentSettings, saveEnvironmentSettings } from "@/lib/environment";
import { modelProviderIds } from "@/lib/model-providers";

const environmentSchema = z.object({
  provider: z.enum(modelProviderIds).default("custom"),
  baseUrl: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try { new URL(value); return true; } catch { return false; }
  }, "请输入有效的 API 地址。"),
  model: z.string().trim().max(256),
  apiKey: z.string().max(10_000).optional(),
  clearApiKey: z.boolean().default(false),
});

export async function GET() { return NextResponse.json(getEnvironmentSettings()); }

export async function PUT(request: Request) {
  try {
    const input = environmentSchema.parse(await request.json());
    return NextResponse.json(saveEnvironmentSettings(input));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存本地环境配置。" }, { status: 400 });
  }
}
