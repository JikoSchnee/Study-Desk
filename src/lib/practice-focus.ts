import "server-only";
import { sqlite } from "@/lib/db";
import { getCard } from "@/lib/cards";
import type { Card } from "@/lib/types";

export type FocusMode = "weak" | "priority";

function upsert(cardId: string, changes: { weak?: boolean; priority?: boolean; reason?: string }) {
  const current = sqlite.prepare("SELECT is_weak, is_priority, reason FROM practice_focus WHERE card_id = ?").get(cardId) as { is_weak: number; is_priority: number; reason: string } | undefined;
  const weak = changes.weak ?? Boolean(current?.is_weak);
  const priority = changes.priority ?? Boolean(current?.is_priority);
  const reason = changes.reason ?? current?.reason ?? "";
  sqlite.prepare("INSERT INTO practice_focus (card_id, is_weak, is_priority, reason, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(card_id) DO UPDATE SET is_weak = excluded.is_weak, is_priority = excluded.is_priority, reason = excluded.reason, updated_at = excluded.updated_at")
    .run(cardId, weak ? 1 : 0, priority ? 1 : 0, reason, new Date().toISOString());
  if (!weak && !priority) sqlite.prepare("DELETE FROM practice_focus WHERE card_id = ?").run(cardId);
}

export function setWeakPractice(cardId: string, weak: boolean, reason = "") { upsert(cardId, { weak, reason }); }
export function setPriorityPractice(cardId: string, priority: boolean) { upsert(cardId, { priority }); }
export function clearPriorityPractice(cardId: string) { upsert(cardId, { priority: false }); }
export function clearWeakPractice(cardId: string) { upsert(cardId, { weak: false }); }

export function focusedCards(mode: FocusMode): Card[] {
  const field = mode === "weak" ? "is_weak" : "is_priority";
  const rows = sqlite.prepare(`SELECT card_id FROM practice_focus WHERE ${field} = 1 ORDER BY updated_at DESC`).all() as Array<{ card_id: string }>;
  return rows.map((row) => getCard(row.card_id)).filter((card): card is Card => Boolean(card && card.status !== "archived"));
}

export function isPriorityPractice(cardId: string) {
  return Boolean((sqlite.prepare("SELECT is_priority FROM practice_focus WHERE card_id = ?").get(cardId) as { is_priority?: number } | undefined)?.is_priority);
}
