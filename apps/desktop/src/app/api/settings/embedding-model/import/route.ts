import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getLocalEmbeddingModelStatus, importLocalEmbeddingModelArchive, LOCAL_EMBEDDING_MODEL_ARCHIVE_MAX_BYTES } from "@/lib/answer-comparison";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadDirectory = join(process.env.MOCK_INTERVIEW_HOME || process.cwd(), ".cache", "answer-comparison", ".uploads");

export async function POST(request: Request) {
  let uploadPath = "";
  try {
    const form = await request.formData();
    const archive = form.get("archive");
    if (!(archive instanceof File) || !archive.size) throw new Error("请选择 bge-m3 模型 ZIP 文件。");
    if (!archive.name.toLowerCase().endsWith(".zip")) throw new Error("请选择 .zip 格式的模型压缩包。");
    if (archive.size > LOCAL_EMBEDDING_MODEL_ARCHIVE_MAX_BYTES) throw new Error("模型压缩包超过 800MB 限制。");

    await mkdir(uploadDirectory, { recursive: true });
    uploadPath = join(uploadDirectory, `${randomUUID()}.zip`);
    await finished(Readable.fromWeb(archive.stream() as never).pipe(createWriteStream(uploadPath, { flags: "wx" })));
    await importLocalEmbeddingModelArchive(uploadPath);
    return NextResponse.json(await getLocalEmbeddingModelStatus());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导入 bge-m3 失败。" }, { status: 400 });
  } finally {
    if (uploadPath) await rm(uploadPath, { force: true });
  }
}
