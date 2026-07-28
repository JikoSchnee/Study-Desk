import "server-only";
import { randomUUID } from "node:crypto";
import { modelProviders, type ModelProviderId, type ModelProtocol } from "@/lib/model-providers";
import { normalizeQuestion } from "@/lib/question-variants";
import { compareWithEmbeddings, comparisonFromLLM, evaluationFromComparison } from "@/lib/answer-comparison";
import type { AnswerComparisonMode, Card, Evaluation } from "@/lib/types";

export interface LLMProvider { evaluateAnswer(card: Card, answer: string): Promise<Evaluation>; }
export interface SpeechToTextProvider { transcribe(audio: Blob): Promise<string>; }
export interface TextToSpeechProvider { synthesize(text: string): Promise<ArrayBuffer>; }

type RemoteModelConfig = { provider: ModelProviderId; protocol: ModelProtocol; baseUrl: string; apiKey: string; model: string };

function remoteModelConfig(): RemoteModelConfig | null {
  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  const requestedProvider = process.env.LLM_PROVIDER;
  const provider: ModelProviderId = requestedProvider && requestedProvider in modelProviders ? requestedProvider as ModelProviderId : "custom";
  if (!baseUrl || !apiKey || !model) return null;
  return { provider, protocol: modelProviders[provider].protocol, baseUrl, apiKey, model };
}

export function hasRemoteModelConfig() { return remoteModelConfig() !== null; }

async function requestModel(config: RemoteModelConfig, input: { system: string; user: string; temperature: number; jsonMode?: boolean }) {
  if (config.protocol === "anthropic-messages") {
    const response = await fetch(`${config.baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.model, max_tokens: 1_200, temperature: input.temperature, system: input.system, messages: [{ role: "user", content: input.user }] }),
    });
    if (!response.ok) throw new Error(`模型服务返回 ${response.status}`);
    const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const content = payload.content?.find((item) => item.type === "text")?.text;
    if (!content) throw new Error("模型服务没有返回内容");
    return content;
  }
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: input.temperature,
      ...(input.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
    }),
  });
  if (!response.ok) throw new Error(`模型服务返回 ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型服务没有返回内容");
  return content;
}

export const localLLMProvider: LLMProvider = {
  async evaluateAnswer(card, answer) {
    const comparison = await compareWithEmbeddings(card, answer);
    return { ...evaluationFromComparison(comparison), comparison };
  },
};

const remoteLLMProvider: LLMProvider = {
  async evaluateAnswer(card, answer) {
    const config = remoteModelConfig();
    if (!config) throw new Error("未配置模型服务");
    const content = await requestModel(config, {
      temperature: 0.2,
      jsonMode: true,
      system: "你是严谨的中文技术面试教练。只返回 JSON：{feedback:string,matches:[{id:string,status:covered|partial|missing,evidence:string[]}]}. evidence 必须逐字摘自本次回答；每条非 missing 要点至少给一个 evidence。不得编造证据。",
      user: `问题：${card.question}\n参考答案结构：\n${card.answerPoints.map((point) => `- id=${point.id}（${point.role === "opening" ? "开场总述" : point.role === "closing" ? "收束总结" : "核心要点"}）：${point.content}`).join("\n")}\n本次回答：${answer}`,
    });
    const data = JSON.parse(content) as { feedback?: unknown };
    const comparison = comparisonFromLLM(card, answer, data);
    const evaluation = evaluationFromComparison(comparison);
    return { ...evaluation, feedback: typeof data.feedback === "string" && data.feedback.trim() ? data.feedback : evaluation.feedback, comparison };
  },
};

export async function evaluateAnswer(card: Card, answer: string, requestedMode: AnswerComparisonMode = "embedding", comparisonProgressId?: string) {
  if (requestedMode === "llm" && remoteModelConfig()) {
    try { return await remoteLLMProvider.evaluateAnswer(card, answer); } catch { /* Fall through to a local-safe comparison. */ }
  }
  const comparison = await compareWithEmbeddings(card, answer, requestedMode, comparisonProgressId);
  if (requestedMode === "llm") comparison.warning = "LLM 比对不可用，已改用本地语义比对。";
  return { ...evaluationFromComparison(comparison), comparison };
}

export function parseGeneratedQuestionVariants(content: string, excluded: string[] = []) {
  const parsed = JSON.parse(content) as { variants?: unknown };
  if (!Array.isArray(parsed.variants)) throw new Error("模型没有返回问法列表。");
  const seen = new Set(excluded.map(normalizeQuestion));
  return parsed.variants.flatMap((value) => {
    if (typeof value !== "string") return [];
    const question = value.trim().replace(/\s+/g, " ");
    const key = normalizeQuestion(question);
    if (question.length < 3 || seen.has(key)) return [];
    seen.add(key);
    return [{ id: randomUUID(), content: question, source: "ai" as const }];
  }).slice(0, 3);
}

export async function generateQuestionVariants(question: string, answerPoints: string[], excluded: string[]) {
  const config = remoteModelConfig();
  if (!config) throw new Error("请先在设置中配置模型服务，再使用 AI 补充问法。");
  let content: string;
  try {
    content = await requestModel(config, {
      temperature: 0.65,
      jsonMode: true,
      system: "你是中文技术面试题编辑。请只返回 JSON：{\"variants\":[\"问法1\",\"问法2\",\"问法3\"]}。生成恰好 3 个自然、简洁的同义问法。可以改变措辞、面试语境和提问角度，但必须能由原答案要点完整回答；禁止扩展新知识、禁止追问答案未覆盖的原因、案例或权衡。",
      user: `主问题：${question}\n答案要点：\n${answerPoints.map((point, index) => `${index + 1}. ${point}`).join("\n")}\n不要重复这些已有问法：\n${excluded.join("\n") || "无"}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法生成问法。";
    throw new Error(`${message}，暂时无法生成问法。`);
  }
  const variants = parseGeneratedQuestionVariants(content, excluded);
  if (!variants.length) throw new Error("模型返回的问法与现有内容重复，请再试一次。");
  return variants;
}

export async function generateFollowUpQuestion(card: Card, answer: string, gaps: string[]) {
  const config = remoteModelConfig();
  if (!config) throw new Error("请先在设置中配置模型服务，再使用 AI 拓展追问。");
  try {
    const content = await requestModel(config, {
      temperature: 0.45,
      jsonMode: true,
      system: "你是严谨的中文技术面试官。只返回 JSON：{\"question\":\"...\"}。生成一条简洁、可回答的追问，必须紧扣候选人的遗漏要点；不要要求未给出的项目经历、不要重复原题、不要给出答案或评价。",
      user: `原问题：${card.question}\n参考答案要点：${card.answerPoints.map((point) => point.content).join("；")}\n候选人回答：${answer}\n已识别遗漏：${gaps.join("；") || "请从覆盖不足的关键要点切入"}`,
    });
    const question = (JSON.parse(content) as { question?: unknown }).question;
    if (typeof question !== "string" || question.trim().length < 3) throw new Error("模型没有返回有效追问。");
    return question.trim();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "暂时无法生成追问。");
  }
}
