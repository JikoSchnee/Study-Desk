import { findQuestionCollision, normalizeQuestion, normalizeQuestionVariants } from "@/lib/question-variants";
import { normalizeTags } from "@/lib/utils";
import type { AnswerPoint, AnswerPointRole, Card, QuestionVariant } from "@/lib/types";

export type { AnswerPoint } from "@/lib/types";

export type ImportRow = Pick<Card, "question" | "answer" | "track" | "tags" | "difficulty"> & { questionVariants?: QuestionVariant[] };
export type ImportField = "question" | "variants" | "opening" | "answer" | "hint" | "closing" | "track" | "tags" | "difficulty";
export type ImportColumnMapping = Record<ImportField, string>;
export type ImportPreviewCard = Omit<ImportRow, "answer" | "questionVariants"> & { questionVariants: QuestionVariant[]; answerPoints: AnswerPoint[] };
export type ImportPreviewRow = { id: string; rowNumber: number; status: "valid" | "duplicate" | "invalid"; card: ImportPreviewCard; reason?: string; note?: string; similarMatch?: { question: string; score: number; source: "library" | "import" } };

export const emptyMapping: ImportColumnMapping = { question: "", variants: "", opening: "", answer: "", hint: "", closing: "", track: "", tags: "", difficulty: "" };

function pointId(index: number, content: string) { return `point-${index}-${content.slice(0, 8)}`; }
export function answerPointRole(value: Pick<AnswerPoint, "role">): AnswerPointRole { return value.role === "opening" || value.role === "closing" ? value.role : "key"; }

export function normalizeAnswerPoints(points: AnswerPoint[]) {
  const seenRoles = new Set<AnswerPointRole>();
  const cleaned = points.flatMap((point, index) => {
    const content = point.content.trim();
    const role = answerPointRole(point);
    if (!content || ((role === "opening" || role === "closing") && seenRoles.has(role))) return [];
    seenRoles.add(role);
    return [{ id: point.id || pointId(index, content), content, hint: role === "key" ? point.hint?.trim() ?? "" : "", note: role === "key" ? point.note?.trim() ?? "" : "", role, parentId: role === "key" && typeof point.parentId === "string" && point.parentId ? point.parentId : undefined }];
  });
  const byId = new Map(cleaned.map((point) => [point.id, point]));
  const valid = cleaned.map((point) => {
    const parent = point.parentId ? byId.get(point.parentId) : undefined;
    return parent && point.role === "key" && parent.role === "key" && !parent.parentId && parent.id !== point.id ? { ...point, hint: "", note: "" } : { ...point, parentId: undefined };
  });
  const opening = valid.filter((point) => point.role === "opening");
  const closing = valid.filter((point) => point.role === "closing");
  const roots = valid.filter((point) => point.role === "key" && !point.parentId);
  const children = new Map<string, typeof valid>();
  for (const point of valid.filter((point) => point.parentId)) children.set(point.parentId!, [...(children.get(point.parentId!) ?? []), point]);
  return [...opening, ...roots.flatMap((point) => [point, ...(children.get(point.id) ?? [])]), ...closing];
}

export function answerPointHierarchyError(points: AnswerPoint[]) {
  const present = points.filter((point) => point.content.trim());
  const byId = new Map(present.map((point) => [point.id, point]));
  for (const point of present) {
    if (!point.parentId) continue;
    const parent = byId.get(point.parentId);
    if (answerPointRole(point) !== "key" || !parent || answerPointRole(parent) !== "key" || parent.parentId || parent.id === point.id) return "子分项只能关联到一个顶层核心要点。";
  }
  return undefined;
}

export function answerPointLabels(points: AnswerPoint[]) {
  const labels = new Map<string, string>();
  let rootIndex = 0;
  const children = new Map<string, number>();
  for (const point of normalizeAnswerPoints(points)) {
    if (point.role !== "key") continue;
    if (!point.parentId) { rootIndex += 1; labels.set(point.id, String(rootIndex)); }
    else {
      const childIndex = (children.get(point.parentId) ?? 0) + 1;
      children.set(point.parentId, childIndex);
      labels.set(point.id, `${labels.get(point.parentId) ?? rootIndex}.${childIndex}`);
    }
  }
  return labels;
}

export function answerPointsToNumberedText(points: AnswerPoint[], field: "content" | "hint" = "content") {
  const normalized = normalizeAnswerPoints(points);
  const labels = answerPointLabels(normalized);
  return normalized.filter((point) => point.role === "key" && (field === "content" || !point.parentId)).map((point) => {
    const label = labels.get(point.id) ?? "";
    return `${label}${point.parentId ? "" : "."} ${point[field]}`.trimEnd();
  }).join("\n");
}

export function hasCoreAnswerPoint(points: AnswerPoint[]) { return normalizeAnswerPoints(points).some((point) => point.role === "key"); }

export function answerPointsFromText(value: string, hints = "", role: AnswerPointRole = "key"): AnswerPoint[] {
  const marker = /^(\d+)(?:\.(\d+))?[.、)\s]+(.*)$/;
  const hintLines = hints.split(/\r?\n/);
  const hintByNumber = new Map<string, string>();
  hintLines.forEach((line) => { const match = line.trim().match(marker); if (match) hintByNumber.set(match[2] ? `${match[1]}.${match[2]}` : match[1], match[3].trim()); });
  const hasNumberedHints = hintByNumber.size > 0;
  const parents = new Map<string, string>();
  return value.split(/\r?\n/).flatMap((content, index) => {
    const matched = role === "key" ? content.trim().match(marker) : null;
    const number = matched ? (matched[2] ? `${matched[1]}.${matched[2]}` : matched[1]) : undefined;
    const cleanContent = (matched?.[3] ?? content).replace(/^[-•]\s*/, "").trim();
    if (!cleanContent) return [];
    const id = pointId(index, cleanContent);
    if (matched && !matched[2]) parents.set(matched[1], id);
    const parentId = matched?.[2] ? parents.get(matched[1]) : undefined;
    const fallbackHint = hintLines[index]?.trim().replace(marker, "$3") ?? "";
    return [{ id, content: cleanContent, hint: role === "key" && !parentId ? hintByNumber.get(number ?? "") ?? (hasNumberedHints ? "" : fallbackHint) : "", note: "", role, parentId }];
  });
}

export function answerFromPoints(points: AnswerPoint[]) { return normalizeAnswerPoints(points).map((point) => point.content).join("\n"); }

export function answerPointsToJson(points: AnswerPoint[]) {
  return JSON.stringify(normalizeAnswerPoints(points));
}

export function answerPointsFromStored(value: string | null | undefined, fallbackAnswer: string): AnswerPoint[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) {
      const points = parsed.map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const record = item as { id?: unknown; content?: unknown; hint?: unknown; note?: unknown; role?: unknown; parentId?: unknown };
        const content = typeof record.content === "string" ? record.content.trim() : "";
        if (!content) return null;
        const role: AnswerPointRole = record.role === "opening" || record.role === "closing" ? record.role : "key";
        return { id: typeof record.id === "string" && record.id ? record.id : pointId(index, content), content, hint: role === "key" && typeof record.hint === "string" ? record.hint.trim() : "", note: role === "key" && typeof record.note === "string" ? record.note.trim() : "", role, parentId: role === "key" && typeof record.parentId === "string" ? record.parentId : undefined };
      }).filter((point): point is NonNullable<typeof point> => point !== null);
      if (points.length) return normalizeAnswerPoints(points);
    }
  } catch { /* Old or malformed rows fall back to the compatible plain-text answer. */ }
  return answerPointsFromText(fallbackAnswer);
}

export function splitTags(value: string) { return normalizeTags(value.split(/[，,|]/)); }

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
