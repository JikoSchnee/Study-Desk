import { NextResponse } from "next/server";
import { membershipStatus } from "@/lib/membership";
import { requireServiceUser, serviceError } from "@/lib/service-supabase";

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireServiceUser(request);
    const { error } = await supabase.rpc("start_study_desk_trial", { target_user: user.id });
    if (error) throw error;
    return NextResponse.json({ membership: await membershipStatus(supabase, user) });
  } catch (error) {
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
