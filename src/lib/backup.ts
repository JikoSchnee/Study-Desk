import "server-only";
import { sqlite } from "@/lib/db";

export const BACKUP_VERSION = 1;
const tables = ["cards", "review_state", "review_logs", "daily_plans", "daily_tasks", "interview_sessions", "interview_turns", "knowledge_maintenance_proposals", "knowledge_sync_records", "practice_focus", "settings"] as const;
type BackupTable = (typeof tables)[number];
export type AppBackup = { version: number; exportedAt: string; tables: Record<BackupTable, Record<string, unknown>[]> };

export function createBackup(): AppBackup {
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables: Object.fromEntries(tables.map((table) => [table, sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]])) as AppBackup["tables"] };
}

export function parseBackup(value: unknown): AppBackup {
  if (!value || typeof value !== "object") throw new Error("备份文件不是有效 JSON 对象。");
  const backup = value as Partial<AppBackup>;
  if (backup.version !== BACKUP_VERSION || !backup.tables || typeof backup.tables !== "object") throw new Error("不支持此备份版本。");
  for (const table of tables) if (!Array.isArray(backup.tables[table])) throw new Error(`备份缺少 ${table} 数据。`);
  return backup as AppBackup;
}

const primaryKey: Record<BackupTable, string> = { cards: "id", review_state: "card_id", review_logs: "id", daily_plans: "date", daily_tasks: "id", interview_sessions: "id", interview_turns: "id", knowledge_maintenance_proposals: "id", knowledge_sync_records: "id", practice_focus: "card_id", settings: "key" };

function insert(table: BackupTable, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  if (!keys.length) return;
  sqlite.prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((key) => row[key]));
}

export function previewBackup(backup: AppBackup) {
  const current = createBackup();
  const counts = Object.fromEntries(tables.map((table) => [table, backup.tables[table].length]));
  const cardIds = new Set(current.tables.cards.map((row) => String(row.id)));
  return { version: backup.version, exportedAt: backup.exportedAt, counts, cardConflicts: backup.tables.cards.filter((row) => cardIds.has(String(row.id))).length };
}

export function restoreBackup(backup: AppBackup, mode: "merge" | "replace") {
  const transaction = sqlite.transaction(() => {
    if (mode === "replace") {
      for (const table of [...tables].reverse()) sqlite.prepare(`DELETE FROM ${table}`).run();
      for (const table of tables) for (const row of backup.tables[table]) insert(table, row);
      return;
    }
    for (const table of tables) {
      const key = primaryKey[table];
      for (const row of backup.tables[table]) {
        const existing = sqlite.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(row[key]) as Record<string, unknown> | undefined;
        if (!existing) { insert(table, row); continue; }
        if (table === "cards" && String(row.updated_at ?? "") > String(existing.updated_at ?? "")) {
          const keys = Object.keys(row).filter((column) => column !== key);
          sqlite.prepare(`UPDATE ${table} SET ${keys.map((column) => `${column} = ?`).join(", ")} WHERE ${key} = ?`).run(...keys.map((column) => row[column]), row[key]);
        }
      }
    }
  });
  transaction();
  return createBackup();
}
