import "server-only";
import { createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import { getCard } from "@/lib/cards";
import type { AnswerComparison, RatingName } from "@/lib/types";

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
const ratingToEnum: Record<RatingName, Rating> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

function reviveCard(value: string) {
  const card = JSON.parse(value);
  for (const key of ["due", "last_review"]) if (card[key]) card[key] = new Date(card[key]);
  return card;
}

function fallbackSchedule(previous: Record<string, unknown> | undefined, rating: RatingName) {
  const now = new Date();
  const intervals = { again: 10 * 60_000, hard: 24 * 60 * 60_000, good: 3 * 24 * 60 * 60_000, easy: 7 * 24 * 60 * 60_000 };
  return { ...(previous ?? {}), due: new Date(now.getTime() + intervals[rating]), last_review: now };
}

function scheduleCard(current: Record<string, unknown>, rating: RatingName, reviewedAt: Date) {
  try {
    const outcomes = scheduler.repeat(reviveCard(JSON.stringify(current)), reviewedAt) as unknown as Record<Rating, { card: Record<string, unknown> }>;
    return outcomes[ratingToEnum[rating]].card;
  } catch {
    return fallbackSchedule(current, rating);
  }
}

export function initializeReview(cardId: string) {
  const existing = sqlite.prepare("SELECT card_id FROM review_state WHERE card_id = ?").get(cardId);
  if (existing) return;
  const card = createEmptyCard(new Date());
  sqlite.prepare("INSERT INTO review_state (card_id, fsrs_card, due_at) VALUES (?, ?, ?)").run(cardId, JSON.stringify(card), new Date().toISOString());
}

/** Records creating/importing a card as its first Hard FSRS repetition. */
export function recordInitialReview(cardId: string) {
  const existing = sqlite.prepare("SELECT card_id FROM review_state WHERE card_id = ?").get(cardId);
  if (existing) return { card: getCard(cardId), initialized: false };

  const reviewed = new Date();
  const empty = createEmptyCard(reviewed) as unknown as Record<string, unknown>;
  const next = scheduleCard(empty, "hard", reviewed);
  const due = new Date(next.due as string | Date).toISOString();
  const reviewedAt = reviewed.toISOString();
  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO review_state (card_id, fsrs_card, due_at) VALUES (?, ?, ?)").run(cardId, JSON.stringify(next), due);
    sqlite.prepare("INSERT INTO review_logs (id, card_id, response, ai_score, suggested_rating, confirmed_rating, comparison_mode, answer_comparison, next_due_at, is_initial, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), cardId, "系统首次练习初始化", 0, "hard", "hard", null, null, due, 1, reviewedAt);
    sqlite.prepare("UPDATE cards SET status = 'review', updated_at = ? WHERE id = ?").run(reviewedAt, cardId);
  })();
  return { card: getCard(cardId), initialized: true };
}

export function dueCards() {
  const now = new Date().toISOString();
  const rows = sqlite.prepare(`SELECT c.id FROM cards c JOIN review_state r ON r.card_id = c.id WHERE c.status = 'review' AND r.due_at <= ? ORDER BY r.due_at ASC, c.id ASC`).all(now) as Array<{ id: string }>;
  return rows.map((row) => getCard(row.id)).filter(Boolean);
}

export function nextDueReview() {
  const cards = dueCards();
  return { card: cards[0] ?? null, dueCount: cards.length };
}

export function submitReview(cardId: string, response: string, score: number, suggestedRating: RatingName, confirmedRating: RatingName, comparison?: AnswerComparison, presentedQuestion?: string, feedback?: string) {
  initializeReview(cardId);
  const reviewedAt = new Date().toISOString();
  const row = sqlite.prepare("SELECT fsrs_card FROM review_state WHERE card_id = ?").get(cardId) as { fsrs_card: string };
  const next = scheduleCard(JSON.parse(row.fsrs_card), confirmedRating, new Date());
  const due = new Date(next.due as string | Date).toISOString();
  sqlite.prepare("UPDATE review_state SET fsrs_card = ?, due_at = ? WHERE card_id = ?").run(JSON.stringify(next), due, cardId);
  sqlite.prepare("INSERT INTO review_logs (id, card_id, response, ai_score, suggested_rating, confirmed_rating, comparison_mode, answer_comparison, presented_question, feedback, next_due_at, is_initial, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), cardId, response, score, suggestedRating, confirmedRating, comparison?.requestedMode ?? null, comparison ? JSON.stringify(comparison) : null, presentedQuestion ?? null, feedback ?? null, due, 0, reviewedAt);
  return { dueAt: due, card: getCard(cardId) };
}
