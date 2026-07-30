import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// The desktop shell sets MOCK_INTERVIEW_HOME to Electron's user-data directory.
// Browser development keeps the existing project-local data directory unchanged.
const dataDir = join(process.env.MOCK_INTERVIEW_HOME || process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const globalForDb = globalThis as unknown as { mockInterviewDb?: Database.Database };
export const sqlite = globalForDb.mockInterviewDb ?? new Database(join(dataDir, "mock-interview.db"));
if (process.env.NODE_ENV !== "production") globalForDb.mockInterviewDb = sqlite;

sqlite.pragma("busy_timeout = 5000");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, question TEXT NOT NULL, question_variants TEXT NOT NULL DEFAULT '[]', answer TEXT NOT NULL, answer_points TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', track TEXT NOT NULL, tags TEXT NOT NULL, difficulty INTEGER NOT NULL, source TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS card_relations (card_id TEXT NOT NULL, related_card_id TEXT NOT NULL, relation_type TEXT NOT NULL DEFAULT 'related', created_at TEXT NOT NULL, PRIMARY KEY (card_id, related_card_id));
  CREATE TABLE IF NOT EXISTS review_state (card_id TEXT PRIMARY KEY, fsrs_card TEXT NOT NULL, due_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS review_logs (id TEXT PRIMARY KEY, card_id TEXT NOT NULL, response TEXT NOT NULL, ai_score INTEGER NOT NULL, suggested_rating TEXT NOT NULL, confirmed_rating TEXT NOT NULL, comparison_mode TEXT, answer_comparison TEXT, presented_question TEXT, feedback TEXT, next_due_at TEXT, is_initial INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS initial_study_logs (card_id TEXT PRIMARY KEY, completed_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS daily_plans (date TEXT PRIMARY KEY, budget_minutes INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS daily_tasks (id TEXT PRIMARY KEY, plan_date TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, card_id TEXT, estimate_minutes INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS interview_sessions (id TEXT PRIMARY KEY, config TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT);
  CREATE TABLE IF NOT EXISTS interview_turns (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, card_id TEXT, question TEXT NOT NULL, answer TEXT, score INTEGER, feedback TEXT, comparison_mode TEXT, answer_comparison TEXT, is_extension INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS knowledge_maintenance_proposals (id TEXT PRIMARY KEY, card_id TEXT NOT NULL, target_path TEXT NOT NULL, status TEXT NOT NULL, file_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS knowledge_sync_records (id TEXT PRIMARY KEY, card_id TEXT NOT NULL, target_path TEXT NOT NULL, synced_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, tag_key TEXT NOT NULL UNIQUE, chinese TEXT NOT NULL DEFAULT '', english TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS practice_focus (card_id TEXT PRIMARY KEY, is_weak INTEGER NOT NULL DEFAULT 0, is_priority INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    try { sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
    catch (error) { if (!(error instanceof Error) || !error.message.includes("duplicate column name")) throw error; }
  }
}

// Keep review suggestions locally so that a refresh never loses an item awaiting approval.
ensureColumn("cards", "answer_points", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("cards", "question_variants", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("cards", "note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("card_relations", "relation_type", "TEXT NOT NULL DEFAULT 'related'");
ensureColumn("review_logs", "comparison_mode", "TEXT");
ensureColumn("review_logs", "answer_comparison", "TEXT");
ensureColumn("review_logs", "presented_question", "TEXT");
ensureColumn("review_logs", "feedback", "TEXT");
ensureColumn("review_logs", "next_due_at", "TEXT");
ensureColumn("review_logs", "is_initial", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("interview_turns", "comparison_mode", "TEXT");
ensureColumn("interview_turns", "answer_comparison", "TEXT");
ensureColumn("interview_turns", "parent_turn_id", "TEXT");
ensureColumn("knowledge_maintenance_proposals", "question", "TEXT NOT NULL DEFAULT ''");
ensureColumn("knowledge_maintenance_proposals", "summary", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("knowledge_maintenance_proposals", "block", "TEXT NOT NULL DEFAULT ''");
ensureColumn("knowledge_maintenance_proposals", "updated_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("knowledge_maintenance_proposals", "confirmed_at", "TEXT");
ensureColumn("knowledge_maintenance_proposals", "completed_at", "TEXT");

const reviewLogSemanticsMigration = "review-log-semantics-v2";

function migrateReviewLogSemantics() {
  const migrated = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(reviewLogSemanticsMigration);
  if (migrated) return;

  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM review_logs WHERE response = '系统首次练习初始化' AND is_initial = 1").run();

    const resetCards = sqlite.prepare(`
      SELECT c.id FROM cards c
      WHERE c.status = 'review'
        AND NOT EXISTS (SELECT 1 FROM review_logs l WHERE l.card_id = c.id)
    `).all() as Array<{ id: string }>;
    const deleteState = sqlite.prepare("DELETE FROM review_state WHERE card_id = ?");
    const resetCard = sqlite.prepare("UPDATE cards SET status = 'learning', updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();
    for (const card of resetCards) {
      deleteState.run(card.id);
      resetCard.run(now, card.id);
    }

    const practicedCards = sqlite.prepare("SELECT DISTINCT card_id FROM review_logs").all() as Array<{ card_id: string }>;
    const clearInitial = sqlite.prepare("UPDATE review_logs SET is_initial = 0 WHERE card_id = ?");
    const firstPractice = sqlite.prepare("SELECT id FROM review_logs WHERE card_id = ? ORDER BY created_at ASC, id ASC LIMIT 1");
    const markInitial = sqlite.prepare("UPDATE review_logs SET is_initial = 1 WHERE id = ?");
    for (const card of practicedCards) {
      clearInitial.run(card.card_id);
      const first = firstPractice.get(card.card_id) as { id: string } | undefined;
      if (first) markInitial.run(first.id);
    }

    sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(reviewLogSemanticsMigration, new Date().toISOString());
  })();
}

migrateReviewLogSemantics();
