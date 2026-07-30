import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import { normalizeTags, parseTags, toTags } from "@/lib/utils";
import type { Tag, TagDisplayLanguage } from "@/lib/types";

type TagRow = { id: string; tag_key: string; chinese: string; english: string; created_at: string; updated_at: string; usage_count?: number };
const map = (row: TagRow): Tag => ({ id: row.id, key: row.tag_key, chinese: row.chinese, english: row.english, usageCount: Number(row.usage_count ?? 0) });

export function formatTag(tag: Pick<Tag, "chinese" | "english">, language: TagDisplayLanguage) {
  const zh = tag.chinese.trim(); const en = tag.english.trim();
  if (language === "both") return zh && en ? `${zh} | ${en}` : zh || en;
  return language === "zh" ? zh || en : en || zh;
}

function keyFor(value: string) { return value.trim().toLocaleLowerCase(); }

export function migrateLegacyTags() {
  const done = sqlite.prepare("SELECT value FROM settings WHERE key = 'tag-catalog-v1'").get() as { value: string } | undefined;
  if (done) return;
  const insert = sqlite.prepare("INSERT OR IGNORE INTO tags (id, tag_key, chinese, english, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?)");
  const now = new Date().toISOString();
  const cards = sqlite.prepare("SELECT tags FROM cards").all() as Array<{ tags: string }>;
  for (const card of cards) for (const label of parseTags(card.tags)) insert.run(randomUUID(), keyFor(label), label, now, now);
  sqlite.prepare("INSERT INTO settings (key, value) VALUES ('tag-catalog-v1', ?)").run(now);
}

export function listTags() {
  migrateLegacyTags();
  return (sqlite.prepare("SELECT t.*, COUNT(c.id) AS usage_count FROM tags t LEFT JOIN cards c ON c.tags LIKE '%' || t.tag_key || '%' GROUP BY t.id ORDER BY COALESCE(NULLIF(t.chinese, ''), t.english) COLLATE NOCASE").all() as TagRow[]).map(map);
}

export function resolveTagKeys(values: string[]) {
  migrateLegacyTags();
  const found = new Map((sqlite.prepare("SELECT * FROM tags").all() as TagRow[]).map((row) => [row.tag_key, map(row)]));
  const now = new Date().toISOString();
  const add = sqlite.prepare("INSERT OR IGNORE INTO tags (id, tag_key, chinese, english, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?)");
  return normalizeTags(values).map((value) => {
    const existing = found.get(keyFor(value));
    if (existing) return existing.key;
    const key = keyFor(value); add.run(randomUUID(), key, value.trim(), now, now); return key;
  });
}

export function createTag(input: { chinese?: string; english?: string }) {
  const chinese = input.chinese?.trim() ?? ""; const english = input.english?.trim() ?? "";
  if (!chinese && !english) throw new Error("请至少填写中文或英文标签。");
  const key = keyFor(chinese || english); const now = new Date().toISOString();
  const existing = sqlite.prepare("SELECT * FROM tags WHERE tag_key = ?").get(key) as TagRow | undefined;
  if (existing) throw new Error("此标签已存在。");
  const row: TagRow = { id: randomUUID(), tag_key: key, chinese, english, created_at: now, updated_at: now };
  sqlite.prepare("INSERT INTO tags (id, tag_key, chinese, english, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(row.id, key, chinese, english, now, now);
  return map(row);
}

export function updateTag(id: string, input: { chinese?: string; english?: string }) {
  const chinese = input.chinese?.trim() ?? ""; const english = input.english?.trim() ?? "";
  if (!chinese && !english) throw new Error("请至少填写中文或英文标签。");
  const row = sqlite.prepare("SELECT * FROM tags WHERE id = ?").get(id) as TagRow | undefined;
  if (!row) return undefined;
  sqlite.prepare("UPDATE tags SET chinese = ?, english = ?, updated_at = ? WHERE id = ?").run(chinese, english, new Date().toISOString(), id);
  return { ...map(row), chinese, english };
}

export function deleteTag(id: string) {
  const row = sqlite.prepare("SELECT * FROM tags WHERE id = ?").get(id) as TagRow | undefined;
  if (!row) return false;
  const transaction = sqlite.transaction(() => {
    const cards = sqlite.prepare("SELECT id, tags FROM cards").all() as Array<{ id: string; tags: string }>;
    const update = sqlite.prepare("UPDATE cards SET tags = ?, updated_at = ? WHERE id = ?"); const now = new Date().toISOString();
    for (const card of cards) {
      const next = parseTags(card.tags).filter((tag) => keyFor(tag) !== row.tag_key);
      if (next.length !== parseTags(card.tags).length) update.run(toTags(next), now, card.id);
    }
    sqlite.prepare("DELETE FROM tags WHERE id = ?").run(id);
  });
  transaction(); return true;
}
