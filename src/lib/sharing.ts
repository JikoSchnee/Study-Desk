import "server-only";
import { z } from "zod";
import { sqlite } from "@/lib/db";
import { createCard, getCard, updateCard } from "@/lib/cards";
import { createKnowledgeBase, findKnowledgeBaseByName, getKnowledgeBase, listKnowledgeBases } from "@/lib/knowledge-bases";
import { createStudyPlan, getStudyPlan } from "@/lib/study-plans";
import type { CardRelationType } from "@/lib/types";

const answerPointSchema = z.object({ id: z.string().min(1), content: z.string(), hint: z.string().default(""), note: z.string().default(""), role: z.enum(["opening", "key", "closing"]).optional(), parentId: z.string().optional() });
const variantSchema = z.object({ id: z.string().min(1), content: z.string(), source: z.enum(["manual", "ai"]) });
const sharedCardSchema = z.object({ id: z.string().min(1), knowledgeBaseId: z.string().min(1), question: z.string().min(1), questionVariants: z.array(variantSchema), answerPoints: z.array(answerPointSchema), note: z.string(), tags: z.array(z.string()), difficulty: z.number().int().min(1).max(5), source: z.string().nullable().optional() });
const shareSchema = z.object({ format: z.literal("study-desk-share"), version: z.literal(1), exportedAt: z.string(), type: z.enum(["knowledge-base", "study-plan"]), plan: z.object({ id: z.string(), name: z.string(), description: z.string(), knowledgeBaseIds: z.array(z.string()) }).nullable(), knowledgeBases: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })), cards: z.array(sharedCardSchema), relations: z.array(z.object({ cardId: z.string(), relatedCardId: z.string(), relationType: z.enum(["related", "parent", "child"]) })) });

export type SharePackage = z.infer<typeof shareSchema>;
export type KnowledgeBaseResolution = { action: "merge" | "duplicate" | "skip"; targetId?: string };
export type CardResolution = "keep" | "overwrite";

export function parseSharePackage(value: unknown): SharePackage {
  try { return shareSchema.parse(value); }
  catch { throw new Error("分享文件无效或版本不受支持。"); }
}

function exportPackage(knowledgeBaseIds: string[], plan: SharePackage["plan"]): SharePackage {
  const ids = [...new Set(knowledgeBaseIds)];
  const bases = listKnowledgeBases().filter((item) => ids.includes(item.id));
  if (bases.length !== ids.length) throw new Error("部分知识库不存在。");
  const placeholders = ids.map(() => "?").join(",");
  const rows = ids.length ? sqlite.prepare(`SELECT id FROM cards WHERE knowledge_base_id IN (${placeholders})`).all(...ids) as Array<{ id: string }> : [];
  const cards = rows.map((row) => getCard(row.id)!).filter(Boolean);
  const cardIds = new Set(cards.map((card) => card.id));
  const relations = (sqlite.prepare("SELECT card_id, related_card_id, relation_type FROM card_relations").all() as Array<{ card_id: string; related_card_id: string; relation_type: CardRelationType }>).filter((item) => cardIds.has(item.card_id) && cardIds.has(item.related_card_id));
  return {
    format: "study-desk-share", version: 1, exportedAt: new Date().toISOString(), type: plan ? "study-plan" : "knowledge-base", plan,
    knowledgeBases: bases.map(({ id, name, description }) => ({ id, name, description })),
    cards: cards.map((card) => ({ id: card.id, knowledgeBaseId: card.knowledgeBaseId!, question: card.question, questionVariants: card.questionVariants, answerPoints: card.answerPoints, note: card.note, tags: card.tags, difficulty: card.difficulty, source: card.source })),
    relations: relations.map((item) => ({ cardId: item.card_id, relatedCardId: item.related_card_id, relationType: item.relation_type })),
  };
}

export function exportKnowledgeBase(id: string) { return exportPackage([id], null); }
export function exportStudyPlan(id: string) {
  const plan = getStudyPlan(id);
  if (!plan) throw new Error("找不到计划书。");
  return exportPackage(plan.knowledgeBaseIds, { id: plan.id, name: plan.name, description: plan.description, knowledgeBaseIds: plan.knowledgeBaseIds });
}

function matchBase(sourceId: string, name: string) {
  const source = sqlite.prepare("SELECT id FROM knowledge_bases WHERE source_id = ? OR id = ? LIMIT 1").get(sourceId, sourceId) as { id: string } | undefined;
  return source ? getKnowledgeBase(source.id) : findKnowledgeBaseByName(name);
}

function matchCard(baseId: string, sourceId: string, question: string) {
  return sqlite.prepare("SELECT id, question FROM cards WHERE knowledge_base_id = ? AND (share_source_id = ? OR id = ? OR LOWER(TRIM(question)) = LOWER(TRIM(?))) ORDER BY CASE WHEN share_source_id = ? OR id = ? THEN 0 ELSE 1 END LIMIT 1").get(baseId, sourceId, sourceId, question, sourceId, sourceId) as { id: string; question: string } | undefined;
}

export function previewShareImport(value: unknown) {
  const pkg = parseSharePackage(value);
  return {
    package: { type: pkg.type, plan: pkg.plan, knowledgeBaseCount: pkg.knowledgeBases.length, cardCount: pkg.cards.length },
    knowledgeBases: pkg.knowledgeBases.map((base) => {
      const match = matchBase(base.id, base.name);
      const conflicts = match ? pkg.cards.filter((card) => card.knowledgeBaseId === base.id && matchCard(match.id, card.id, card.question)).map((card) => ({ incomingId: card.id, question: card.question, localCardId: matchCard(match.id, card.id, card.question)!.id })) : [];
      return { ...base, cardCount: pkg.cards.filter((card) => card.knowledgeBaseId === base.id).length, match: match ? { id: match.id, name: match.name } : null, conflicts };
    }),
  };
}

function uniqueName(name: string, table: "knowledge_bases" | "study_plans") {
  let candidate = `${name}（副本）`;
  let index = 2;
  while (sqlite.prepare(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE`).get(candidate)) candidate = `${name}（副本 ${index++}）`;
  return candidate;
}

export function importSharePackage(value: unknown, baseResolutions: Record<string, KnowledgeBaseResolution>, cardResolutions: Record<string, CardResolution> = {}) {
  const pkg = parseSharePackage(value);
  const summary = { knowledgeBasesCreated: 0, knowledgeBasesMerged: 0, knowledgeBasesSkipped: 0, cardsCreated: 0, cardsOverwritten: 0, cardsKept: 0, planCreated: false };
  const transaction = sqlite.transaction(() => {
    const baseMap = new Map<string, string>();
    const cardMap = new Map<string, string>();
    const relationWritable = new Set<string>();
    for (const incoming of pkg.knowledgeBases) {
      const resolution = baseResolutions[incoming.id] ?? { action: matchBase(incoming.id, incoming.name) ? "merge" : "duplicate" };
      if (resolution.action === "skip") { summary.knowledgeBasesSkipped += 1; continue; }
      let localBase;
      if (resolution.action === "merge") {
        localBase = resolution.targetId ? getKnowledgeBase(resolution.targetId) : matchBase(incoming.id, incoming.name);
        if (!localBase) throw new Error(`知识库“${incoming.name}”没有可合并的目标。`);
        summary.knowledgeBasesMerged += 1;
      } else {
        const name = findKnowledgeBaseByName(incoming.name) ? uniqueName(incoming.name, "knowledge_bases") : incoming.name;
        localBase = createKnowledgeBase({ name, description: incoming.description, sourceId: incoming.id });
        summary.knowledgeBasesCreated += 1;
      }
      baseMap.set(incoming.id, localBase.id);
      for (const incomingCard of pkg.cards.filter((card) => card.knowledgeBaseId === incoming.id)) {
        const conflict = resolution.action === "merge" ? matchCard(localBase.id, incomingCard.id, incomingCard.question) : undefined;
        if (conflict) {
          if ((cardResolutions[incomingCard.id] ?? "keep") === "keep") { cardMap.set(incomingCard.id, conflict.id); summary.cardsKept += 1; continue; }
          const current = getCard(conflict.id)!;
          updateCard(conflict.id, { ...current, question: incomingCard.question, questionVariants: incomingCard.questionVariants, relations: [], answerPoints: incomingCard.answerPoints, note: incomingCard.note, track: localBase.name, knowledgeBaseId: localBase.id, tags: incomingCard.tags, difficulty: incomingCard.difficulty });
          sqlite.prepare("UPDATE cards SET share_source_id = ? WHERE id = ?").run(incomingCard.id, conflict.id);
          cardMap.set(incomingCard.id, conflict.id); relationWritable.add(conflict.id); summary.cardsOverwritten += 1; continue;
        }
        const created = createCard({ question: incomingCard.question, questionVariants: incomingCard.questionVariants, relations: [], answer: "", answerPoints: incomingCard.answerPoints, note: incomingCard.note, track: localBase.name, knowledgeBaseId: localBase.id, tags: incomingCard.tags, difficulty: incomingCard.difficulty, source: incomingCard.source ?? undefined, status: "learning" });
        sqlite.prepare("UPDATE cards SET share_source_id = ? WHERE id = ?").run(incomingCard.id, created.id);
        cardMap.set(incomingCard.id, created.id); relationWritable.add(created.id); summary.cardsCreated += 1;
      }
    }
    const relationMap = new Map<string, Array<{ cardId: string; type: CardRelationType }>>();
    for (const relation of pkg.relations) {
      const from = cardMap.get(relation.cardId); const to = cardMap.get(relation.relatedCardId);
      if (!from || !to || from === to) continue;
      const items = relationMap.get(from) ?? [];
      if (!items.some((item) => item.cardId === to)) items.push({ cardId: to, type: relation.relationType });
      relationMap.set(from, items);
    }
    for (const [cardId, relations] of relationMap) {
      if (!relationWritable.has(cardId)) continue;
      const card = getCard(cardId)!;
      updateCard(cardId, { ...card, relations });
    }
    if (pkg.plan) {
      const name = sqlite.prepare("SELECT id FROM study_plans WHERE name = ? COLLATE NOCASE").get(pkg.plan.name) ? uniqueName(pkg.plan.name, "study_plans") : pkg.plan.name;
      createStudyPlan({ name, description: pkg.plan.description, knowledgeBaseIds: pkg.plan.knowledgeBaseIds.flatMap((id) => baseMap.get(id) ?? []), sourceId: pkg.plan.id });
      summary.planCreated = true;
    }
  });
  transaction();
  return summary;
}
