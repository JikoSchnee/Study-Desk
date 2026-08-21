import { NextResponse } from "next/server";
import { requireServiceUser, serviceError } from "@service/lib/service-supabase";

export async function GET(request: Request) {
  try {
    const { user } = await requireServiceUser(request);
    return NextResponse.json({
      user: { id: user.id, email: user.email ?? null },
      identities: (user.identities ?? []).map((identity) => ({ id: identity.id, provider: identity.provider, email: typeof identity.identity_data?.email === "string" ? identity.identity_data.email : null })),
      availableProviders: ["google"],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
