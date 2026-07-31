import { NextResponse } from "next/server";
import { localApiErrorResponse } from "@/lib/local-api-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getLocalEmbeddingModelStatus } = await import("@/lib/answer-comparison");
    return NextResponse.json(await getLocalEmbeddingModelStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return localApiErrorResponse("Failed to read the local embedding model status", error, "无法读取本地语义模型状态。");
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json().catch(() => ({})) as { force?: unknown };
    const { getLocalEmbeddingModelStatus, restartLocalEmbeddingModelPrewarm, startLocalEmbeddingModelPrewarm } = await import("@/lib/answer-comparison");
    if (input.force === true) await restartLocalEmbeddingModelPrewarm();
    else startLocalEmbeddingModelPrewarm();
    return NextResponse.json(await getLocalEmbeddingModelStatus(), { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return localApiErrorResponse("Failed to start the local embedding model", error, "无法启动本地语义模型。");
  }
}

export async function DELETE() {
  try {
    const { removeAutomaticallyDownloadedEmbeddingModel } = await import("@/lib/answer-comparison");
    return NextResponse.json(await removeAutomaticallyDownloadedEmbeddingModel(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return localApiErrorResponse("Failed to remove the local embedding model", error, "无法删除自动下载的模型。");
  }
}
