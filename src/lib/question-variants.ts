import type { Card, QuestionVariant } from "@/lib/types";

export function normalizeQuestion(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function normalizeQuestionVariants(question: string, variants: QuestionVariant[]) {
  const seen = new Set([normalizeQuestion(question)]);
  return variants.flatMap((variant) => {
    const content = variant.content.trim().replace(/\s+/g, " ");
    const key = normalizeQuestion(content);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ id: variant.id, content, source: variant.source }];
  });
}

export function questionVariantsFromStored(value: string | null | undefined): QuestionVariant[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { id?: unknown; content?: unknown; source?: unknown };
      if (typeof record.id !== "string" || typeof record.content !== "string") return [];
      const source = record.source === "ai" ? "ai" : "manual";
      return [{ id: record.id, content: record.content, source } satisfies QuestionVariant];
    });
  } catch {
    return [];
  }
}

export function questionVariantsToJson(question: string, variants: QuestionVariant[]) {
  return JSON.stringify(normalizeQuestionVariants(question, variants));
}

export function allQuestionTexts(card: Pick<Card, "question" | "questionVariants">) {
  return [card.question, ...card.questionVariants.map((variant) => variant.content)];
}

export function findQuestionCollision(
  question: string,
  variants: QuestionVariant[],
  existingQuestions: Iterable<string>,
) {
  const known = new Set(Array.from(existingQuestions, normalizeQuestion));
  return [question, ...variants.map((variant) => variant.content)]
    .map((content) => content.trim())
    .find((content) => known.has(normalizeQuestion(content)));
}

export function pickPresentedQuestion(
  card: Pick<Card, "question" | "questionVariants">,
  random = Math.random(),
) {
  const pool = allQuestionTexts(card);
  const normalized = Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.999999) : 0;
  return pool[Math.floor(normalized * pool.length)] ?? card.question;
}

export function isCardQuestion(card: Pick<Card, "question" | "questionVariants">, value: string) {
  const target = normalizeQuestion(value);
  return allQuestionTexts(card).some((question) => normalizeQuestion(question) === target);
}
