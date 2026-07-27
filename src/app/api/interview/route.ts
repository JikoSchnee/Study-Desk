import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sqlite } from "@/lib/db";
import { getCard, listCards } from "@/lib/cards";
import { evaluateAnswer } from "@/lib/ai";
import { allQuestionTexts, pickPresentedQuestion } from "@/lib/question-variants";
import { getAppSettings } from "@/lib/settings";

const startSchema = z.object({ action: z.literal("start"), cardIds: z.array(z.string().uuid()).optional(), mode: z.enum(["real", "practice"]).default("real") });
const answerSchema = z.object({ action: z.literal("answer"), sessionId: z.string().uuid(), turnId: z.string().uuid(), answer: z.string().min(1), comparisonMode: z.enum(["embedding", "llm"]).optional(), comparisonProgressId: z.string().min(1).optional() });

function newTurn(sessionId: string, cardId: string, index: number) {
  const card = getCard(cardId)!;
  const id = randomUUID();
  const question = pickPresentedQuestion(card);
  sqlite.prepare("INSERT INTO interview_turns (id, session_id, card_id, question, is_extension, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(id, sessionId, card.id, question, new Date().toISOString());
  return { id, question, index };
}

export async function POST(request: Request) {
  const body = await request.json();
  if (body.action === "start") {
    const input = startSchema.parse(body);
    const cards = input.cardIds?.map(getCard).filter(Boolean) ?? listCards().filter((card) => card.status !== "archived");
    if (!cards.length) return NextResponse.json({ error: "请先创建至少一张卡片" }, { status: 400 });
    const sessionId = randomUUID();
    sqlite.prepare("INSERT INTO interview_sessions (id, config, status, started_at) VALUES (?, ?, 'active', ?)").run(sessionId, JSON.stringify({ cardIds: cards.map((card) => card!.id), mode: input.mode, cursor: 0 }), new Date().toISOString());
    return NextResponse.json({ sessionId, turn: newTurn(sessionId, cards[0]!.id, 1), total: cards.length });
  }
  const input = answerSchema.parse(body);
  const turn = sqlite.prepare("SELECT * FROM interview_turns WHERE id = ? AND session_id = ?").get(input.turnId, input.sessionId) as { card_id: string; question: string } | undefined;
  if (!turn) return NextResponse.json({ error: "找不到面试轮次" }, { status: 404 });
  const card = getCard(turn.card_id)!;
  const evaluation = await evaluateAnswer({ ...card, question: turn.question }, input.answer, input.comparisonMode ?? getAppSettings().answerComparisonMode, input.comparisonProgressId);
  const otherQuestions = allQuestionTexts(card).filter((question) => question !== turn.question);
  sqlite.prepare("UPDATE interview_turns SET answer = ?, score = ?, feedback = ?, comparison_mode = ?, answer_comparison = ? WHERE id = ?").run(input.answer, evaluation.score, evaluation.feedback, evaluation.comparison.requestedMode, JSON.stringify(evaluation.comparison), input.turnId);
  const session = sqlite.prepare("SELECT config FROM interview_sessions WHERE id = ?").get(input.sessionId) as { config: string };
  const config = JSON.parse(session.config) as { cardIds: string[]; cursor: number; mode: string };
  config.cursor += 1;
  if (config.cursor >= config.cardIds.length) {
    sqlite.prepare("UPDATE interview_sessions SET status = 'finished', config = ?, finished_at = ? WHERE id = ?").run(JSON.stringify(config), new Date().toISOString(), input.sessionId);
    return NextResponse.json({ evaluation, answeredQuestion: turn.question, otherQuestions, finished: true });
  }
  sqlite.prepare("UPDATE interview_sessions SET config = ? WHERE id = ?").run(JSON.stringify(config), input.sessionId);
  return NextResponse.json({ evaluation, answeredQuestion: turn.question, otherQuestions, finished: false, turn: newTurn(input.sessionId, config.cardIds[config.cursor], config.cursor + 1), total: config.cardIds.length });
}
