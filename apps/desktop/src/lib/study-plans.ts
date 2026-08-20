import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import type { StudyPlan } from "@/lib/types";

type PlanRow = { id: string; name: string; description: string; created_at: string; updated_at: string };

function mapPlan(row: PlanRow): StudyPlan {
  const knowledgeBases = sqlite.prepare(`SELECT kb.id, kb.name, COUNT(c.id) AS card_count FROM study_plan_knowledge_bases link JOIN knowledge_bases kb ON kb.id = link.knowledge_base_id LEFT JOIN cards c ON c.knowledge_base_id = kb.id WHERE link.plan_id = ? GROUP BY kb.id ORDER BY kb.name COLLATE NOCASE`).all(row.id) as Array<{ id: string; name: string; card_count: number }>;
  return { id: row.id, name: row.name, description: row.description, knowledgeBaseIds: knowledgeBases.map((item) => item.id), knowledgeBases: knowledgeBases.map((item) => ({ id: item.id, name: item.name, cardCount: Number(item.card_count) })), createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listStudyPlans() {
  return (sqlite.prepare("SELECT * FROM study_plans ORDER BY created_at, id").all() as PlanRow[]).map(mapPlan);
}

export function getStudyPlan(id: string) {
  const row = sqlite.prepare("SELECT * FROM study_plans WHERE id = ?").get(id) as PlanRow | undefined;
  return row ? mapPlan(row) : undefined;
}

export function getActiveStudyPlanId() {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'activeStudyPlanId'").get() as { value: string } | undefined;
  return row?.value && getStudyPlan(row.value) ? row.value : null;
}

export function getActiveStudyPlan() {
  const id = getActiveStudyPlanId();
  return id ? getStudyPlan(id) : null;
}

export function setActiveStudyPlan(id: string) {
  if (!getStudyPlan(id)) throw new Error("找不到计划书。");
  sqlite.prepare("INSERT INTO settings (key, value) VALUES ('activeStudyPlanId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(id);
  return getStudyPlan(id)!;
}

function replaceLinks(planId: string, knowledgeBaseIds: string[]) {
  const ids = [...new Set(knowledgeBaseIds)];
  if (ids.length) {
    const found = sqlite.prepare(`SELECT id FROM knowledge_bases WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as Array<{ id: string }>;
    if (found.length !== ids.length) throw new Error("部分知识库不存在，请刷新后重试。");
  }
  sqlite.prepare("DELETE FROM study_plan_knowledge_bases WHERE plan_id = ?").run(planId);
  const insert = sqlite.prepare("INSERT INTO study_plan_knowledge_bases (plan_id, knowledge_base_id, created_at) VALUES (?, ?, ?)");
  const now = new Date().toISOString();
  for (const id of ids) insert.run(planId, id, now);
}

export function createStudyPlan(input: { name: string; description?: string; knowledgeBaseIds?: string[]; sourceId?: string | null }) {
  const name = input.name.trim();
  if (!name) throw new Error("请输入计划书名称。");
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO study_plans (id, name, description, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, input.description?.trim() ?? "", input.sourceId ?? null, now, now);
    replaceLinks(id, input.knowledgeBaseIds ?? []);
  })();
  return getStudyPlan(id)!;
}

export function updateStudyPlan(id: string, input: { name: string; description?: string; knowledgeBaseIds: string[] }) {
  if (!getStudyPlan(id)) return undefined;
  const name = input.name.trim();
  if (!name) throw new Error("请输入计划书名称。");
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE study_plans SET name = ?, description = ?, updated_at = ? WHERE id = ?").run(name, input.description?.trim() ?? "", new Date().toISOString(), id);
    replaceLinks(id, input.knowledgeBaseIds);
  })();
  return getStudyPlan(id);
}

export function deleteStudyPlan(id: string) {
  if (!getStudyPlan(id)) return false;
  const wasActive = getActiveStudyPlanId() === id;
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM study_plan_knowledge_bases WHERE plan_id = ?").run(id);
    sqlite.prepare("DELETE FROM study_plans WHERE id = ?").run(id);
    if (wasActive) {
      const fallback = sqlite.prepare("SELECT id FROM study_plans ORDER BY CASE WHEN name = '全部知识' THEN 0 ELSE 1 END, created_at, id LIMIT 1").get() as { id: string } | undefined;
      if (fallback) sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('activeStudyPlanId', ?)").run(fallback.id);
      else sqlite.prepare("DELETE FROM settings WHERE key = 'activeStudyPlanId'").run();
    }
  })();
  return true;
}

export function activePlanCardIds(options: { includeArchived?: boolean } = {}) {
  const planId = getActiveStudyPlanId();
  if (!planId) return new Set<string>();
  const rows = sqlite.prepare(`SELECT c.id FROM cards c JOIN study_plan_knowledge_bases link ON link.knowledge_base_id = c.knowledge_base_id WHERE link.plan_id = ? ${options.includeArchived ? "" : "AND c.status <> 'archived'"}`).all(planId) as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

export function activePlanCardSql(alias = "c") {
  const planId = getActiveStudyPlanId();
  return { planId, clause: `EXISTS (SELECT 1 FROM study_plan_knowledge_bases active_link WHERE active_link.plan_id = ? AND active_link.knowledge_base_id = ${alias}.knowledge_base_id)` };
}
