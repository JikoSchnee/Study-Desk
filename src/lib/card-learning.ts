import "server-only";
import { sqlite } from "@/lib/db";
import type { AnswerComparison, AnswerComparisonMode, CardLearningDetails, CardLearningHistoryPoint, CardLearningSummary, LatestPracticeRecord, RatingName } from "@/lib/types";

type SummaryRow = {
  card_id: string;
  initial_study_at: string | null;
  due_at: string | null;
  last_review_at: string | null;
  practice_count: number;
  review_count: number;
  has_initial_practice: number;
  average_score: number | null;
  fsrs_card: string | null;
};

type HistoryRow = {
  created_at: string;
  ai_score: number;
  confirmed_rating: RatingName;
  next_due_at: string | null;
  is_initial: number;
};

type LatestPracticeRow = {
  created_at: string;
  is_initial: number;
  presented_question: string | null;
  response: string;
  ai_score: number;
  feedback: string | null;
  suggested_rating: RatingName;
  confirmed_rating: RatingName;
  next_due_at: string | null;
  comparison_mode: string | null;
  answer_comparison: string | null;
};

function comparisonFromStored(value: string | null): AnswerComparison | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as AnswerComparison;
    return Array.isArray(parsed.points) && ["embedding", "lexical", "llm"].includes(parsed.source) ? parsed : null;
  } catch { return null; }
}

function fsrsDifficulty(value: string | null): number | null {
  if (!value) return null;
  try {
    const difficulty = Number((JSON.parse(value) as { difficulty?: unknown }).difficulty);
    return Number.isFinite(difficulty) && difficulty >= 1 && difficulty <= 10 ? difficulty : null;
  } catch { return null; }
}

function summaryFrom(row: SummaryRow): CardLearningSummary {
  return {
    cardId: row.card_id,
    initialStudyAt: row.initial_study_at,
    nextReviewAt: row.due_at,
    lastReviewAt: row.last_review_at,
    practiceCount: Number(row.practice_count),
    reviewCount: Number(row.review_count),
    hasInitialPractice: Boolean(row.has_initial_practice),
    averageScore: row.average_score === null ? null : Math.round(Number(row.average_score)),
    fsrsDifficulty: fsrsDifficulty(row.fsrs_card),
  };
}

export function cardLearningSummaries(cardIds: string[]): Record<string, CardLearningSummary> {
  if (!cardIds.length) return {};
  const placeholders = cardIds.map(() => "?").join(", ");
  const rows = sqlite.prepare(`
    SELECT c.id AS card_id, s.completed_at AS initial_study_at, r.due_at, r.fsrs_card, MAX(l.created_at) AS last_review_at,
      COUNT(l.id) AS practice_count, SUM(CASE WHEN l.is_initial = 0 THEN 1 ELSE 0 END) AS review_count,
      MAX(CASE WHEN l.is_initial = 1 THEN 1 ELSE 0 END) AS has_initial_practice,
      AVG(l.ai_score) AS average_score
    FROM cards c
    LEFT JOIN initial_study_logs s ON s.card_id = c.id
    LEFT JOIN review_state r ON r.card_id = c.id
    LEFT JOIN review_logs l ON l.card_id = c.id
    WHERE c.id IN (${placeholders})
    GROUP BY c.id, s.completed_at, r.due_at
  `).all(...cardIds) as SummaryRow[];
  return Object.fromEntries(rows.map((row) => {
    const summary = summaryFrom(row);
    return [summary.cardId, summary];
  }));
}

export function cardLearningDetails(cardId: string): CardLearningDetails {
  const summary = cardLearningSummaries([cardId])[cardId] ?? {
    cardId,
    initialStudyAt: null,
    nextReviewAt: null,
    lastReviewAt: null,
    practiceCount: 0,
    reviewCount: 0,
    hasInitialPractice: false,
    averageScore: null,
    fsrsDifficulty: null,
  };
  const rows = sqlite.prepare(`
    SELECT created_at, ai_score, confirmed_rating, next_due_at, is_initial
    FROM review_logs
    WHERE card_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(cardId) as HistoryRow[];
  const history: CardLearningHistoryPoint[] = rows.reverse().map((row) => {
    const reviewed = new Date(row.created_at).getTime();
    const due = row.next_due_at ? new Date(row.next_due_at).getTime() : Number.NaN;
    return {
      reviewedAt: row.created_at,
      score: row.ai_score,
      rating: row.confirmed_rating,
      nextReviewAt: row.next_due_at,
      intervalMinutes: Number.isFinite(due) && Number.isFinite(reviewed) ? Math.max(0, Math.round((due - reviewed) / 60_000)) : null,
      isInitial: Boolean(row.is_initial),
    };
  });
  const latest = sqlite.prepare(`
    SELECT created_at, is_initial, presented_question, response, ai_score, feedback, suggested_rating, confirmed_rating,
      next_due_at, comparison_mode, answer_comparison
    FROM review_logs
    WHERE card_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(cardId) as LatestPracticeRow | undefined;
  const latestPractice: LatestPracticeRecord | null = latest ? {
    reviewedAt: latest.created_at,
    isInitial: Boolean(latest.is_initial),
    presentedQuestion: latest.presented_question,
    response: latest.response,
    score: latest.ai_score,
    feedback: latest.feedback,
    suggestedRating: latest.suggested_rating,
    confirmedRating: latest.confirmed_rating,
    nextReviewAt: latest.next_due_at,
    comparisonMode: latest.comparison_mode === "embedding" || latest.comparison_mode === "llm" ? latest.comparison_mode as AnswerComparisonMode : null,
    comparison: comparisonFromStored(latest.answer_comparison),
  } : null;
  return { ...summary, history, latestPractice };
}
