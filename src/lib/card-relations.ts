import type { CardRelation, CardRelationType } from "@/lib/types";

export function reciprocalRelationType(type: CardRelationType): CardRelationType {
  if (type === "parent") return "child";
  if (type === "child") return "parent";
  return "related";
}

export function normalizeCardRelations(relations: CardRelation[], cardId?: string) {
  const deduped = new Map<string, CardRelationType>();
  for (const relation of relations) {
    if (!relation.cardId || relation.cardId === cardId) continue;
    deduped.set(relation.cardId, relation.type);
  }
  return [...deduped].map(([cardId, type]) => ({ cardId, type }));
}
