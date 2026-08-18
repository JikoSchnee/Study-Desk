import { NextResponse } from "next/server";
import { z } from "zod";
import { filterAndSortCards, type CardSort, type SortDirection } from "@/lib/card-filters";
import { answerFromPoints, answerPointHierarchyError, answerPointsFromText, hasCoreAnswerPoint } from "@/lib/import";
import { isNativeAddonError, localApiErrorResponse } from "@/lib/local-api-error";

const questionVariantSchema = z.object({ id: z.string().min(1), content: z.string(), source: z.enum(["manual", "ai"]) });
const answerPointSchema = z.object({ id: z.string().min(1), content: z.string(), hint: z.string().optional().default(""), note: z.string().optional().default(""), role: z.enum(["opening", "key", "closing"]).optional().default("key"), parentId: z.string().min(1).optional() });
const cardRelationSchema = z.object({ cardId: z.string().uuid(), type: z.enum(["related", "parent", "child"]) });
const cardInputBaseSchema = z.object({ question: z.string().min(3), questionVariants: z.array(questionVariantSchema).default([]), relations: z.array(cardRelationSchema).default([]), answer: z.string().optional(), answerPoints: z.array(answerPointSchema).optional(), note: z.string().optional().default(""), track: z.string().trim().default(""), knowledgeBaseId: z.string().uuid().optional(), tags: z.array(z.string()).default([]), difficulty: z.number().int().min(1).max(5).default(3), source: z.string().optional() });
const cardInputSchema = cardInputBaseSchema.refine((value) => Boolean(value.knowledgeBaseId || value.track), { message: "请选择知识库。", path: ["knowledgeBaseId"] });

function validateCard(value: z.infer<typeof cardInputSchema>, context: z.RefinementCtx) {
  const answerPoints = value.answerPoints?.length ? value.answerPoints : answerPointsFromText(value.answer ?? "");
  const answer = value.answer ?? answerFromPoints(answerPoints);
  const hierarchyError = answerPointHierarchyError(answerPoints);
  if (hierarchyError) { context.addIssue({ code: z.ZodIssueCode.custom, message: hierarchyError, path: ["answerPoints"] }); return z.NEVER; }
  if (answer.trim().length < 3 || !hasCoreAnswerPoint(answerPoints)) { context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 1, type: "array", inclusive: true, message: "请至少填写一条核心答案要点。", path: ["answerPoints"] }); return z.NEVER; }
  return { ...value, answerPoints, answer };
}

const cardSchema = cardInputSchema.transform(validateCard);
const updateCardSchema = cardInputBaseSchema.extend({ id: z.string().uuid(), answerPoints: z.array(answerPointSchema).min(1) }).refine((value) => Boolean(value.knowledgeBaseId || value.track), { message: "请选择知识库。", path: ["knowledgeBaseId"] }).transform((value, context) => {
  const answer = answerFromPoints(value.answerPoints);
  const hierarchyError = answerPointHierarchyError(value.answerPoints);
  if (hierarchyError) { context.addIssue({ code: z.ZodIssueCode.custom, message: hierarchyError, path: ["answerPoints"] }); return z.NEVER; }
  if (answer.trim().length < 3 || !hasCoreAnswerPoint(value.answerPoints)) { context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 1, type: "array", inclusive: true, message: "请至少填写一条核心答案要点。", path: ["answerPoints"] }); return z.NEVER; }
  return { ...value, answer };
});

const cardQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().default(""),
  track: z.string().default(""),
  tags: z.array(z.string()).default([]),
  sort: z.enum(["updated", "created", "review", "practice", "difficulty"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  archived: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = cardQuerySchema.parse({
      offset: url.searchParams.get("offset") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
      track: url.searchParams.get("track") ?? undefined,
      tags: url.searchParams.getAll("tag"),
      sort: url.searchParams.get("sort") ?? undefined,
      direction: url.searchParams.get("direction") ?? undefined,
      archived: url.searchParams.get("archived") ?? undefined,
    });
    const [{ listCards }, { cardLearningSummaries }] = await Promise.all([import("@/lib/cards"), import("@/lib/card-learning")]);
    const allCards = listCards();
    const catalog = allCards.filter((card) => input.archived === "true" ? card.status === "archived" : card.status !== "archived");
    const catalogLearning = cardLearningSummaries(catalog.map((card) => card.id));
    const matching = filterAndSortCards(catalog, catalogLearning, { query: input.query, track: input.track, tags: new Set(input.tags), sort: input.sort as CardSort, direction: input.direction as SortDirection });
    const cards = matching.slice(input.offset, input.offset + input.limit);
    return NextResponse.json({
      cards,
      learning: Object.fromEntries(cards.flatMap((card) => catalogLearning[card.id] ? [[card.id, catalogLearning[card.id]]] : [])),
      total: matching.length,
      catalogTotal: catalog.length,
      hasMore: input.offset + cards.length < matching.length,
      facets: {
        tracks: [...new Set(allCards.map((card) => card.track))].sort((left, right) => left.localeCompare(right, "zh-CN")),
        tags: [...new Set(allCards.flatMap((card) => card.tags))].sort((left, right) => left.localeCompare(right, "zh-CN")),
      },
    });
  } catch (error) {
    return localApiErrorResponse("Failed to list cards", error, "无法读取藏品。");
  }
}
export async function POST(request: Request) {
  try {
    const input = cardSchema.parse(await request.json());
    const { createCard } = await import("@/lib/cards");
    const created = createCard(input);
    (await import("@/lib/auto-backup")).triggerAutoBackup();
    return NextResponse.json({ card: created }, { status: 201 });
  } catch (error) {
    if (isNativeAddonError(error)) return localApiErrorResponse("Failed to create a card", error, "无法保存卡片。");
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存卡片。" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const input = updateCardSchema.parse(await request.json());
    const { updateCard } = await import("@/lib/cards");
    const card = updateCard(input.id, input);
    if (!card) return NextResponse.json({ error: "找不到卡片。" }, { status: 404 });
    (await import("@/lib/auto-backup")).triggerAutoBackup();
    return NextResponse.json({ card });
  } catch (error) {
    if (isNativeAddonError(error)) return localApiErrorResponse("Failed to update a card", error, "无法更新卡片。");
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法更新卡片。" }, { status: 400 });
  }
}
