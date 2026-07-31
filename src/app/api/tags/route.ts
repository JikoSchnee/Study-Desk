import { NextResponse } from "next/server";
import { z } from "zod";
import { isNativeAddonError, localApiErrorResponse } from "@/lib/local-api-error";

export async function GET() {
  try {
    const { listTags } = await import("@/lib/tags");
    return NextResponse.json({ tags: listTags() });
  } catch (error) {
    return localApiErrorResponse("Failed to list tags", error, "无法读取标签。");
  }
}
export async function POST(request: Request) {
  try {
    const input = z.object({ chinese: z.string().optional(), english: z.string().optional() }).parse(await request.json());
    const { createTag } = await import("@/lib/tags");
    return NextResponse.json({ tag: createTag(input) }, { status: 201 });
  } catch (error) {
    if (isNativeAddonError(error)) return localApiErrorResponse("Failed to create a tag", error, "无法创建标签。");
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法创建标签。" }, { status: 400 });
  }
}
