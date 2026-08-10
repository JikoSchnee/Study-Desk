import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import { createCard, getCard, listCards, updateCard, updateCardStatus } from "@/lib/cards";
import { cardLearningDetails, cardLearningSummaries } from "@/lib/card-learning";
import { dashboardReviewCounts, ensureDailyPlan } from "@/lib/planner";
import { nextReviewCard, reviewQueueProgress, submitReview, type ReviewQueueKind } from "@/lib/review";
import { evaluateAnswer, hasRemoteModelConfig } from "@/lib/ai";
import { getAppSettings } from "@/lib/settings";
import { getInterviewReport, startInterview, answerInterviewTurn } from "@/lib/interview";
import { isCardQuestion } from "@/lib/question-variants";
import type { AnswerComparisonMode, AnswerPoint, Card, CardRelation, RatingName } from "@/lib/types";

export class McpDomainError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable = false, public readonly details: Record<string, unknown> = {}) { super(message); }
}

function requireCard(cardId: string) {
  const card = getCard(cardId);
  if (!card) throw new McpDomainError("NOT_FOUND", "找不到卡片。", false, { cardId });
  return card;
}

function requireUnchanged(card: Card, expectedUpdatedAt: string) {
  if (card.updatedAt !== expectedUpdatedAt) throw new McpDomainError("STALE_WRITE", "卡片已被其他操作更新，请重新读取后再修改。", true, { cardId: card.id, currentUpdatedAt: card.updatedAt });
}

function requireConfirmation(confirmation: { confirmed: boolean; summary: string }) {
  if (!confirmation.confirmed || !confirmation.summary.trim()) throw new McpDomainError("CONFIRMATION_REQUIRED", "此操作会改变学习状态，请先取得用户明确确认。", false);
}

function compactCard(card: Card) {
  return { id: card.id, question: card.question, track: card.track, tags: card.tags, difficulty: card.difficulty, status: card.status, updatedAt: card.updatedAt };
}

function searchable(card: Card) {
  return [card.question, ...card.questionVariants.map((item) => item.content), card.answer, card.note, card.track, ...card.tags].join(" ").toLocaleLowerCase();
}

function encodeCursor(card: Card) { return Buffer.from(JSON.stringify({ updatedAt: card.updatedAt, id: card.id })).toString("base64url"); }
function decodeCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { updatedAt?: unknown; id?: unknown };
    return typeof value.updatedAt === "string" && typeof value.id === "string" ? { updatedAt: value.updatedAt, id: value.id } : null;
  } catch { throw new McpDomainError("VALIDATION_ERROR", "分页游标无效。", false); }
}

export function searchCards(input: { query?: string; track?: string; tags?: string[]; status?: Card["status"]; limit: number; cursor?: string }) {
  const query = input.query?.trim().toLocaleLowerCase() ?? "";
  const wantedTags = new Set(input.tags ?? []);
  const cursor = decodeCursor(input.cursor);
  const all = listCards().filter((card) =>
    (!query || searchable(card).includes(query)) &&
    (!input.track || card.track === input.track) &&
    (!input.status || card.status === input.status) &&
    (!wantedTags.size || card.tags.some((tag) => wantedTags.has(tag))),
  ).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
  const remaining = cursor ? all.filter((card) => card.updatedAt < cursor.updatedAt || (card.updatedAt === cursor.updatedAt && card.id < cursor.id)) : all;
  const cards = remaining.slice(0, input.limit);
  const learning = cardLearningSummaries(cards.map((card) => card.id));
  return { cards: cards.map(compactCard), learning, total: all.length, nextCursor: remaining.length > cards.length && cards.length ? encodeCursor(cards.at(-1)!) : null };
}

export function cardDetails(cardId: string) { const card = requireCard(cardId); return { card, learning: cardLearningDetails(card.id) }; }

export function todayPlan() {
  const tasks = ensureDailyPlan();
  const counts = dashboardReviewCounts();
  return { tasks, totals: { dueReview: counts.dueNow, reviewedToday: counts.reviewedToday, completed: tasks.filter((task) => task.status === "done").length } };
}

export function reviewQueue(kind?: ReviewQueueKind) {
  const kinds: ReviewQueueKind[] = kind ? [kind] : ["initial", "review", "weak"];
  return { progress: reviewQueueProgress(), queues: Object.fromEntries(kinds.map((queueKind) => {
    const result = nextReviewCard(queueKind);
    return [queueKind, { card: result.card ? compactCard(result.card) : null, pending: result.pending }];
  })) };
}

export function createCardDraft(input: { question: string; answerPoints: Array<Omit<AnswerPoint, "id">>; track: string; tags: string[]; relations: CardRelation[]; source?: string }) {
  const answerPoints = input.answerPoints.map((point) => ({ ...point, id: randomUUID() }));
  const card = createCard({ question: input.question, answer: "", answerPoints, track: input.track, tags: input.tags, relations: input.relations, difficulty: 3, source: input.source, status: "draft" });
  return { card, warning: "草稿尚未加入学习队列。" };
}

export function updateCardDraft(input: { cardId: string; expectedUpdatedAt: string; patch: { question: string; answerPoints: AnswerPoint[]; note: string; track: string; tags: string[]; relations: CardRelation[]; questionVariants: Card["questionVariants"]; difficulty: number } }) {
  const card = requireCard(input.cardId);
  requireUnchanged(card, input.expectedUpdatedAt);
  if (card.status !== "draft") throw new McpDomainError("CONFLICT", "只能通过此工具修改草稿卡片。", false);
  const updated = updateCard(card.id, input.patch);
  if (!updated) throw new McpDomainError("NOT_FOUND", "找不到卡片。", false);
  return { card: updated };
}

export function archiveCard(input: { cardId: string; expectedUpdatedAt: string }) {
  const card = requireCard(input.cardId);
  requireUnchanged(card, input.expectedUpdatedAt);
  return { card: updateCardStatus(card.id, "archived") };
}

export function publishCard(input: { cardId: string; expectedUpdatedAt: string; confirmation: { confirmed: boolean; summary: string } }) {
  requireConfirmation(input.confirmation);
  const card = requireCard(input.cardId);
  requireUnchanged(card, input.expectedUpdatedAt);
  if (card.status !== "draft") throw new McpDomainError("CONFLICT", "只有草稿卡可以发布。", false);
  return { card: updateCardStatus(card.id, "learning") };
}

export async function evaluateCardAnswer(input: { cardId: string; presentedQuestion: string; answer: string; comparisonMode?: AnswerComparisonMode }) {
  const card = requireCard(input.cardId);
  if (!isCardQuestion(card, input.presentedQuestion)) throw new McpDomainError("VALIDATION_ERROR", "本次问法不属于这张卡片。", false);
  return { evaluation: await evaluateAnswer({ ...card, question: input.presentedQuestion }, input.answer, input.comparisonMode ?? getAppSettings().answerComparisonMode) };
}

async function withIdempotency<T>(operation: string, key: string, work: () => Promise<T> | T) {
  try { sqlite.prepare("INSERT INTO mcp_idempotency (operation, idempotency_key, created_at) VALUES (?, ?, ?)").run(operation, key, new Date().toISOString()); }
  catch {
    const record = sqlite.prepare("SELECT result FROM mcp_idempotency WHERE operation = ? AND idempotency_key = ?").get(operation, key) as { result: string | null } | undefined;
    if (record?.result) return JSON.parse(record.result) as T;
    throw new McpDomainError("IDEMPOTENCY_CONFLICT", "相同请求正在处理，请稍后重试。", true);
  }
  try {
    const result = await work();
    sqlite.prepare("UPDATE mcp_idempotency SET result = ? WHERE operation = ? AND idempotency_key = ?").run(JSON.stringify(result), operation, key);
    return result;
  } catch (error) {
    sqlite.prepare("DELETE FROM mcp_idempotency WHERE operation = ? AND idempotency_key = ? AND result IS NULL").run(operation, key);
    throw error;
  }
}

export async function submitCardReview(input: { cardId: string; presentedQuestion: string; answer: string; rating: RatingName; comparisonMode?: AnswerComparisonMode; idempotencyKey: string; confirmation: { confirmed: boolean; summary: string } }) {
  requireConfirmation(input.confirmation);
  return withIdempotency("submit_review", input.idempotencyKey, async () => {
    const { evaluation } = await evaluateCardAnswer(input);
    const result = submitReview(input.cardId, input.answer, evaluation.score, evaluation.suggestedRating, input.rating, evaluation.comparison, input.presentedQuestion, evaluation.feedback);
    return { evaluation, ...result };
  });
}

export function capabilities() { return { llmConfigured: hasRemoteModelConfig(), answerComparisonModes: ["embedding", "llm"] }; }
export { getInterviewReport, startInterview };
export async function submitInterviewAnswer(input: { sessionId: string; turnId: string; answer: string; comparisonMode?: AnswerComparisonMode; idempotencyKey: string }) { return withIdempotency("answer_interview_turn", input.idempotencyKey, () => answerInterviewTurn(input)); }
