import { NextResponse } from "next/server";
import { membershipCatalog, verifyPaddleSignature, type MembershipPlan } from "@service/lib/membership";
import { createServiceSupabase } from "@service/lib/service-supabase";

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  data?: {
    id?: string;
    transaction_id?: string;
    status?: string;
    action?: string;
    custom_data?: Record<string, unknown> | null;
  };
};

async function reverseMembership(supabase: ReturnType<typeof createServiceSupabase>, transactionId: string, status: "refunded" | "disputed") {
  const payment = await supabase.from("study_desk_membership_payments").select("user_id").eq("provider_transaction_id", transactionId).maybeSingle();
  if (payment.error) throw payment.error;
  if (!payment.data) return;
  const now = new Date().toISOString();
  const paymentUpdate = await supabase.from("study_desk_membership_payments").update({ status, reversed_at: now, updated_at: now }).eq("provider_transaction_id", transactionId);
  if (paymentUpdate.error) throw paymentUpdate.error;
  const revoke = await supabase.rpc("revoke_study_desk_membership_transaction", { target_transaction: transactionId });
  if (revoke.error) throw revoke.error;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyPaddleSignature(rawBody, request.headers.get("paddle-signature"))) return NextResponse.json({ error: "Paddle 签名无效。" }, { status: 401 });
  let event: PaddleEvent;
  try { event = JSON.parse(rawBody) as PaddleEvent; } catch { return NextResponse.json({ error: "Webhook JSON 无效。" }, { status: 400 }); }
  if (!event.event_id || !event.event_type || !event.data) return NextResponse.json({ error: "Webhook 字段不完整。" }, { status: 400 });
  const supabase = createServiceSupabase();
  const duplicate = await supabase.from("study_desk_payment_events").select("provider_event_id").eq("provider_event_id", event.event_id).maybeSingle();
  if (duplicate.error) return NextResponse.json({ error: duplicate.error.message }, { status: 500 });
  if (duplicate.data) return NextResponse.json({ ok: true, duplicate: true });
  try {
    if (event.event_type === "transaction.completed") {
      const transactionId = event.data.id;
      const paymentId = String(event.data.custom_data?.study_desk_payment_id ?? "");
      if (!transactionId || !paymentId) throw new Error("Paddle 交易缺少 Study Desk 绑定信息。 ");
      const payment = await supabase.from("study_desk_membership_payments").select("id, user_id, plan, checkout_nonce, provider_transaction_id, status").eq("id", paymentId).single();
      if (payment.error) throw payment.error;
      if (payment.data.provider_transaction_id !== transactionId || payment.data.checkout_nonce !== event.data.custom_data?.checkout_nonce || payment.data.user_id !== event.data.custom_data?.study_desk_user_id) throw new Error("Paddle 交易绑定校验失败。 ");
      const plan = payment.data.plan as MembershipPlan;
      if (!(plan in membershipCatalog)) throw new Error("会员方案无效。 ");
      const paidAt = new Date().toISOString();
      const paymentUpdate = await supabase.from("study_desk_membership_payments").update({ status: "paid", paid_at: paidAt, updated_at: paidAt }).eq("id", paymentId);
      if (paymentUpdate.error) throw paymentUpdate.error;
      const grant = await supabase.rpc("grant_study_desk_membership", { target_user: payment.data.user_id, target_plan: plan, target_days: membershipCatalog[plan].days, target_transaction: transactionId });
      if (grant.error) throw grant.error;
    } else if (event.event_type === "adjustment.updated" && event.data.status === "approved" && ["refund", "chargeback", "chargeback_warning"].includes(event.data.action ?? "")) {
      if (event.data.transaction_id) await reverseMembership(supabase, event.data.transaction_id, event.data.action === "refund" ? "refunded" : "disputed");
    } else if (event.event_type === "transaction.canceled" && event.data.id) {
      const canceled = await supabase.from("study_desk_membership_payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("provider_transaction_id", event.data.id).eq("status", "pending");
      if (canceled.error) throw canceled.error;
    }
    const recorded = await supabase.from("study_desk_payment_events").insert({ provider_event_id: event.event_id, event_type: event.event_type, provider_transaction_id: event.data.transaction_id ?? event.data.id ?? null, payload: event });
    if (recorded.error && recorded.error.code !== "23505") throw recorded.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Paddle Webhook 处理失败。" }, { status: 500 });
  }
}
