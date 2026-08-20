export const backupTableNames = ["knowledge_bases", "study_plans", "study_plan_knowledge_bases", "cards", "card_relations", "review_state", "review_logs", "initial_study_logs", "daily_plans", "daily_tasks", "daily_reports", "daily_report_items", "interview_sessions", "interview_turns", "knowledge_maintenance_proposals", "knowledge_sync_records", "practice_focus", "settings", "tags"] as const;

const localOnlySettingPrefixes = ["cloudSync", "supabaseSync", "accountSync", "autoBackupLast", "autoBackupPausedReason"];

export function isLocalOnlyBackupSetting(key: unknown) {
  return localOnlySettingPrefixes.some((prefix) => String(key).startsWith(prefix));
}
