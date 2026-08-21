import { NextResponse } from "next/server";
import { bearerToken, createServiceSupabase, serviceError } from "@service/lib/service-supabase";

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    const { error } = await createServiceSupabase().auth.admin.signOut(token, "global");
    if (error && error.status !== 404) throw error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
