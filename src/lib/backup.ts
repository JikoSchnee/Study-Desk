import "server-only";
import { sqlite } from "@/lib/db";

export const BACKUP_VERSION = 7;
const tables = ["cards", "card_relations", "review_state", "review_logs", "initial_study_logs", "daily_plans", "daily_tasks", "daily_reports", "daily_report_items", "interview_sessions", "interview_turns", "knowledge_maintenance_proposals", "knowledge_sync_records", "practice_focus", "settings", "tags"] as const;
type BackupTable = (typeof tables)[number];
export type AppBackup = { version: number; exportedAt: string; tables: Record<BackupTable, Record<string, unknown>[]> };

const localOnlySettingPrefixes = ["cloudSync", "supabaseSyncNextSyncAt", "autoBackupLast", "autoBackupPausedReason"];

function backupRows(table: BackupTable) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  // Device-specific destinations, scheduling markers, and failure messages must
  // never follow a backup to another device.
  return table === "settings" ? rows.filter((row) => !localOnlySettingPrefixes.some((prefix) => String(row.key).startsWith(prefix))) : rows;
}

function localOnlySettings() {
  return (sqlite.prepare("SELECT key, value FROM settings").all() as Record<string, unknown>[]).filter((row) => localOnlySettingPrefixes.some((prefix) => String(row.key).startsWith(prefix)));
}

export function createBackup(): AppBackup {
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables: Object.fromEntries(tables.map((table) => [table, backupRows(table)])) as AppBackup["tables"] };
}

export function parseBackup(value: unknown): AppBackup {
  if (!value || typeof value !== "object") throw new Error("备份文件不是有效 JSON 对象。");
  const backup = value as Partial<AppBackup>;
  if ((backup.version !== 1 && backup.version !== 2 && backup.version !== 3 && backup.version !== 4 && backup.version !== 5 && backup.version !== 6 && backup.version !== BACKUP_VERSION) || !backup.tables || typeof backup.tables !== "object") throw new Error("不支持此备份版本。");
  const legacyTables = tables.filter((table) => table !== "card_relations" && table !== "initial_study_logs" && table !== "daily_reports" && table !== "daily_report_items" && table !== "tags");
  for (const table of legacyTables) if (!Array.isArray(backup.tables[table])) throw new Error(`备份缺少 ${table} 数据。`);
  if (backup.version >= 3 && !Array.isArray(backup.tables.card_relations)) throw new Error("备份缺少 card_relations 数据。");
  if (backup.version >= 5 && !Array.isArray(backup.tables.initial_study_logs)) throw new Error("备份缺少 initial_study_logs 数据。");
  if (backup.version === BACKUP_VERSION && (!Array.isArray(backup.tables.daily_reports) || !Array.isArray(backup.tables.daily_report_items))) throw new Error("备份缺少日报数据。");
  return { version: BACKUP_VERSION, exportedAt: backup.exportedAt ?? new Date().toISOString(), tables: { ...backup.tables, card_relations: Array.isArray(backup.tables.card_relations) ? backup.tables.card_relations : [], initial_study_logs: Array.isArray(backup.tables.initial_study_logs) ? backup.tables.initial_study_logs : [], daily_reports: Array.isArray(backup.tables.daily_reports) ? backup.tables.daily_reports : [], daily_report_items: Array.isArray(backup.tables.daily_report_items) ? backup.tables.daily_report_items : [], tags: Array.isArray(backup.tables.tags) ? backup.tables.tags : [] } } as AppBackup;
}

const primaryKey: Record<Exclude<BackupTable, "card_relations">, string> = { cards: "id", review_state: "card_id", review_logs: "id", initial_study_logs: "card_id", daily_plans: "date", daily_tasks: "id", daily_reports: "report_date", daily_report_items: "task_id", interview_sessions: "id", interview_turns: "id", knowledge_maintenance_proposals: "id", knowledge_sync_records: "id", practice_focus: "card_id", settings: "key", tags: "id" };

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
      const localSettings = localOnlySettings();
      for (const table of [...tables].reverse()) sqlite.prepare(`DELETE FROM ${table}`).run();
      for (const table of tables) for (const row of backup.tables[table]) insert(table, row);
      for (const row of localSettings) insert("settings", row);
      return;
    }
    for (const table of tables) {
      if (table === "card_relations") {
        for (const row of backup.tables[table]) {
          const existing = sqlite.prepare("SELECT relation_type FROM card_relations WHERE card_id = ? AND related_card_id = ?").get(row.card_id, row.related_card_id) as { relation_type?: string } | undefined;
          if (!existing) insert(table, row);
          else if (typeof row.relation_type === "string" && row.relation_type !== existing.relation_type) sqlite.prepare("UPDATE card_relations SET relation_type = ? WHERE card_id = ? AND related_card_id = ?").run(row.relation_type, row.card_id, row.related_card_id);
        }
        continue;
      }
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
