import "server-only";
import { createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import { getCard, listCards, updateCardStatus } from "@/lib/cards";
import { nextShanghaiMorning, todayShanghai } from "@/lib/utils";
import { completeTodayTaskForCard } from "@/lib/planner";
import { clearPriorityPractice, focusedCards, isPriorityPractice } from "@/lib/practice-focus";
import { refreshDailyLearningReport } from "@/lib/daily-reports";
import type { AnswerComparison, Card, RatingName } from "@/lib/types";

export type ReviewQueueKind = "initial" | "review" | "weak";
export type QueueProgress = { pending: number; completedToday: number };
export type ReviewQueueProgress = Record<ReviewQueueKind, QueueProgress>;

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

/** Creates a blank FSRS state when one was not prepared by the initial-study flow. */
export function initializeReview(cardId: string) {
  const existing = sqlite.prepare("SELECT card_id FROM review_state WHERE card_id = ?").get(cardId);
  if (existing) return false;
  const card = createEmptyCard(new Date());
  sqlite.prepare("INSERT INTO review_state (card_id, fsrs_card, due_at) VALUES (?, ?, ?)").run(cardId, JSON.stringify(card), new Date().toISOString());
  return true;
}

function hasRealPractice(cardId: string) {
  return Boolean(sqlite.prepare("SELECT id FROM review_logs WHERE card_id = ? LIMIT 1").get(cardId));
}

/** Marks a card as studied without treating reading as a scored review. Safe to retry. */
export function completeInitialStudy(cardId: string) {
  const card = getCard(cardId);
  if (!card) throw new Error("找不到卡片。");
  const existing = sqlite.prepare("SELECT completed_at FROM initial_study_logs WHERE card_id = ?").get(cardId) as { completed_at: string } | undefined;
  if (existing) {
    const state = sqlite.prepare("SELECT due_at FROM review_state WHERE card_id = ?").get(cardId) as { due_at: string } | undefined;
    return { dueAt: state?.due_at ?? null, card };
  }
  if (card.status !== "learning") throw new Error("这张卡片已不在首次学习队列中。");
  const completedAt = new Date().toISOString();
  const dueAt = nextShanghaiMorning(new Date(completedAt));
  const fsrsCard = createEmptyCard(new Date(completedAt)) as unknown as Record<string, unknown>;
  fsrsCard.due = new Date(dueAt);
  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO initial_study_logs (card_id, completed_at) VALUES (?, ?)").run(cardId, completedAt);
    sqlite.prepare("INSERT INTO review_state (card_id, fsrs_card, due_at) VALUES (?, ?, ?)").run(cardId, JSON.stringify(fsrsCard), dueAt);
    sqlite.prepare("UPDATE cards SET status = 'review', updated_at = ? WHERE id = ?").run(completedAt, cardId);
    completeTodayTaskForCard(cardId, "learn");
  })();
  refreshDailyLearningReport();
  return { dueAt, card: getCard(cardId) };
}

export function initialCards() {
  return listCards().filter((card) => card.status === "learning").sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export function dueCards() {
  const now = new Date().toISOString();
  const rows = sqlite.prepare(`SELECT c.id FROM cards c JOIN review_state r ON r.card_id = c.id WHERE c.status = 'review' AND r.due_at <= ? ORDER BY r.due_at ASC, c.id ASC`).all(now) as Array<{ id: string }>;
  return rows.map((row) => getCard(row.id)).filter((card): card is Card => Boolean(card));
}

export function reviewQueueProgress(): ReviewQueueProgress {
  const initial = sqlite.prepare("SELECT COUNT(*) AS count FROM cards WHERE status = 'learning'").get() as { count: number };
  const review = sqlite.prepare("SELECT COUNT(*) AS count FROM cards c JOIN review_state r ON r.card_id = c.id WHERE c.status = 'review' AND r.due_at <= ?").get(new Date().toISOString()) as { count: number };
  const weak = focusedCards("weak").length;
  // The session progress mirrors today's restartable plan, rather than all
  // historical activity recorded since midnight. A plan restart can therefore
  // genuinely reset the displayed progress without deleting learning history.
  const completed = sqlite.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'learn' AND status = 'done' THEN 1 ELSE 0 END), 0) AS initial_count,
      COALESCE(SUM(CASE WHEN kind = 'review' AND status = 'done' THEN 1 ELSE 0 END), 0) AS review_count
    FROM daily_tasks
    WHERE plan_date = ?
  `).get(todayShanghai()) as { initial_count: number; review_count: number };
  return {
    initial: { pending: Number(initial.count), completedToday: Number(completed.initial_count) },
    review: { pending: Number(review.count), completedToday: Number(completed.review_count) },
    weak: { pending: weak, completedToday: 0 },
  };
}

export function nextReviewCard(kind: ReviewQueueKind, requestedCardId?: string | null) {
  const base = kind === "initial" ? initialCards() : kind === "review" ? dueCards() : focusedCards("weak");
  const cards = kind === "weak" ? base : [...base.filter((card) => isPriorityPractice(card.id)), ...base.filter((card) => !isPriorityPractice(card.id))];
  return { card: (requestedCardId ? cards.find((card) => card.id === requestedCardId) : undefined) ?? cards[0] ?? null, pending: cards.length, progress: reviewQueueProgress() };
}

export function submitReview(cardId: string, response: string, score: number, suggestedRating: RatingName, confirmedRating: RatingName, comparison?: AnswerComparison, presentedQuestion?: string, feedback?: string) {
  const isInitial = !hasRealPractice(cardId);
  initializeReview(cardId);
  const reviewedAt = new Date().toISOString();
  const row = sqlite.prepare("SELECT fsrs_card FROM review_state WHERE card_id = ?").get(cardId) as { fsrs_card: string };
  const next = scheduleCard(JSON.parse(row.fsrs_card), confirmedRating, new Date());
  const due = new Date(next.due as string | Date).toISOString();
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE review_state SET fsrs_card = ?, due_at = ? WHERE card_id = ?").run(JSON.stringify(next), due, cardId);
    sqlite.prepare("INSERT INTO review_logs (id, card_id, response, ai_score, suggested_rating, confirmed_rating, comparison_mode, answer_comparison, presented_question, feedback, next_due_at, is_initial, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), cardId, response, score, suggestedRating, confirmedRating, comparison?.requestedMode ?? null, comparison ? JSON.stringify(comparison) : null, presentedQuestion ?? null, feedback ?? null, due, isInitial ? 1 : 0, reviewedAt);
    updateCardStatus(cardId, "review");
    completeTodayTaskForCard(cardId, "review");
    clearPriorityPractice(cardId);
  })();
  refreshDailyLearningReport();
  return { dueAt: due, card: getCard(cardId), isInitial };
}
