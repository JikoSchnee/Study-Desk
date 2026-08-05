import "server-only";
import { randomUUID } from "node:crypto";
import type { AnswerComparisonMode, Evaluation } from "@/lib/types";

const TTL_MS = 15 * 60_000;

type CachedEvaluation = {
  evaluation: Evaluation;
  cardId: string;
  presentedQuestion: string;
  answer: string;
  comparisonMode: AnswerComparisonMode;
  expiresAt: number;
};

const cache = new Map<string, CachedEvaluation>();

function discardExpired(now = Date.now()) {
  for (const [id, value] of cache) if (value.expiresAt <= now) cache.delete(id);
}

/** Keeps the expensive evaluation available while the learner chooses a rating. */
export function cacheReviewEvaluation(input: Omit<CachedEvaluation, "expiresAt">) {
  discardExpired();
  const id = randomUUID();
  cache.set(id, { ...input, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function getCachedReviewEvaluation(id: string | undefined, input: Omit<CachedEvaluation, "evaluation" | "expiresAt">) {
  if (!id) return null;
  const value = cache.get(id);
  if (!value || value.expiresAt <= Date.now()) { cache.delete(id); return null; }
  return value.cardId === input.cardId
    && value.presentedQuestion === input.presentedQuestion
    && value.answer === input.answer
    && value.comparisonMode === input.comparisonMode
    ? value.evaluation
    : null;
}
