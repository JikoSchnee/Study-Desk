import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizedCommunityCard } from "@service/lib/community-server";
import { membershipStatus } from "@service/lib/membership";
import { requireServiceUser, serviceError } from "@service/lib/service-supabase";
import {
  completeWebInitialStudy,
  confirmWebReview,
  selfEvaluationContext,
  updateWebCardNote,
  webBootstrap,
  webCardDetail,
  webLibrary,
  webReviewQueue,
} from "@service/lib/web-backup";
import { evaluateWebAnswer, hashWebAnswer, type StoredWebEvaluation } from "@service/lib/web-ai";
import { clearWebSession, decryptWebSecret, requireWebCsrf, resolveWebSession, revokeWebSession } from "@service/lib/web-session";

const rating = z.enum(["again", "hard", "good", "easy"]);
const evaluateSchema = z.object({
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("self"), cardId: z.string().min(1) }),
    z.object({ kind: z.literal("community"), knowledgeBaseId: z.string().min(1), position: z.number().int().min(0) }),
  ]),
  answer: z.string().max(20_000),
  operationId: z.string().uuid(),
});
const confirmSchema = z.object({ evaluationId: z.string().uuid(), operationId: z.string().uuid(), answer: z.string().max(20_000), rating });

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function dailyQuota(supabase: Awaited<ReturnType<typeof resolveWebSession>>["supabase"], userId: string, membershipState: string) {
  const limit = membershipState === "trial" || membershipState === "active" ? 50 : 5;
  const result = await supabase.from("study_desk_ai_usage_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("usage_date", shanghaiDate()).eq("status", "succeeded");
  if (result.error) throw result.error;
  const used = result.count ?? 0;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

function cardForEvaluation(card: Record<string, unknown>) {
  const points = card.answer_points ?? card.answerPoints ?? [];
  return {
    question: String(card.question ?? ""),
    answer: String(card.answer ?? ""),
    note: String(card.note ?? ""),
    answerPoints: Array.isArray(points)
      ? points.map((point) => typeof point === "string" ? { content: point } : point as { content?: string })
      : [],
  };
}

async function communityProgress(request: Request) {
  const auth = await requireServiceUser(request);
  const url = new URL(request.url);
  let query = auth.supabase.from("study_desk_community_progress").select("knowledge_base_id, card_position, completed_at, rating, due_at, updated_at").eq("user_id", auth.user.id).order("updated_at", { ascending: false });
  const id = url.searchParams.get("knowledgeBaseId");
  if (id) query = query.eq("knowledge_base_id", id);
  const result = await query;
  if (result.error) throw result.error;
  return { progress: result.data ?? [] };
}

async function confirmCommunity(request: Request, input: z.infer<typeof confirmSchema>) {
  const auth = await requireServiceUser(request);
  const selected = await auth.supabase.from("study_desk_web_evaluations").select("payload_ciphertext, expires_at, consumed_at, confirmation_operation_id, confirmation_result").eq("id", input.evaluationId).eq("user_id", auth.user.id).maybeSingle();
  if (selected.data?.confirmation_operation_id === input.operationId && selected.data.confirmation_result) return selected.data.confirmation_result;
  if (selected.error || !selected.data || selected.data.consumed_at || Date.parse(selected.data.expires_at) <= Date.now()) throw new Error("WEB_EVALUATION_EXPIRED");
  const evaluation = decryptWebSecret<StoredWebEvaluation>(selected.data.payload_ciphertext);
  if (evaluation.scope.kind !== "community" || evaluation.answerHash !== hashWebAnswer(input.answer)) throw new Error("WEB_EVALUATION_INVALID");
  const delay = { again: 10 * 60_000, hard: 86_400_000, good: 3 * 86_400_000, easy: 7 * 86_400_000 }[input.rating];
  const now = new Date();
  const dueAt = new Date(now.getTime() + delay).toISOString();
  const saved = await auth.supabase.from("study_desk_community_progress").upsert({
    user_id: auth.user.id,
    knowledge_base_id: evaluation.scope.knowledgeBaseId,
    card_position: evaluation.scope.position,
    completed_at: now.toISOString(),
    rating: input.rating,
    due_at: dueAt,
    updated_at: now.toISOString(),
  }, { onConflict: "user_id,knowledge_base_id,card_position" });
  if (saved.error) throw saved.error;
  const result = { result: { dueAt, idempotent: false } };
  await auth.supabase.from("study_desk_web_evaluations").update({ consumed_at: now.toISOString(), confirmation_operation_id: input.operationId, confirmation_result: result }).eq("id", input.evaluationId).is("consumed_at", null);
  return result;
}

async function evaluate(request: Request) {
  const input = evaluateSchema.parse(await request.json());
  if (input.scope.kind === "self") {
    const context = await selfEvaluationContext(request, input.scope.cardId);
    return evaluateWebAnswer({ userId: context.user.id, member: context.member, scope: input.scope, card: context.card, answer: input.answer, operationId: input.operationId });
  }
  const authorized = await authorizedCommunityCard(request, input.scope.knowledgeBaseId, input.scope.position);
  const auth = await requireServiceUser(request);
  const membership = await membershipStatus(auth.supabase, auth.user);
  return evaluateWebAnswer({
    userId: auth.user.id,
    member: membership.state === "trial" || membership.state === "active",
    scope: { kind: "community", knowledgeBaseId: authorized.knowledgeBaseId, position: input.scope.position },
    card: cardForEvaluation(authorized.card as Record<string, unknown>),
    answer: input.answer,
    operationId: input.operationId,
  });
}

export async function handleWebGet(request: Request, path: string[]) {
  const route = path.join("/");
  if (route === "session") {
    const auth = await resolveWebSession(request);
    const membership = await membershipStatus(auth.supabase, auth.user);
    return json({ user: { id: auth.user.id, email: auth.user.email ?? null }, membership, aiQuota: await dailyQuota(auth.supabase, auth.user.id, membership.state) });
  }
  if (route === "bootstrap") return json(await webBootstrap(request));
  if (route === "library") return json(await webLibrary(request));
  if (route === "review/queue") return json(await webReviewQueue(request));
  if (route === "community/progress") return json(await communityProgress(request));
  if (path.length === 2 && path[0] === "cards") return json(await webCardDetail(request, path[1]));
  return null;
}

export async function handleWebPost(request: Request, path: string[]) {
  const route = path.join("/");
  if (route === "logout" || route === "logout-all") {
    const auth = await resolveWebSession(request);
    await requireWebCsrf(request, auth.webSessionId);
    await revokeWebSession(auth.webSessionId, auth.user.id, route === "logout-all");
    return clearWebSession(json({ ok: true }));
  }
  if (route === "review/evaluate") return json(await evaluate(request));
  if (route === "review/complete-study") {
    const input = z.object({ cardId: z.string().min(1), operationId: z.string().uuid() }).parse(await request.json());
    return json(await completeWebInitialStudy(request, input.cardId));
  }
  if (route === "review/confirm") {
    const input = confirmSchema.parse(await request.json());
    const selected = await requireServiceUser(request).then((auth) => auth.supabase.from("study_desk_web_evaluations").select("payload_ciphertext").eq("id", input.evaluationId).eq("user_id", auth.user.id).maybeSingle());
    if (selected.error || !selected.data) throw new Error("WEB_EVALUATION_EXPIRED");
    const evaluation = decryptWebSecret<StoredWebEvaluation>(selected.data.payload_ciphertext);
    return json(evaluation.scope.kind === "self" ? await confirmWebReview(request, input) : await confirmCommunity(request, input));
  }
  return null;
}

export async function handleWebPatch(request: Request, path: string[]) {
  if (path.length === 3 && path[0] === "cards" && path[2] === "note") {
    const input = z.object({ note: z.string().max(50_000), expectedUpdatedAt: z.string().optional() }).parse(await request.json());
    return json(await updateWebCardNote(request, path[1], input.note, input.expectedUpdatedAt));
  }
  return null;
}

export function webRouteError(error: unknown) {
  if (error instanceof z.ZodError) return json({ error: "请求参数无效。", details: error.flatten() }, 400);
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("WEB_CLOUD_EMPTY")) return json({ error: "请先在桌面端创建知识库并完成一次云同步。" }, 404);
  if (message.includes("WEB_CARD_NOT_FOUND")) return json({ error: "没有找到这张卡片。" }, 404);
  if (message.includes("WEB_NOTE_CONFLICT")) return json({ error: "卡片已在另一端更新，请刷新后重试。" }, 409);
  if (message.includes("WEB_EVALUATION_EXPIRED") || message.includes("WEB_EVALUATION_INVALID")) return json({ error: "评分确认已过期或内容不一致，请重新评分。" }, 409);
  const failure = serviceError(error);
  return json({ error: failure.message }, failure.status);
}
