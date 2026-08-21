import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createServiceSupabase } from "@service/lib/service-supabase";
import { encryptWebSecret } from "@service/lib/web-session";
import type { SharedAnswerPoint, SharedRating, WebEvaluationSource } from "@shared/sync";

export type WebRating = SharedRating;
export type EvaluationScope = { kind: "self"; cardId: string } | { kind: "community"; knowledgeBaseId: string; position: number };
export type EvaluationCard = { question: string; answerPoints: SharedAnswerPoint[]; answer?: string; note?: string };
export type StoredWebEvaluation = { scope: EvaluationScope; answerHash: string; score: number | null; suggestedRating: WebRating | null; feedback: string; gaps: string[]; source: WebEvaluationSource };

type Provider = { id: string; baseUrl: string; apiKey: string; model: string };
const defaults: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  moonshot: "https://api.moonshot.cn/v1",
};

function providers() {
  const order = (process.env.STUDY_DESK_AI_PROVIDER_ORDER ?? "openrouter,deepseek,zhipu,qwen,moonshot,custom").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return order.flatMap((id): Provider[] => {
    const prefix = id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const apiKey = process.env[`STUDY_DESK_AI_${prefix}_API_KEY`]?.trim() ?? "";
    const model = process.env[`STUDY_DESK_AI_${prefix}_MODEL`]?.trim() ?? "";
    const baseUrl = (process.env[`STUDY_DESK_AI_${prefix}_BASE_URL`]?.trim() || defaults[id] || "").replace(/\/+$/, "");
    return apiKey && model && baseUrl ? [{ id, apiKey, model, baseUrl }] : [];
  });
}

const answerHash = (answer: string) => createHash("sha256").update(answer).digest("hex");
const referenceText = (card: EvaluationCard) => card.answerPoints.map((point) => point.content?.trim()).filter(Boolean).join("\n") || card.answer?.trim() || "暂无参考答案";

function rating(score: number): WebRating { return score < 35 ? "again" : score < 60 ? "hard" : score < 85 ? "good" : "easy"; }

async function callProvider(provider: Provider, card: EvaluationCard, answer: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}`, ...(provider.id === "openrouter" ? { "HTTP-Referer": process.env.STUDY_DESK_PUBLIC_URL ?? "https://study-desk.jiko-official.top", "X-Title": "Study Desk" } : {}) },
      body: JSON.stringify({ model: provider.model, temperature: 0.2, response_format: { type: "json_object" }, messages: [
        { role: "system", content: "你是严谨的中文学习评分助手。只返回JSON：{score:number,feedback:string,gaps:string[]}。score为0到100整数；只依据参考答案评估，不编造用户未说的内容。" },
        { role: "user", content: `问题：${card.question}\n参考答案：\n${referenceText(card)}\n用户回答：\n${answer}` },
      ] }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${provider.id} 返回 HTTP ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = body.choices?.[0]?.message?.content?.replace(/^```(?:json)?\s*|\s*```$/g, "") ?? "";
    const parsed = JSON.parse(raw) as { score?: unknown; feedback?: unknown; gaps?: unknown };
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    if (!Number.isFinite(score)) throw new Error("模型没有返回有效分数");
    return { score, feedback: typeof parsed.feedback === "string" ? parsed.feedback.slice(0, 2_000) : "请结合参考答案确认本次掌握程度。", gaps: Array.isArray(parsed.gaps) ? parsed.gaps.filter((item): item is string => typeof item === "string").slice(0, 12) : [] };
  } finally { clearTimeout(timer); }
}

async function saveEvaluation(userId: string, payload: StoredWebEvaluation) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const result = await createServiceSupabase().from("study_desk_web_evaluations").insert({ id, user_id: userId, payload_ciphertext: encryptWebSecret(payload), expires_at: expiresAt });
  if (result.error) throw result.error;
  return { id, expiresAt };
}

export async function evaluateWebAnswer(input: { userId: string; member: boolean; scope: EvaluationScope; card: EvaluationCard; answer: string; operationId: string }) {
  const limit = input.member ? 50 : 5;
  const tier = input.member ? "member" : "free";
  const configured = providers();
  const selfResult = async (reason: "quota" | "unavailable") => {
    const payload: StoredWebEvaluation = { scope: input.scope, answerHash: answerHash(input.answer), score: null, suggestedRating: null, feedback: reason === "quota" ? "今日大模型评分额度已用完，请查看参考答案后自行评级。桌面端可无限次使用本地向量评分。" : "评分服务暂不可用，请查看参考答案后自行评级。", gaps: [], source: "self" };
    const evaluation = await saveEvaluation(input.userId, payload);
    return { mode: "self" as const, reason, reference: referenceText(input.card), feedback: payload.feedback, evaluationId: evaluation.id, quota: { limit, remaining: 0 } };
  };
  if (!configured.length) return selfResult("unavailable");
  const supabase = createServiceSupabase();
  const claim = await supabase.rpc("claim_study_desk_ai_usage", { target_user: input.userId, operation_id: input.operationId, target_tier: tier, daily_limit: limit });
  if (claim.error) throw claim.error;
  const claimed = claim.data?.[0] as { allowed?: boolean; used?: number; quota?: number } | undefined;
  if (!claimed?.allowed) return selfResult("quota");
  for (const provider of configured) {
    try {
      const result = await callProvider(provider, input.card, input.answer);
      await supabase.from("study_desk_ai_usage_events").update({ status: "succeeded", provider: provider.id, model: provider.model, updated_at: new Date().toISOString() }).eq("user_id", input.userId).eq("id", input.operationId);
      const payload: StoredWebEvaluation = { scope: input.scope, answerHash: answerHash(input.answer), score: result.score, suggestedRating: rating(result.score), feedback: result.feedback, gaps: result.gaps, source: "llm" };
      const evaluation = await saveEvaluation(input.userId, payload);
      return { mode: "llm" as const, evaluation: { score: result.score, suggestedRating: payload.suggestedRating, feedback: result.feedback, gaps: result.gaps }, evaluationId: evaluation.id, quota: { limit, remaining: Math.max(0, limit - Number(claimed.used ?? 0) - 1) } };
    } catch { /* Try the next administrator-configured provider. */ }
  }
  await supabase.from("study_desk_ai_usage_events").update({ status: "failed", updated_at: new Date().toISOString() }).eq("user_id", input.userId).eq("id", input.operationId);
  return selfResult("unavailable");
}

export function hashWebAnswer(answer: string) { return answerHash(answer); }
