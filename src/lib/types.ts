export type CardStatus = "draft" | "learning" | "review" | "archived";
export type TaskKind = "review" | "learn" | "interview" | "knowledge";
export type TaskStatus = "todo" | "done" | "skipped";
export type RatingName = "again" | "hard" | "good" | "easy";
export type AnswerComparisonMode = "embedding" | "llm";
export type AnswerComparisonSource = "embedding" | "lexical" | "llm";
export type AnswerPointCoverage = "covered" | "partial" | "missing";

export interface AnswerPoint {
  id: string;
  content: string;
  hint: string;
  note: string;
}

export interface QuestionVariant {
  id: string;
  content: string;
  source: "manual" | "ai";
}

export interface Card {
  id: string;
  question: string;
  questionVariants: QuestionVariant[];
  answer: string;
  answerPoints: AnswerPoint[];
  note: string;
  track: string;
  tags: string[];
  difficulty: number;
  source?: string | null;
  status: CardStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CardLearningSummary {
  cardId: string;
  nextReviewAt: string | null;
  lastReviewAt: string | null;
  reviewCount: number;
  answerCount: number;
  averageScore: number | null;
  fsrsDifficulty: number | null;
}

export interface CardLearningHistoryPoint {
  reviewedAt: string;
  score: number | null;
  rating: RatingName;
  nextReviewAt: string | null;
  intervalMinutes: number | null;
  isInitial: boolean;
}

export interface DailyTask {
  id: string;
  planDate: string;
  kind: TaskKind;
  title: string;
  detail?: string | null;
  cardId?: string | null;
  estimateMinutes: number;
  status: TaskStatus;
}

export interface Evaluation {
  score: number;
  suggestedRating: RatingName;
  feedback: string;
  covered: string[];
  gaps: string[];
  comparison: AnswerComparison;
}

export interface AnswerEvidence {
  text: string;
  start: number;
  end: number;
  score?: number;
}

export interface AnswerPointComparison {
  answerPointId: string;
  reference: string;
  status: AnswerPointCoverage;
  score: number;
  evidence: AnswerEvidence[];
}

export interface AnswerComparison {
  requestedMode: AnswerComparisonMode;
  source: AnswerComparisonSource;
  points: AnswerPointComparison[];
  warning?: string;
}

export interface LatestPracticeRecord {
  reviewedAt: string;
  presentedQuestion: string | null;
  response: string;
  score: number;
  feedback: string | null;
  suggestedRating: RatingName;
  confirmedRating: RatingName;
  nextReviewAt: string | null;
  comparisonMode: AnswerComparisonMode | null;
  comparison: AnswerComparison | null;
}

export interface CardLearningDetails extends CardLearningSummary {
  history: CardLearningHistoryPoint[];
  latestPractice: LatestPracticeRecord | null;
}
