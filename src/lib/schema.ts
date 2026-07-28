import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  questionVariants: text("question_variants").notNull().default("[]"),
  answer: text("answer").notNull(),
  answerPoints: text("answer_points").notNull().default("[]"),
  note: text("note").notNull().default(""),
  track: text("track").notNull(),
  tags: text("tags").notNull(),
  difficulty: integer("difficulty").notNull(),
  source: text("source"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const cardRelations = sqliteTable("card_relations", {
  cardId: text("card_id").notNull(),
  relatedCardId: text("related_card_id").notNull(),
  relationType: text("relation_type").notNull().default("related"),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.cardId, table.relatedCardId] })]);

export const reviewState = sqliteTable("review_state", {
  cardId: text("card_id").primaryKey(),
  fsrsCard: text("fsrs_card").notNull(),
  dueAt: text("due_at").notNull(),
});

export const reviewLogs = sqliteTable("review_logs", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  response: text("response").notNull(),
  aiScore: integer("ai_score").notNull(),
  suggestedRating: text("suggested_rating").notNull(),
  confirmedRating: text("confirmed_rating").notNull(),
  comparisonMode: text("comparison_mode"),
  answerComparison: text("answer_comparison"),
  presentedQuestion: text("presented_question"),
  feedback: text("feedback"),
  nextDueAt: text("next_due_at"),
  isInitial: integer("is_initial").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const dailyPlans = sqliteTable("daily_plans", {
  date: text("date").primaryKey(),
  budgetMinutes: integer("budget_minutes").notNull(),
  createdAt: text("created_at").notNull(),
});

export const dailyTasks = sqliteTable("daily_tasks", {
  id: text("id").primaryKey(),
  planDate: text("plan_date").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  cardId: text("card_id"),
  estimateMinutes: integer("estimate_minutes").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const interviewSessions = sqliteTable("interview_sessions", {
  id: text("id").primaryKey(),
  config: text("config").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

export const interviewTurns = sqliteTable("interview_turns", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  cardId: text("card_id"),
  question: text("question").notNull(),
  answer: text("answer"),
  score: integer("score"),
  feedback: text("feedback"),
  comparisonMode: text("comparison_mode"),
  answerComparison: text("answer_comparison"),
  isExtension: integer("is_extension").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const knowledgeMaintenanceProposals = sqliteTable("knowledge_maintenance_proposals", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  question: text("question").notNull(),
  targetPath: text("target_path").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  block: text("block").notNull(),
  fileHash: text("file_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  confirmedAt: text("confirmed_at"),
  completedAt: text("completed_at"),
});

export const knowledgeSyncRecords = sqliteTable("knowledge_sync_records", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  targetPath: text("target_path").notNull(),
  syncedAt: text("synced_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
