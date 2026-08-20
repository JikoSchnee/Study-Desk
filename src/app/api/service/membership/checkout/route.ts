import { NextResponse } from "next/server";
import { z } from "zod";
import { membershipCatalog, paddleApiBase, paddleEnvironment, paddleNonce, type MembershipPlan } from "@/lib/membership";
import { requireServiceUser, serviceError } from "@/lib/service-supabase";

const schema = z.object({ plan: z.enum(["monthly", "yearly"]) });

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireServiceUser(request);
    const { plan } = schema.parse(await request.json());
    const selected = membershipCatalog[plan as MembershipPlan];
    const priceId = process.env[selected.env]?.trim();
    const apiKey = process.env.PADDLE_API_KEY?.trim();
    if (!priceId || !apiKey) throw new Error(paddleEnvironment() === "production" ? "Paddle 正式支付尚未配置完成。" : "Paddle Sandbox 商品或 API Key 尚未配置。 ");
    const nonce = paddleNonce();
    const pending = await supabase.from("study_desk_membership_payments").insert({ user_id: user.id, plan, amount_cents: selected.amountCents, checkout_nonce: nonce, status: "creating" }).select("id").single();
    if (pending.error) throw pending.error;
    const response = await fetch(`${paddleApiBase()}/transactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ price_id: priceId, quantity: 1 }], collection_mode: "automatic", custom_data: { study_desk_payment_id: pending.data.id, study_desk_user_id: user.id, plan, checkout_nonce: nonce } }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json() as { data?: { id?: string; checkout?: { url?: string } }; error?: { detail?: string } };
    if (!response.ok || !body.data?.id) throw new Error(body.error?.detail ?? `Paddle 创建交易失败（HTTP ${response.status}）。`);
    const updated = await supabase.from("study_desk_membership_payments").update({ provider_transaction_id: body.data.id, status: "pending", updated_at: new Date().toISOString() }).eq("id", pending.data.id);
    if (updated.error) throw updated.error;
    return NextResponse.json({ transactionId: body.data.id, checkoutUrl: body.data.checkout?.url ?? null, environment: paddleEnvironment(), clientToken: process.env.PADDLE_CLIENT_TOKEN ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "会员方案无效。" }, { status: 400 });
    const failure = serviceError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
