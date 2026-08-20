export type CardStatus = "draft" | "learning" | "review" | "archived";
export type TaskKind = "review" | "learn" | "interview" | "knowledge";
export type TaskStatus = "todo" | "done" | "skipped";
export type RatingName = "again" | "hard" | "good" | "easy";
export type AnswerComparisonMode = "embedding" | "llm";
export type EmbeddingModelSource = "automatic" | "offline";
export type TagDisplayLanguage = "zh" | "en" | "both";

export interface Tag {
  id: string;
  /** Stable value stored on cards; never shown directly to users. */
  key: string;
  chinese: string;
  english: string;
  usageCount?: number;
}
export type AnswerComparisonSource = "embedding" | "lexical" | "llm";
export type AnswerPointCoverage = "covered" | "partial" | "missing";
export type AnswerPointRole = "opening" | "key" | "closing";

export interface AnswerPoint {
  id: string;
  content: string;
  hint: string;
  note: string;
  role?: AnswerPointRole;
  /** A core point may belong to one top-level core point. */
  parentId?: string;
}

export interface QuestionVariant {
  id: string;
  content: string;
  source: "manual" | "ai";
}

export type CardRelationType = "related" | "parent" | "child";

export interface CardRelation {
  cardId: string;
  type: CardRelationType;
}

export interface FollowUpCardDraft {
  question: string;
  questionVariants: QuestionVariant[];
  answerPoints: AnswerPoint[];
  note: string;
  track: string;
  tags: string[];
  sourceCardId: string;
  relationType: CardRelationType;
}

export interface Card {
  id: string;
  question: string;
  questionVariants: QuestionVariant[];
  relations: CardRelation[];
  answer: string;
  answerPoints: AnswerPoint[];
  note: string;
  track: string;
  knowledgeBaseId?: string;
  knowledgeBase?: Pick<KnowledgeBase, "id" | "name">;
  tags: string[];
  difficulty: number;
  source?: string | null;
  status: CardStatus;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudyPlan {
  id: string;
  name: string;
  description: string;
  knowledgeBaseIds: string[];
  knowledgeBases: Array<Pick<KnowledgeBase, "id" | "name" | "cardCount">>;
  createdAt: string;
  updatedAt: string;
}

export interface CardLearningSummary {
  cardId: string;
  initialStudyAt: string | null;
  nextReviewAt: string | null;
  lastReviewAt: string | null;
  practiceCount: number;
  reviewCount: number;
  hasInitialPractice: boolean;
  averageScore: number | null;
  fsrsDifficulty: number | null;
  fsrsStability: number | null;
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
  studyPlanId?: string | null;
  estimateMinutes: number;
  status: TaskStatus;
  completedAt?: string | null;
}

export type DailyReportItem = {
  taskId: string;
  cardId: string | null;
  question: string;
  kind: "learn" | "review";
  completedAt: string;
  score: number | null;
  rating: RatingName | null;
  feedback: string | null;
  nextReviewAt: string | null;
};

export type DailyLearningReport = {
  date: string;
  total: number;
  initialCount: number;
  reviewCount: number;
  averageScore: number | null;
  items: DailyReportItem[];
};

export interface Evaluation {
  score: number;
  suggestedRating: RatingName;
  feedback: string;
  covered?: string[];
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
  role?: AnswerPointRole;
  parentId?: string;
  weight?: number;
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
  isInitial: boolean;
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
