import type { Card, CardLearningSummary } from "@/lib/types";

export const difficultyTiers = [
  { label: "N", min: 1, max: 2.8 },
  { label: "R", min: 2.8, max: 4.6 },
  { label: "SR", min: 4.6, max: 6.4 },
  { label: "SSR", min: 6.4, max: 8.2 },
  { label: "UR", min: 8.2, max: 10.000001 },
] as const;

export type CardSort = "updated" | "created" | "review" | "practice" | "difficulty";
export type SortDirection = "asc" | "desc";

export type CardFilterState = {
  query: string;
  track: string;
  tags: Set<string>;
  sort: CardSort;
  direction: SortDirection;
};

export function difficultyTier(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 1 || value > 10) return null;
  return difficultyTiers.find((tier) => value >= tier.min && value < tier.max) ?? difficultyTiers.at(-1)!;
}

function searchableText(card: Card) {
  return [
    card.question,
    ...card.questionVariants.map((variant) => variant.content),
    card.answer,
    ...card.answerPoints.flatMap((point) => [point.content, point.hint, point.note]),
    card.note,
    card.track,
    ...card.tags,
  ].join(" ").toLocaleLowerCase();
}

function compareOptional(left: string | null | undefined, right: string | null | undefined, direction: SortDirection) {
  const leftTime = left ? new Date(left).getTime() : Number.NaN;
  const rightTime = right ? new Date(right).getTime() : Number.NaN;
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);
  if (!leftValid || !rightValid) return leftValid === rightValid ? 0 : leftValid ? -1 : 1;
  return (leftTime - rightTime) * (direction === "asc" ? 1 : -1);
}

function compareDifficulty(left: number | null | undefined, right: number | null | undefined, direction: SortDirection) {
  const leftValid = left !== null && left !== undefined && Number.isFinite(left);
  const rightValid = right !== null && right !== undefined && Number.isFinite(right);
  if (!leftValid || !rightValid) return leftValid === rightValid ? 0 : leftValid ? -1 : 1;
  return (left! - right!) * (direction === "asc" ? 1 : -1);
}

export function filterAndSortCards(cards: Card[], learning: Record<string, CardLearningSummary>, filters: CardFilterState) {
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered = cards.filter((card) => {
    if (query && !searchableText(card).includes(query)) return false;
    if (filters.track && card.track !== filters.track) return false;
    return !filters.tags.size || card.tags.some((tag) => filters.tags.has(tag));
  });
  return filtered.slice().sort((left, right) => {
    const leftLearning = learning[left.id];
    const rightLearning = learning[right.id];
    if (filters.sort === "updated") return compareOptional(left.updatedAt, right.updatedAt, filters.direction);
    if (filters.sort === "created") return compareOptional(left.createdAt, right.createdAt, filters.direction);
    if (filters.sort === "review") return compareOptional(leftLearning?.nextReviewAt, rightLearning?.nextReviewAt, filters.direction);
    if (filters.sort === "practice") return compareOptional(leftLearning?.lastReviewAt, rightLearning?.lastReviewAt, filters.direction);
    return compareDifficulty(leftLearning?.fsrsDifficulty, rightLearning?.fsrsDifficulty, filters.direction);
  });
}
