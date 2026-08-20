import { NextResponse } from "next/server";
import { createServiceSupabase } from "@service/lib/service-supabase";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceSupabase();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
  const candidates = await supabase.from("study_desk_memberships").select("user_id").lte("grace_started_at", cutoff).is("cloud_deleted_at", null).limit(200);
  if (candidates.error) return NextResponse.json({ error: candidates.error.message }, { status: 500 });
  let deleted = 0;
  for (const candidate of candidates.data ?? []) {
    const result = await supabase.rpc("cleanup_study_desk_cloud_user", { target_user: candidate.user_id, cutoff_time: cutoff });
    if (!result.error && result.data) deleted += 1;
  }
  return NextResponse.json({ ok: true, deleted });
}

export const POST = GET;
