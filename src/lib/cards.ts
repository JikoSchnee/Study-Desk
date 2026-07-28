import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import { parseTags, toTags } from "@/lib/utils";
import { answerFromPoints, answerPointsFromStored, answerPointsToJson, hasCoreAnswerPoint, previewImport } from "@/lib/import";
import { allQuestionTexts, findQuestionCollision, normalizeQuestionVariants, questionVariantsFromStored, questionVariantsToJson } from "@/lib/question-variants";
import { findSimilarImportQuestions } from "@/lib/import-similarity";
import type { AnswerPoint, Card, CardStatus, QuestionVariant } from "@/lib/types";

type CardRow = Omit<Card, "tags" | "createdAt" | "updatedAt" | "answerPoints" | "questionVariants"> & { answer_points?: string; question_variants?: string; note?: string; tags: string; created_at: string; updated_at: string };

function mapCard(row: CardRow): Card {
  return {
    id: row.id, question: row.question, questionVariants: normalizeQuestionVariants(row.question, questionVariantsFromStored(row.question_variants)), answer: row.answer, answerPoints: answerPointsFromStored(row.answer_points, row.answer), note: row.note ?? "", track: row.track, tags: parseTags(row.tags), difficulty: row.difficulty,
    source: row.source, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function listCards(): Card[] {
  return (sqlite.prepare("SELECT * FROM cards ORDER BY updated_at DESC").all() as CardRow[]).map(mapCard);
}

export function getCard(id: string): Card | undefined {
  const row = sqlite.prepare("SELECT * FROM cards WHERE id = ?").get(id) as CardRow | undefined;
  return row ? mapCard(row) : undefined;
}

type CardInput = Pick<Card, "question" | "answer" | "track" | "tags" | "difficulty"> & { questionVariants?: QuestionVariant[]; answerPoints?: AnswerPoint[]; note?: string; source?: string; status?: CardStatus; allowQuestionCollision?: boolean };

function existingQuestionTexts(excludeCardId?: string) {
  return listCards().filter((card) => card.id !== excludeCardId).flatMap(allQuestionTexts);
}

export function createCard(input: CardInput) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const answerPoints = input.answerPoints?.filter((point) => point.content.trim()).length ? input.answerPoints : answerPointsFromStored(null, input.answer);
  if (!hasCoreAnswerPoint(answerPoints)) throw new Error("请至少填写一条核心答案要点。");
  const answer = answerFromPoints(answerPoints);
  const question = input.question.trim().replace(/\s+/g, " ");
  const questionVariants = normalizeQuestionVariants(question, input.questionVariants ?? []);
  const collision = findQuestionCollision(question, questionVariants, existingQuestionTexts());
  if (collision && !input.allowQuestionCollision) throw new Error(`问法“${collision}”已存在于其他卡片。`);
  sqlite.prepare("INSERT INTO cards (id, question, question_variants, answer, answer_points, note, track, tags, difficulty, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, question, questionVariantsToJson(question, questionVariants), answer, answerPointsToJson(answerPoints), input.note?.trim() ?? "", input.track, toTags(input.tags), input.difficulty, input.source ?? null, input.status ?? "learning", now, now);
  return getCard(id)!;
}

export function createTutorialCard() {
  return createCard({
    question: "演示：RAG 为什么需要重排序？",
    answer: "重排序会对初步检索结果做更精细的相关性判断\n把最相关的资料排到上下文前面\n减少无关内容对生成答案的干扰",
    answerPoints: [
      { id: randomUUID(), content: "初步检索通常只做快速召回，相关性排序不够精细。", hint: "先召回，再精排", note: "" },
      { id: randomUUID(), content: "重排序模型会重新判断 query 与候选资料的语义相关性。", hint: "相关性判断", note: "" },
      { id: randomUUID(), content: "把高相关资料放在前面，可以提升上下文质量和最终回答准确性。", hint: "减少噪声", note: "" },
    ],
    track: "演示", tags: ["演示", "RAG"], difficulty: 2, source: "tutorial", status: "learning", allowQuestionCollision: true,
    note: "基础教程自动创建的演示卡；可在教程最后从卡片库归档或永久删除。",
  });
}

export function updateCard(id: string, input: Pick<Card, "question" | "questionVariants" | "answerPoints" | "note" | "track" | "tags" | "difficulty">) {
  const card = getCard(id);
  if (!card) return undefined;
  const question = input.question.trim().replace(/\s+/g, " ");
  const questionVariants = normalizeQuestionVariants(question, input.questionVariants);
  const answerPoints = input.answerPoints.filter((point) => point.content.trim());
  if (!hasCoreAnswerPoint(answerPoints)) throw new Error("请至少填写一条核心答案要点。");
  const collision = findQuestionCollision(question, questionVariants, existingQuestionTexts(id));
  if (collision && card.source !== "tutorial") throw new Error(`问法“${collision}”已存在于其他卡片。`);
  sqlite.prepare("UPDATE cards SET question = ?, question_variants = ?, answer = ?, answer_points = ?, note = ?, track = ?, tags = ?, difficulty = ?, updated_at = ? WHERE id = ?")
    .run(question, questionVariantsToJson(question, questionVariants), answerFromPoints(answerPoints), answerPointsToJson(answerPoints), input.note.trim(), input.track, toTags(input.tags), input.difficulty, new Date().toISOString(), id);
  return getCard(id);
}

export function updateCardStatus(id: string, status: CardStatus) {
  sqlite.prepare("UPDATE cards SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  return getCard(id);
}

export function updateCardsBulk(ids: string[], action: "archive" | "restore" | "move" | "addTags", value?: string | string[]) {
  const unique = [...new Set(ids)];
  const now = new Date().toISOString();
  const transaction = sqlite.transaction(() => {
    for (const id of unique) {
      const card = getCard(id);
      if (!card) continue;
      if (action === "archive") sqlite.prepare("UPDATE cards SET status = 'archived', updated_at = ? WHERE id = ?").run(now, id);
      if (action === "restore") sqlite.prepare("UPDATE cards SET status = CASE WHEN EXISTS (SELECT 1 FROM review_state WHERE card_id = ?) THEN 'review' ELSE 'learning' END, updated_at = ? WHERE id = ?").run(id, now, id);
      if (action === "move" && typeof value === "string" && value.trim()) sqlite.prepare("UPDATE cards SET track = ?, updated_at = ? WHERE id = ?").run(value.trim(), now, id);
      if (action === "addTags" && Array.isArray(value)) sqlite.prepare("UPDATE cards SET tags = ?, updated_at = ? WHERE id = ?").run(toTags([...new Set([...card.tags, ...value.map((tag) => tag.trim()).filter(Boolean)])]), now, id);
    }
  });
  transaction();
  return unique.map(getCard).filter(Boolean);
}

export function permanentlyDeleteCards(ids: string[]) {
  const unique = [...new Set(ids)];
  const transaction = sqlite.transaction(() => {
    for (const id of unique) {
      sqlite.prepare("DELETE FROM practice_focus WHERE card_id = ?").run(id);
      sqlite.prepare("DELETE FROM review_state WHERE card_id = ?").run(id);
      sqlite.prepare("DELETE FROM review_logs WHERE card_id = ?").run(id);
      sqlite.prepare("DELETE FROM daily_tasks WHERE card_id = ?").run(id);
      sqlite.prepare("DELETE FROM interview_turns WHERE card_id = ?").run(id);
      sqlite.prepare("DELETE FROM knowledge_maintenance_proposals WHERE card_id = ?").run(id);
      sqlite.prepare("DELETE FROM knowledge_sync_records WHERE card_id = ?").run(id);
      sqlite.prepare("DELETE FROM cards WHERE id = ?").run(id);
    }
  });
  transaction();
  return unique.length;
}

export async function importCards(raw: Array<Pick<Card, "question" | "answer" | "track" | "tags" | "difficulty"> & { questionVariants?: QuestionVariant[]; answerPoints?: AnswerPoint[] }>) {
  const existingCards = listCards();
  const normalized = raw.map((card) => ({ ...card, answer: card.answer || answerFromPoints(card.answerPoints ?? []) }));
  const preview = previewImport(normalized, existingCards.flatMap(allQuestionTexts));
  const similar = await findSimilarImportQuestions(normalized, existingCards);
  const pointsByQuestion = new Map(raw.map((card) => [card.question.trim().toLowerCase(), card.answerPoints]));
  const rejected = [...preview.rejected];
  const accepted = preview.accepted.flatMap((card) => {
    const index = normalized.findIndex((item) => item.question === card.question && item.answer === card.answer);
    const match = similar.get(index);
    if (match) {
      rejected.push({ question: card.question, reason: `与${match.source === "library" ? "题库" : "本次导入"}问题“${match.question}”语义相似度 ${Math.round(match.score * 100)}%` });
      return [];
    }
    return [createCard({ ...card, answerPoints: pointsByQuestion.get(card.question.trim().toLowerCase()) })];
  });
  return { accepted, rejected };
}
