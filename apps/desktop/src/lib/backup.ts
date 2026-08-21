import "server-only";
import { sqlite } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { backupTableNames, isLocalOnlyBackupSetting } from "@/lib/backup-policy";
import type { SyncBackup } from "@shared/sync";

export const BACKUP_VERSION = 9;
const tables = backupTableNames;
type BackupTable = (typeof tables)[number];
export type AppBackup = SyncBackup<BackupTable>;

function backupRows(table: BackupTable) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  // Device-specific destinations, scheduling markers, and failure messages must
  // never follow a backup to another device.
  return table === "settings" ? rows.filter((row) => !isLocalOnlyBackupSetting(row.key)) : rows;
}

function localOnlySettings() {
  return (sqlite.prepare("SELECT key, value FROM settings").all() as Record<string, unknown>[]).filter((row) => isLocalOnlyBackupSetting(row.key));
}

export function createBackup(): AppBackup {
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables: Object.fromEntries(tables.map((table) => [table, backupRows(table)])) as AppBackup["tables"] };
}

export function parseBackup(value: unknown): AppBackup {
  if (!value || typeof value !== "object") throw new Error("备份文件不是有效 JSON 对象。");
  const backup = value as Partial<AppBackup>;
  if (![1, 2, 3, 4, 5, 6, 7, 8, BACKUP_VERSION].includes(Number(backup.version)) || !backup.tables || typeof backup.tables !== "object") throw new Error("不支持此备份版本。");
  const legacyTables = tables.filter((table) => !["knowledge_bases", "study_plans", "study_plan_knowledge_bases", "card_relations", "initial_study_logs", "daily_reports", "daily_report_items", "tags"].includes(table));
  for (const table of legacyTables) if (!Array.isArray(backup.tables[table])) throw new Error(`备份缺少 ${table} 数据。`);
  if (Number(backup.version) >= 3 && !Array.isArray(backup.tables.card_relations)) throw new Error("备份缺少 card_relations 数据。");
  if (Number(backup.version) >= 5 && !Array.isArray(backup.tables.initial_study_logs)) throw new Error("备份缺少 initial_study_logs 数据。");
  if (backup.version === BACKUP_VERSION && (!Array.isArray(backup.tables.daily_reports) || !Array.isArray(backup.tables.daily_report_items))) throw new Error("备份缺少日报数据。");
  return { version: BACKUP_VERSION, exportedAt: backup.exportedAt ?? new Date().toISOString(), tables: { ...backup.tables, knowledge_bases: Array.isArray(backup.tables.knowledge_bases) ? backup.tables.knowledge_bases : [], study_plans: Array.isArray(backup.tables.study_plans) ? backup.tables.study_plans : [], study_plan_knowledge_bases: Array.isArray(backup.tables.study_plan_knowledge_bases) ? backup.tables.study_plan_knowledge_bases : [], card_relations: Array.isArray(backup.tables.card_relations) ? backup.tables.card_relations : [], initial_study_logs: Array.isArray(backup.tables.initial_study_logs) ? backup.tables.initial_study_logs : [], daily_reports: Array.isArray(backup.tables.daily_reports) ? backup.tables.daily_reports : [], daily_report_items: Array.isArray(backup.tables.daily_report_items) ? backup.tables.daily_report_items : [], tags: Array.isArray(backup.tables.tags) ? backup.tables.tags : [] } } as AppBackup;
}

const primaryKey: Record<Exclude<BackupTable, "card_relations" | "study_plan_knowledge_bases">, string> = { knowledge_bases: "id", study_plans: "id", cards: "id", review_state: "card_id", review_logs: "id", initial_study_logs: "card_id", daily_plans: "date", daily_tasks: "id", daily_reports: "report_date", daily_report_items: "task_id", interview_sessions: "id", interview_turns: "id", knowledge_maintenance_proposals: "id", knowledge_sync_records: "id", practice_focus: "card_id", settings: "key", tags: "id" };

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
      if (table === "study_plan_knowledge_bases") {
        for (const row of backup.tables[table]) sqlite.prepare("INSERT OR IGNORE INTO study_plan_knowledge_bases (plan_id, knowledge_base_id, created_at) VALUES (?, ?, ?)").run(row.plan_id, row.knowledge_base_id, row.created_at);
        continue;
      }
      const key = primaryKey[table];
      for (const row of backup.tables[table]) {
        const existing = sqlite.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(row[key]) as Record<string, unknown> | undefined;
        if (!existing) { insert(table, row); continue; }
        const incomingWins = (table === "cards" || table === "knowledge_bases" || table === "study_plans" || table === "review_state") && String(row.updated_at ?? "") > String(existing.updated_at ?? "");
        const completedTaskWins = table === "daily_tasks" && row.status === "done" && existing.status !== "done";
        if (incomingWins || completedTaskWins) {
          const keys = Object.keys(row).filter((column) => column !== key);
          sqlite.prepare(`UPDATE ${table} SET ${keys.map((column) => `${column} = ?`).join(", ")} WHERE ${key} = ?`).run(...keys.map((column) => row[column]), row[key]);
        }
      }
    }
  });
  transaction();
  const now = new Date().toISOString();
  const missingTracks = sqlite.prepare("SELECT DISTINCT TRIM(track) AS name FROM cards WHERE (knowledge_base_id IS NULL OR knowledge_base_id = '') AND TRIM(track) <> ''").all() as Array<{ name: string }>;
  for (const item of missingTracks) sqlite.prepare("INSERT OR IGNORE INTO knowledge_bases (id, name, description, created_at, updated_at) VALUES (?, ?, '', ?, ?)").run(randomUUID(), item.name, now, now);
  sqlite.prepare("UPDATE cards SET knowledge_base_id = (SELECT id FROM knowledge_bases WHERE name = TRIM(cards.track)) WHERE knowledge_base_id IS NULL OR knowledge_base_id = ''").run();
  if (!(sqlite.prepare("SELECT id FROM study_plans LIMIT 1").get())) {
    const planId = randomUUID();
    sqlite.prepare("INSERT INTO study_plans (id, name, description, created_at, updated_at) VALUES (?, '全部知识', '包含恢复数据中的全部知识库。', ?, ?)").run(planId, now, now);
    sqlite.prepare("INSERT INTO study_plan_knowledge_bases (plan_id, knowledge_base_id, created_at) SELECT ?, id, ? FROM knowledge_bases").run(planId, now);
    sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('activeStudyPlanId', ?)").run(planId);
  }
  return createBackup();
}
