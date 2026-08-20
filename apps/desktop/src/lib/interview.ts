import "server-only";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/lib/db";
import { getCard, listCards } from "@/lib/cards";
import { evaluateAnswer } from "@/lib/ai";
import { allQuestionTexts, pickPresentedQuestion } from "@/lib/question-variants";
import { getAppSettings } from "@/lib/settings";
import type { AnswerComparisonMode } from "@/lib/types";
import { activePlanCardIds } from "@/lib/study-plans";

type SessionConfig = { cardIds: string[]; mode: "real" | "practice"; cursor: number };
type StoredTurn = { id: string; card_id: string; question: string; answer: string | null; score: number | null; feedback: string | null; comparison_mode: string | null; answer_comparison: string | null; is_extension: number; created_at: string };

function newTurn(sessionId: string, cardId: string, index: number) {
  const card = getCard(cardId);
  if (!card) throw new Error("找不到面试卡片。");
  const id = randomUUID();
  const question = pickPresentedQuestion(card);
  sqlite.prepare("INSERT INTO interview_turns (id, session_id, card_id, question, is_extension, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(id, sessionId, card.id, question, new Date().toISOString());
  return { id, question, index, isExtension: false };
}

export function startInterview(input: { cardIds?: string[]; mode?: "real" | "practice" } = {}) {
  const allowed = activePlanCardIds();
  const cards = (input.cardIds?.map(getCard).filter(Boolean) ?? listCards().filter((card) => card.status !== "archived")).filter((card) => card && allowed.has(card.id));
  if (!cards.length) throw new Error("请先创建至少一张卡片。");
  const sessionId = randomUUID();
  const config: SessionConfig = { cardIds: cards.map((card) => card!.id), mode: input.mode ?? "real", cursor: 0 };
  sqlite.prepare("INSERT INTO interview_sessions (id, config, status, started_at) VALUES (?, ?, 'active', ?)").run(sessionId, JSON.stringify(config), new Date().toISOString());
  return { sessionId, turn: newTurn(sessionId, config.cardIds[0], 1), total: cards.length };
}

export async function answerInterviewTurn(input: { sessionId: string; turnId: string; answer: string; comparisonMode?: AnswerComparisonMode }) {
  const turn = sqlite.prepare("SELECT * FROM interview_turns WHERE id = ? AND session_id = ?").get(input.turnId, input.sessionId) as StoredTurn | undefined;
  if (!turn) throw new Error("找不到面试轮次。");
  if (turn.answer) throw new Error("该面试轮次已经作答。");
  const card = getCard(turn.card_id);
  if (!card) throw new Error("找不到关联卡片。");
  const evaluation = await evaluateAnswer({ ...card, question: turn.question }, input.answer, input.comparisonMode ?? getAppSettings().answerComparisonMode);
  const otherQuestions = allQuestionTexts(card).filter((question) => question !== turn.question);
  sqlite.prepare("UPDATE interview_turns SET answer = ?, score = ?, feedback = ?, comparison_mode = ?, answer_comparison = ? WHERE id = ? AND answer IS NULL")
    .run(input.answer, evaluation.score, evaluation.feedback, evaluation.comparison.requestedMode, JSON.stringify(evaluation.comparison), input.turnId);
  const session = sqlite.prepare("SELECT config FROM interview_sessions WHERE id = ? AND status = 'active'").get(input.sessionId) as { config: string } | undefined;
  if (!session) throw new Error("面试会话不存在或已经结束。");
  const config = JSON.parse(session.config) as SessionConfig;
  config.cursor += 1;
  if (config.cursor >= config.cardIds.length) {
    sqlite.prepare("UPDATE interview_sessions SET status = 'finished', config = ?, finished_at = ? WHERE id = ?").run(JSON.stringify(config), new Date().toISOString(), input.sessionId);
    return { evaluation, answeredQuestion: turn.question, otherQuestions, finished: true, total: config.cardIds.length };
  }
  sqlite.prepare("UPDATE interview_sessions SET config = ? WHERE id = ?").run(JSON.stringify(config), input.sessionId);
  return { evaluation, answeredQuestion: turn.question, otherQuestions, finished: false, turn: newTurn(input.sessionId, config.cardIds[config.cursor], config.cursor + 1), total: config.cardIds.length };
}

export function getInterviewReport(sessionId: string) {
  const session = sqlite.prepare("SELECT id, config, status, started_at, finished_at FROM interview_sessions WHERE id = ?").get(sessionId) as { id: string; config: string; status: string; started_at: string; finished_at: string | null } | undefined;
  if (!session) return undefined;
  const turns = sqlite.prepare("SELECT id, card_id, question, answer, score, feedback, comparison_mode, answer_comparison, is_extension, created_at FROM interview_turns WHERE session_id = ? ORDER BY created_at ASC, id ASC").all(sessionId) as StoredTurn[];
  const scored = turns.filter((turn) => turn.score !== null);
  return {
    session: { id: session.id, ...JSON.parse(session.config) as SessionConfig, status: session.status, startedAt: session.started_at, finishedAt: session.finished_at },
    turns: turns.map((turn) => ({ id: turn.id, cardId: turn.card_id, question: turn.question, answer: turn.answer, score: turn.score, feedback: turn.feedback, comparisonMode: turn.comparison_mode, comparison: turn.answer_comparison ? JSON.parse(turn.answer_comparison) : null, isExtension: Boolean(turn.is_extension), createdAt: turn.created_at })),
    averageScore: scored.length ? Math.round(scored.reduce((sum, turn) => sum + Number(turn.score), 0) / scored.length) : null,
  };
}
