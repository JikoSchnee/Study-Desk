import { findQuestionCollision, normalizeQuestion, normalizeQuestionVariants } from "@/lib/question-variants";
import type { AnswerPoint, Card, QuestionVariant } from "@/lib/types";

export type { AnswerPoint } from "@/lib/types";

export type ImportRow = Pick<Card, "question" | "answer" | "track" | "tags" | "difficulty"> & { questionVariants?: QuestionVariant[] };
export type ImportField = "question" | "variants" | "answer" | "hint" | "track" | "tags" | "difficulty";
export type ImportColumnMapping = Record<ImportField, string>;
export type ImportPreviewCard = Omit<ImportRow, "answer" | "questionVariants"> & { questionVariants: QuestionVariant[]; answerPoints: AnswerPoint[] };
export type ImportPreviewRow = { id: string; rowNumber: number; status: "valid" | "duplicate" | "invalid"; card: ImportPreviewCard; reason?: string; note?: string };

export const emptyMapping: ImportColumnMapping = { question: "", variants: "", answer: "", hint: "", track: "", tags: "", difficulty: "" };

function pointId(index: number, content: string) { return `point-${index}-${content.slice(0, 8)}`; }

export function answerPointsFromText(value: string, hints = ""): AnswerPoint[] {
  const hintLines = hints.split(/\r?\n/);
  return value.split(/\r?\n/).map((content, index) => {
    const cleanContent = content.replace(/^[-•]\s*/, "").trim();
    return { id: pointId(index, cleanContent), content: cleanContent, hint: hintLines[index]?.trim() ?? "", note: "" };
  }).filter((point) => point.content);
}

export function answerFromPoints(points: AnswerPoint[]) { return points.map((point) => point.content.trim()).filter(Boolean).join("\n"); }

export function answerPointsToJson(points: AnswerPoint[]) {
  return JSON.stringify(points.filter((point) => point.content.trim()).map((point, index) => ({ id: point.id || pointId(index, point.content.trim()), content: point.content.trim(), hint: point.hint?.trim() ?? "", note: point.note?.trim() ?? "" })));
}

export function answerPointsFromStored(value: string | null | undefined, fallbackAnswer: string): AnswerPoint[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) {
      const points = parsed.map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const record = item as { id?: unknown; content?: unknown; hint?: unknown; note?: unknown };
        const content = typeof record.content === "string" ? record.content.trim() : "";
        if (!content) return null;
        return { id: typeof record.id === "string" && record.id ? record.id : pointId(index, content), content, hint: typeof record.hint === "string" ? record.hint.trim() : "", note: typeof record.note === "string" ? record.note.trim() : "" };
      }).filter((point): point is AnswerPoint => point !== null);
      if (points.length) return points;
    }
  } catch { /* Old or malformed rows fall back to the compatible plain-text answer. */ }
  return answerPointsFromText(fallbackAnswer);
}

export function splitTags(value: string) { return value.split(/[，,|]/).map((tag) => tag.trim()).filter(Boolean); }

export function questionVariantsFromText(value: string): QuestionVariant[] {
  return normalizeQuestionVariants("", value.split(/\r?\n/).map((content, index) => ({
    id: `import-variant-${index}-${content.trim().slice(0, 8)}`,
    content,
    source: "manual" as const,
  })));
}

export function previewImport(rows: ImportRow[], existingQuestions: string[]) {
  const known = new Set(existingQuestions.map(normalizeQuestion));
  const seen = new Set<string>();
  const accepted: ImportRow[] = [];
  const rejected: Array<{ question: string; reason: string }> = [];
  for (const row of rows) {
    const variants = normalizeQuestionVariants(row.question, row.questionVariants ?? []);
    const key = normalizeQuestion(row.question);
    const collision = findQuestionCollision(row.question, variants, [...known, ...seen]);
    if (!row.question.trim() || !row.answer.trim()) rejected.push({ question: row.question, reason: "问题和答案不能为空" });
    else if (collision) rejected.push({ question: row.question, reason: `问法“${collision}”已存在` });
    else {
      seen.add(key);
      variants.forEach((variant) => seen.add(normalizeQuestion(variant.content)));
      accepted.push({ ...row, questionVariants: variants });
    }
  }
  return { accepted, rejected };
}
