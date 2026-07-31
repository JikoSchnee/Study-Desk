import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sqlite } from "@/lib/db";
import { getCard, listCards } from "@/lib/cards";
import { evaluateAnswer, generateFollowUpCardDraft, generateFollowUpQuestion } from "@/lib/ai";
import { allQuestionTexts, pickPresentedQuestion } from "@/lib/question-variants";
import { getAppSettings } from "@/lib/settings";

const startSchema = z.object({ action: z.literal("start"), cardIds: z.array(z.string().uuid()).optional(), mode: z.enum(["real", "practice"]).default("real") });
const answerSchema = z.object({ action: z.literal("answer"), sessionId: z.string().uuid(), turnId: z.string().uuid(), answer: z.string().min(1), comparisonMode: z.enum(["embedding", "llm"]).optional(), comparisonProgressId: z.string().min(1).optional() });
const followUpSchema = z.object({ action: z.literal("followup"), sessionId: z.string().uuid(), turnId: z.string().uuid() });
const followUpCardDraftSchema = z.object({ action: z.literal("followupCardDraft"), sessionId: z.string().uuid(), turnId: z.string().uuid() });

function newTurn(sessionId: string, cardId: string, index: number) {
  const card = getCard(cardId)!;
  const id = randomUUID();
  const question = pickPresentedQuestion(card);
  sqlite.prepare("INSERT INTO interview_turns (id, session_id, card_id, question, is_extension, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(id, sessionId, card.id, question, new Date().toISOString());
  return { id, question, index, isExtension: false };
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
  if (body.action === "followup") {
    const input = followUpSchema.parse(body);
    const parent = sqlite.prepare("SELECT card_id, question, answer, feedback FROM interview_turns WHERE id = ? AND session_id = ? AND is_extension = 0").get(input.turnId, input.sessionId) as { card_id: string; question: string; answer: string | null; feedback: string | null } | undefined;
    if (!parent?.answer) return NextResponse.json({ error: "请先完成原题后再发起追问。" }, { status: 400 });
    const card = getCard(parent.card_id);
    if (!card) return NextResponse.json({ error: "找不到关联卡片" }, { status: 404 });
    const question = await generateFollowUpQuestion({ ...card, question: parent.question }, parent.answer, []);
    const id = randomUUID();
    sqlite.prepare("INSERT INTO interview_turns (id, session_id, card_id, question, is_extension, parent_turn_id, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(id, input.sessionId, parent.card_id, question, input.turnId, new Date().toISOString());
    const session = sqlite.prepare("SELECT config FROM interview_sessions WHERE id = ?").get(input.sessionId) as { config: string } | undefined;
    const config = session ? JSON.parse(session.config) as { cursor: number } : { cursor: 0 };
    return NextResponse.json({ turn: { id, question, index: config.cursor + 1, isExtension: true } });
  }
  if (body.action === "followupCardDraft") {
    try {
      const input = followUpCardDraftSchema.parse(body);
      const extension = sqlite.prepare("SELECT card_id, question, parent_turn_id FROM interview_turns WHERE id = ? AND session_id = ? AND is_extension = 1").get(input.turnId, input.sessionId) as { card_id: string; question: string; parent_turn_id: string | null } | undefined;
      if (!extension?.parent_turn_id) return NextResponse.json({ error: "只能将本场模拟面试中的 AI 追问加入藏品。" }, { status: 400 });
      const parent = sqlite.prepare("SELECT answer, feedback FROM interview_turns WHERE id = ? AND session_id = ?").get(extension.parent_turn_id, input.sessionId) as { answer: string | null; feedback: string | null } | undefined;
      const card = getCard(extension.card_id);
      if (!card) return NextResponse.json({ error: "找不到追问对应的原卡。" }, { status: 404 });
      const draft = await generateFollowUpCardDraft(card, extension.question, { answer: parent?.answer ?? "", gaps: parent?.feedback ? [parent.feedback] : [] });
      return NextResponse.json({ draft });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "暂时无法生成追问卡草稿。" }, { status: 400 });
    }
  }
  const input = answerSchema.parse(body);
  const turn = sqlite.prepare("SELECT * FROM interview_turns WHERE id = ? AND session_id = ?").get(input.turnId, input.sessionId) as { card_id: string; question: string; is_extension: number } | undefined;
  if (!turn) return NextResponse.json({ error: "找不到面试轮次" }, { status: 404 });
  const card = getCard(turn.card_id)!;
  const evaluation = await evaluateAnswer({ ...card, question: turn.question }, input.answer, input.comparisonMode ?? getAppSettings().answerComparisonMode, input.comparisonProgressId);
  const otherQuestions = allQuestionTexts(card).filter((question) => question !== turn.question);
  sqlite.prepare("UPDATE interview_turns SET answer = ?, score = ?, feedback = ?, comparison_mode = ?, answer_comparison = ? WHERE id = ?").run(input.answer, evaluation.score, evaluation.feedback, evaluation.comparison.requestedMode, JSON.stringify(evaluation.comparison), input.turnId);
  const session = sqlite.prepare("SELECT config FROM interview_sessions WHERE id = ?").get(input.sessionId) as { config: string };
  const config = JSON.parse(session.config) as { cardIds: string[]; cursor: number; mode: string };
  if (turn.is_extension) {
    const nextCardId = config.cardIds[config.cursor];
    const next = sqlite.prepare("SELECT id, question FROM interview_turns WHERE session_id = ? AND card_id = ? AND is_extension = 0 AND answer IS NULL ORDER BY created_at ASC LIMIT 1").get(input.sessionId, nextCardId) as { id: string; question: string } | undefined;
    if (next) return NextResponse.json({ evaluation, answeredQuestion: turn.question, otherQuestions, answeredIsExtension: true, finished: false, turn: { ...next, index: config.cursor + 1, isExtension: false }, total: config.cardIds.length });
    return NextResponse.json({ evaluation, answeredQuestion: turn.question, otherQuestions, answeredIsExtension: true, finished: true });
  }
  config.cursor += 1;
  if (config.cursor >= config.cardIds.length) {
    sqlite.prepare("UPDATE interview_sessions SET status = 'finished', config = ?, finished_at = ? WHERE id = ?").run(JSON.stringify(config), new Date().toISOString(), input.sessionId);
    return NextResponse.json({ evaluation, answeredQuestion: turn.question, otherQuestions, answeredIsExtension: false, finished: true });
  }
  sqlite.prepare("UPDATE interview_sessions SET config = ? WHERE id = ?").run(JSON.stringify(config), input.sessionId);
  return NextResponse.json({ evaluation, answeredQuestion: turn.question, otherQuestions, answeredIsExtension: false, finished: false, turn: newTurn(input.sessionId, config.cardIds[config.cursor], config.cursor + 1), total: config.cardIds.length });
}
