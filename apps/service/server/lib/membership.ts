import "server-only";
import { randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type MembershipPlan = "monthly" | "yearly";
export type MembershipStatus = {
  state: "free" | "trial" | "active" | "grace" | "expired";
  trialAvailable: boolean;
  activeUntil: string | null;
  graceEndsAt: string | null;
  cloudDeleteAt: string | null;
  canReadCloud: boolean;
  canWriteCloud: boolean;
  quotaBytes: number;
  usedBytes: number;
};

const graceMs = 30 * 24 * 60 * 60 * 1_000;
export const membershipCatalog = {
  monthly: { days: 30, amountCents: 1500, env: "PADDLE_MONTHLY_PRICE_ID" },
  yearly: { days: 365, amountCents: 12800, env: "PADDLE_YEARLY_PRICE_ID" },
} as const;

function bytes(value: unknown) { return value == null ? 0 : Buffer.byteLength(JSON.stringify(value)); }

async function cloudUsage(supabase: SupabaseClient, userId: string) {
  const [documentResult, historyResult] = await Promise.all([
    supabase.from("study_desk_sync_documents").select("backup").eq("user_id", userId).maybeSingle(),
    supabase.from("study_desk_sync_history").select("backup").eq("user_id", userId),
  ]);
  if (documentResult.error) throw documentResult.error;
  if (historyResult.error) throw historyResult.error;
  return bytes(documentResult.data?.backup) + (historyResult.data ?? []).reduce((sum, row) => sum + bytes(row.backup), 0);
}

export async function membershipStatus(supabase: SupabaseClient, user: Pick<User, "id">): Promise<MembershipStatus> {
  const membershipResult = await supabase.from("study_desk_memberships").select("trial_started_at, active_until, grace_started_at, cloud_deleted_at, quota_bytes").eq("user_id", user.id).maybeSingle();
  if (membershipResult.error) throw membershipResult.error;
  let membership = membershipResult.data;
  const { data: existingDocument } = await supabase.from("study_desk_sync_documents").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!membership && existingDocument) {
    const inserted = await supabase.from("study_desk_memberships").upsert({ user_id: user.id, grace_started_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true });
    if (inserted.error) throw inserted.error;
    const refreshed = await supabase.from("study_desk_memberships").select("trial_started_at, active_until, grace_started_at, cloud_deleted_at, quota_bytes").eq("user_id", user.id).single();
    if (refreshed.error) throw refreshed.error;
    membership = refreshed.data;
  }
  const now = Date.now();
  const activeUntilMs = membership?.active_until ? Date.parse(membership.active_until) : 0;
  let graceStartedAt = membership?.grace_started_at ?? null;
  if (membership && activeUntilMs > 0 && activeUntilMs <= now && !graceStartedAt) {
    graceStartedAt = membership.active_until;
    const updated = await supabase.from("study_desk_memberships").update({ grace_started_at: graceStartedAt, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (updated.error) throw updated.error;
  }
  const graceEndsMs = graceStartedAt ? Date.parse(graceStartedAt) + graceMs : 0;
  const active = activeUntilMs > now;
  const inGrace = !active && graceEndsMs > now && !membership?.cloud_deleted_at;
  const trialGrant = membership?.trial_started_at && active && activeUntilMs <= Date.parse(membership.trial_started_at) + 7 * 24 * 60 * 60 * 1_000 + 60_000;
  const state: MembershipStatus["state"] = active ? trialGrant ? "trial" : "active" : inGrace ? "grace" : membership?.trial_started_at || activeUntilMs ? "expired" : "free";
  const usedBytes = await cloudUsage(supabase, user.id);
  return {
    state,
    trialAvailable: !membership?.trial_started_at,
    activeUntil: membership?.active_until ?? null,
    graceEndsAt: graceStartedAt ? new Date(graceEndsMs).toISOString() : null,
    cloudDeleteAt: graceStartedAt ? new Date(graceEndsMs).toISOString() : null,
    canReadCloud: active || inGrace,
    canWriteCloud: active,
    quotaBytes: Number(membership?.quota_bytes ?? 524_288_000),
    usedBytes,
  };
}

export async function requireCloudMembership(supabase: SupabaseClient, user: User, mode: "read" | "write") {
  const status = await membershipStatus(supabase, user);
  if (mode === "write" && !status.canWriteCloud) throw new Error(status.state === "grace" ? "MEMBERSHIP_READ_ONLY" : "MEMBERSHIP_REQUIRED");
  if (mode === "read" && !status.canReadCloud) throw new Error("MEMBERSHIP_REQUIRED");
  return status;
}

export function paddleEnvironment() {
  return process.env.PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function paddleApiBase() { return paddleEnvironment() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com"; }
export function paddleNonce() { return randomBytes(24).toString("base64url"); }

export function verifyPaddleSignature(rawBody: string, signature: string | null, secret = process.env.PADDLE_WEBHOOK_SECRET ?? "") {
  if (!signature || !secret) return false;
  const fields = Object.fromEntries(signature.split(";").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(fields.ts);
  if (!timestamp || !fields.h1 || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
  const actual = fields.h1;
  return expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
