import type { Card } from "@/lib/types";

type RandomCandidate = Pick<Card, "id" | "status">;

export function chooseRandomCard<T extends RandomCandidate>(cards: T[], excludedIds: Iterable<string> = [], random = Math.random()): T | null {
  const excluded = new Set(excludedIds);
  const eligible = cards.filter((card) => card.status !== "archived");
  const unseen = eligible.filter((card) => !excluded.has(card.id));
  const pool = unseen.length ? unseen : eligible;
  if (!pool.length) return null;
  const normalized = Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.999999) : 0;
  return pool[Math.floor(normalized * pool.length)] ?? null;
}
