import { NextResponse } from "next/server";
import { z } from "zod";
import { listCards } from "@/lib/cards";
import { recommendCardMetadata } from "@/lib/semantic-recommendations";

const variantSchema = z.object({ id: z.string(), content: z.string(), source: z.enum(["manual", "ai"]) });
const pointSchema = z.object({ id: z.string(), content: z.string(), hint: z.string().optional(), note: z.string().optional(), role: z.enum(["opening", "key", "closing"]).optional(), parentId: z.string().optional() });
const schema = z.object({ draft: z.object({ question: z.string().max(2_000), questionVariants: z.array(variantSchema).max(30), answerPoints: z.array(pointSchema).max(50), note: z.string().max(5_000), track: z.string().max(120), tags: z.array(z.string().max(80)).max(30) }), excludeCardIds: z.array(z.string().uuid()).max(200).default([]) });

export async function POST(request: Request) {
  try {
    const { draft, excludeCardIds } = schema.parse(await request.json());
    const normalizedDraft = { ...draft, answerPoints: draft.answerPoints.map((point) => ({ ...point, hint: point.hint ?? "", note: point.note ?? "" })) };
    return NextResponse.json(await recommendCardMetadata(normalizedDraft, listCards(), excludeCardIds));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "暂时无法生成语义推荐。" }, { status: 400 });
  }
}
