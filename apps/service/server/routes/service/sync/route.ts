import { NextResponse } from "next/server";
import { z } from "zod";
import { requireServiceUser, serviceError } from "@service/lib/service-supabase";
import { requireCloudMembership } from "@service/lib/membership";

export const dynamic = "force-dynamic";

const writeSchema = z.object({ action: z.literal("replace"), expectedVersion: z.number().int().min(0), backup: z.unknown(), historyLimit: z.number().int().min(1).max(10).default(5) });

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireServiceUser(request);
    await requireCloudMembership(supabase, user, "read");
    const url = new URL(request.url);
    const resource = z.enum(["document", "history", "history-item"]).parse(url.searchParams.get("resource"));
    if (resource === "document") {
      const { data, error } = await supabase.from("study_desk_sync_documents").select("version, backup, updated_at").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ document: data }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (resource === "history") {
      const { data, error } = await supabase.from("study_desk_sync_history").select("id, version, backup, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return NextResponse.json({ records: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const id = z.string().uuid().parse(url.searchParams.get("id"));
    const { data, error } = await supabase.from("study_desk_sync_history").select("id, version, backup, created_at").eq("user_id", user.id).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "找不到该同步记录。" }, { status: 404 });
    return NextResponse.json({ record: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "同步请求参数无效。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireServiceUser(request);
    const input = writeSchema.parse(await request.json());
    const encodedSize = Buffer.byteLength(JSON.stringify(input.backup));
    if (encodedSize > 4 * 1024 * 1024) return NextResponse.json({ error: "同步数据超过当前 4 MB 上限，请先清理历史数据或等待大文件存储支持。" }, { status: 413 });
    await requireCloudMembership(supabase, user, "write");
    const { data: version, error } = await supabase.rpc("replace_study_desk_sync_document_service", { target_user: user.id, expected_version: input.expectedVersion, next_backup: input.backup, target_history_limit: input.historyLimit });
    if (error) throw error;
    return NextResponse.json({ version: Number(version) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "同步数据格式无效。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
