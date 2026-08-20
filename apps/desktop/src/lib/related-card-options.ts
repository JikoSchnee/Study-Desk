import type { Card } from "@/lib/types";

type ScoredRecommendation = { cardId: string; score: number };

export function rankRelatedCardOptions(cards: Card[], query: string, recommendations: ScoredRecommendation[]) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const scores = new Map(recommendations.map((card) => [card.cardId, card.score]));
  return cards
    .filter((card) => `${card.question} ${card.track} ${card.tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      const leftScore = scores.get(left.id);
      const rightScore = scores.get(right.id);
      if (leftScore !== undefined && rightScore !== undefined) return rightScore - leftScore;
      if (leftScore !== undefined) return -1;
      if (rightScore !== undefined) return 1;
      return 0;
    })
    .slice(0, 8)
    .map((card) => ({ card, score: scores.get(card.id) }));
}
