import "server-only";
import { cosineSimilarity, embedTexts } from "@/lib/answer-comparison";
import type { AnswerPoint, Card, QuestionVariant } from "@/lib/types";

const RELATED_THRESHOLD = 0.48;
const MAX_RELATED = 6;
const MAX_TAGS = 6;
const vectorCache = new Map<string, number[]>();

export type RecommendationDraft = {
  question: string;
  questionVariants: QuestionVariant[];
  answerPoints: AnswerPoint[];
  note: string;
  track: string;
  tags: string[];
};

export function recommendationText(card: RecommendationDraft) {
  return [card.question, ...card.questionVariants.map((item) => item.content), ...card.answerPoints.map((item) => item.content), card.note, card.track, ...card.tags]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

function cacheKey(card: Card) { return `${card.id}:${card.updatedAt}`; }

async function vectorsFor(cards: Card[], draftText: string) {
  const missing = cards.filter((card) => !vectorCache.has(cacheKey(card)));
  const vectors = await embedTexts([draftText, ...missing.map(recommendationText)]);
  const [draftVector, ...freshVectors] = vectors;
  missing.forEach((card, index) => { const vector = freshVectors[index]; if (vector) vectorCache.set(cacheKey(card), vector); });
  return { draftVector, cardVectors: cards.map((card) => vectorCache.get(cacheKey(card))) };
}

export async function recommendCardMetadata(draft: RecommendationDraft, cards: Card[], excludedCardIds: string[] = []) {
  const draftText = recommendationText(draft);
  if (draftText.length < 3) return { relatedCards: [], tags: [] };
  const excluded = new Set(excludedCardIds);
  const candidates = cards.filter((card) => !excluded.has(card.id));
  if (!candidates.length) return { relatedCards: [], tags: [] };
  const { draftVector, cardVectors } = await vectorsFor(candidates, draftText);
  if (!draftVector) return { relatedCards: [], tags: [] };
  const ranked = candidates.flatMap((card, index) => {
    const vector = cardVectors[index];
    return vector ? [{ card, score: cosineSimilarity(draftVector, vector) }] : [];
  }).filter((item) => item.score >= RELATED_THRESHOLD).sort((left, right) => right.score - left.score);
  const relatedCards = ranked.slice(0, MAX_RELATED).map(({ card, score }) => ({ cardId: card.id, question: card.question, track: card.track, score: Math.round(score * 100) }));
  const existingTags = new Set(draft.tags.map((tag) => tag.toLocaleLowerCase()));
  const tagScores = new Map<string, { label: string; score: number }>();
  for (const { card, score } of ranked.slice(0, 12)) for (const tag of card.tags) {
    if (existingTags.has(tag.toLocaleLowerCase())) continue;
    const previous = tagScores.get(tag.toLocaleLowerCase());
    tagScores.set(tag.toLocaleLowerCase(), { label: previous?.label ?? tag, score: (previous?.score ?? 0) + score });
  }
  const tags = [...tagScores.values()].sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "zh-CN")).slice(0, MAX_TAGS).map((tag) => tag.label);
  return { relatedCards, tags };
}
