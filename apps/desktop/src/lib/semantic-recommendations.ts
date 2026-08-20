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

export type CardRecommendation = { cardId: string; question: string; track: string; score: number };
export type CardRecommendationResult = { relatedCards: CardRecommendation[]; tags: string[] };

export function recommendationText(card: RecommendationDraft) {
  return [card.question, ...card.questionVariants.map((item) => item.content), ...card.answerPoints.map((item) => item.content), card.note, card.track, ...card.tags]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

function cacheKey(card: Card) { return `${card.id}:${card.updatedAt}`; }

async function vectorsForCards(cards: Card[]) {
  const missing = cards.filter((card) => !vectorCache.has(cacheKey(card)));
  if (missing.length) {
    const freshVectors = await embedTexts(missing.map(recommendationText));
    missing.forEach((card, index) => { const vector = freshVectors[index]; if (vector) vectorCache.set(cacheKey(card), vector); });
  }
  return cards.map((card) => vectorCache.get(cacheKey(card)));
}

function recommendationsFromVector(draft: RecommendationDraft, draftVector: number[] | undefined, candidates: Card[], cardVectors: Array<number[] | undefined>): CardRecommendationResult {
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

function excludedCards(cards: Card[], excludedCardIds: string[]) {
  const excluded = new Set(excludedCardIds);
  return cards.filter((card) => !excluded.has(card.id));
}

export async function preloadCardRecommendations(cards: Card[], cardIds: string[]): Promise<Record<string, CardRecommendationResult>> {
  const targets = cardIds.flatMap((id) => {
    const card = cards.find((item) => item.id === id);
    return card ? [card] : [];
  });
  if (!targets.length) return {};

  const cardVectors = await vectorsForCards(cards);
  const vectorByCardId = new Map(cards.map((card, index) => [card.id, cardVectors[index]]));
  return Object.fromEntries(targets.map((card) => {
    const candidates = excludedCards(cards, [card.id, ...card.relations.map((relation) => relation.cardId)]);
    return [card.id, recommendationsFromVector(card, vectorByCardId.get(card.id), candidates, candidates.map((candidate) => vectorByCardId.get(candidate.id)))];
  }));
}

export async function recommendCardMetadata(draft: RecommendationDraft, cards: Card[], excludedCardIds: string[] = []): Promise<CardRecommendationResult> {
  const draftText = recommendationText(draft);
  if (draftText.length < 3) return { relatedCards: [], tags: [] };
  const candidates = excludedCards(cards, excludedCardIds);
  if (!candidates.length) return { relatedCards: [], tags: [] };
  const [draftVector] = await embedTexts([draftText]);
  const cardVectors = await vectorsForCards(candidates);
  return recommendationsFromVector(draft, draftVector, candidates, cardVectors);
}
