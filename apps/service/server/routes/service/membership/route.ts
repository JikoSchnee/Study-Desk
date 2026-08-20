import { NextResponse } from "next/server";
import { membershipStatus, membershipCatalog, paddleEnvironment } from "@service/lib/membership";
import { requireServiceUser, serviceError } from "@service/lib/service-supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireServiceUser(request);
    return NextResponse.json({
      membership: await membershipStatus(supabase, user),
      catalog: {
        monthly: { amountCents: membershipCatalog.monthly.amountCents, days: membershipCatalog.monthly.days },
        yearly: { amountCents: membershipCatalog.yearly.amountCents, days: membershipCatalog.yearly.days },
      },
      paddle: { environment: paddleEnvironment(), clientToken: process.env.PADDLE_CLIENT_TOKEN ?? null },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
