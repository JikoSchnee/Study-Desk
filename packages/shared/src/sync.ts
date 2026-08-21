export type SharedRating = "again" | "hard" | "good" | "easy";
export type SharedAnswerPoint = { id?: string; content?: string; hint?: string; note?: string; role?: "opening" | "key" | "closing"; parentId?: string };
export type SharedQuestionVariant = { id?: string; content?: string; source?: "manual" | "ai" };
export type SyncBackupRow = Record<string, unknown>;
export type SyncBackup<TableName extends string = string> = { version: number; exportedAt: string; tables: Record<TableName, SyncBackupRow[]> };
export type WebCardProjection = {
  id: string;
  question: string;
  questionVariants: SharedQuestionVariant[];
  answer: string;
  answerPoints: SharedAnswerPoint[];
  note: string;
  knowledgeBaseId: string;
  track: string;
  status: string;
  updatedAt: string;
};
export type WebEvaluationSource = "llm" | "self";
