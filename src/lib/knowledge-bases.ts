import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import type { KnowledgeBase } from "@/lib/types";

type KnowledgeBaseRow = { id: string; name: string; description: string; created_at: string; updated_at: string; card_count?: number };

function mapKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBase {
  return { id: row.id, name: row.name, description: row.description, cardCount: Number(row.card_count ?? 0), createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listKnowledgeBases(): KnowledgeBase[] {
  return (sqlite.prepare(`SELECT kb.*, COUNT(c.id) AS card_count FROM knowledge_bases kb LEFT JOIN cards c ON c.knowledge_base_id = kb.id GROUP BY kb.id ORDER BY kb.name COLLATE NOCASE`).all() as KnowledgeBaseRow[]).map(mapKnowledgeBase);
}

export function getKnowledgeBase(id: string) {
  const row = sqlite.prepare(`SELECT kb.*, COUNT(c.id) AS card_count FROM knowledge_bases kb LEFT JOIN cards c ON c.knowledge_base_id = kb.id WHERE kb.id = ? GROUP BY kb.id`).get(id) as KnowledgeBaseRow | undefined;
  return row ? mapKnowledgeBase(row) : undefined;
}

export function findKnowledgeBaseByName(name: string) {
  const row = sqlite.prepare("SELECT id FROM knowledge_bases WHERE name = ? COLLATE NOCASE").get(name.trim()) as { id: string } | undefined;
  return row ? getKnowledgeBase(row.id) : undefined;
}

export function createKnowledgeBase(input: { name: string; description?: string; sourceId?: string | null }) {
  const name = input.name.trim();
  if (!name) throw new Error("请输入知识库名称。");
  if (findKnowledgeBaseByName(name)) throw new Error("已存在同名知识库。");
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO knowledge_bases (id, name, description, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, input.description?.trim() ?? "", input.sourceId ?? null, now, now);
  return getKnowledgeBase(id)!;
}

export function getOrCreateKnowledgeBase(name: string) {
  return findKnowledgeBaseByName(name) ?? createKnowledgeBase({ name });
}

export function updateKnowledgeBase(id: string, input: { name: string; description?: string }) {
  const current = getKnowledgeBase(id);
  if (!current) return undefined;
  const name = input.name.trim();
  if (!name) throw new Error("请输入知识库名称。");
  const conflict = findKnowledgeBaseByName(name);
  if (conflict && conflict.id !== id) throw new Error("已存在同名知识库。");
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE knowledge_bases SET name = ?, description = ?, updated_at = ? WHERE id = ?").run(name, input.description?.trim() ?? "", new Date().toISOString(), id);
    sqlite.prepare("UPDATE cards SET track = ?, updated_at = updated_at WHERE knowledge_base_id = ?").run(name, id);
  })();
  return getKnowledgeBase(id);
}

export function deleteKnowledgeBase(id: string) {
  const count = sqlite.prepare("SELECT COUNT(*) AS count FROM cards WHERE knowledge_base_id = ?").get(id) as { count: number };
  if (Number(count.count)) throw new Error("请先移动或删除该知识库中的全部卡片。");
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM study_plan_knowledge_bases WHERE knowledge_base_id = ?").run(id);
    sqlite.prepare("DELETE FROM knowledge_bases WHERE id = ?").run(id);
  })();
  return true;
}

