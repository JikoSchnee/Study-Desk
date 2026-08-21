import "server-only";
import { createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
import { requireServiceUser } from "@service/lib/service-supabase";
import { membershipStatus, requireCloudMembership } from "@service/lib/membership";
import { decryptWebSecret } from "@service/lib/web-session";
import { hashWebAnswer, type StoredWebEvaluation, type WebRating } from "@service/lib/web-ai";
import type { SyncBackup } from "@shared/sync";

type Row = Record<string, unknown>;
type Backup = SyncBackup<string>;
type DocumentRow = { version: number; backup: unknown; updated_at: string };
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
const ratingMap: Record<WebRating, Rating> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

function parseBackup(value: unknown): Backup {
  if (!value || typeof value !== "object" || !(value as Backup).tables) throw new Error("云端同步数据格式无效。");
  const source = value as Backup;
  const tables = Object.fromEntries(Object.entries(source.tables).map(([name, rows]) => [name, Array.isArray(rows) ? rows.map((row) => ({ ...row })) : []]));
  for (const name of ["cards", "knowledge_bases", "study_plans", "study_plan_knowledge_bases", "review_state", "review_logs", "initial_study_logs", "daily_tasks", "settings"]) if (!tables[name]) tables[name] = [];
  return { version: Math.max(9, Number(source.version) || 9), exportedAt: new Date().toISOString(), tables };
}

const setting = (backup: Backup, key: string) => backup.tables.settings.find((row) => row.key === key)?.value;
function activeCardIds(backup: Backup) {
  const planId = String(setting(backup, "activeStudyPlanId") ?? "");
  if (!planId) return new Set(backup.tables.cards.map((row) => String(row.id)));
  const bases = new Set(backup.tables.study_plan_knowledge_bases.filter((row) => row.plan_id === planId).map((row) => String(row.knowledge_base_id)));
  return new Set(backup.tables.cards.filter((row) => bases.has(String(row.knowledge_base_id))).map((row) => String(row.id)));
}

function answerPoints(row: Row) {
  try { const value = JSON.parse(String(row.answer_points ?? "[]")); return Array.isArray(value) ? value : []; } catch { return []; }
}

function questionVariants(row: Row) {
  try { const value = JSON.parse(String(row.question_variants ?? "[]")); return Array.isArray(value) ? value : []; } catch { return []; }
}

export function webCard(row: Row) {
  return { id: String(row.id), question: String(row.question ?? ""), questionVariants: questionVariants(row), answer: String(row.answer ?? ""), answerPoints: answerPoints(row), note: String(row.note ?? ""), knowledgeBaseId: String(row.knowledge_base_id ?? ""), track: String(row.track ?? ""), status: String(row.status ?? "learning"), updatedAt: String(row.updated_at ?? "") };
}

async function cloudContext(request: Request, mode: "read" | "write") {
  const auth = await requireServiceUser(request);
  const membership = await requireCloudMembership(auth.supabase, auth.user, mode);
  const document = await auth.supabase.from("study_desk_sync_documents").select("version, backup, updated_at").eq("user_id", auth.user.id).maybeSingle();
  if (document.error) throw document.error;
  return { ...auth, membership, document: document.data as DocumentRow | null, backup: document.data ? parseBackup(document.data.backup) : null };
}

async function replaceWithRetry(request: Request, mutate: (backup: Backup) => { result?: unknown }) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const context = await cloudContext(request, "write");
    if (!context.document || !context.backup) throw new Error("WEB_CLOUD_EMPTY");
    const output = mutate(context.backup);
    const size = Buffer.byteLength(JSON.stringify(context.backup));
    if (size > 4 * 1024 * 1024) throw new Error("SYNC_QUOTA_EXCEEDED");
    const written = await context.supabase.rpc("replace_study_desk_sync_document_service", { target_user: context.user.id, expected_version: context.document.version, next_backup: context.backup, target_history_limit: 5 });
    if (!written.error) return { ...output, version: Number(written.data) };
    lastError = written.error;
    if (!String(written.error.message ?? written.error).includes("SYNC_VERSION_CONFLICT")) throw written.error;
  }
  throw lastError ?? new Error("SYNC_VERSION_CONFLICT");
}

export async function webBootstrap(request: Request) {
  const auth = await requireServiceUser(request);
  const membership = await membershipStatus(auth.supabase, auth.user);
  const document = membership.canReadCloud ? await auth.supabase.from("study_desk_sync_documents").select("version, backup, updated_at").eq("user_id", auth.user.id).maybeSingle() : { data: null, error: null };
  if (document.error) throw document.error;
  const backup = document.data ? parseBackup(document.data.backup) : null;
  const ids = backup ? activeCardIds(backup) : new Set<string>();
  const now = new Date().toISOString();
  const due = backup ? backup.tables.review_state.filter((row) => ids.has(String(row.card_id)) && String(row.due_at ?? "") <= now).length : 0;
  return { user: { id: auth.user.id, email: auth.user.email ?? null }, membership, cloud: { available: Boolean(backup), version: document.data?.version ?? null, updatedAt: document.data?.updated_at ?? null, knowledgeBases: backup?.tables.knowledge_bases.length ?? 0, cards: backup?.tables.cards.length ?? 0, due } };
}

export async function webLibrary(request: Request) {
  const context = await cloudContext(request, "read");
  if (!context.backup) return { knowledgeBases: [], cards: [], empty: true };
  const counts = new Map<string, number>();
  for (const card of context.backup.tables.cards) counts.set(String(card.knowledge_base_id ?? ""), (counts.get(String(card.knowledge_base_id ?? "")) ?? 0) + 1);
  return { knowledgeBases: context.backup.tables.knowledge_bases.map((row) => ({ id: String(row.id), name: String(row.name ?? ""), description: String(row.description ?? ""), cardCount: counts.get(String(row.id)) ?? 0 })), cards: context.backup.tables.cards.map(webCard), empty: false, readOnly: !context.membership.canWriteCloud };
}

export async function webCardDetail(request: Request, id: string) {
  const context = await cloudContext(request, "read");
  const row = context.backup?.tables.cards.find((card) => card.id === id);
  if (!row) throw new Error("WEB_CARD_NOT_FOUND");
  return { card: webCard(row), readOnly: !context.membership.canWriteCloud };
}

export async function updateWebCardNote(request: Request, id: string, note: string, expectedUpdatedAt?: string) {
  return replaceWithRetry(request, (backup) => {
    const row = backup.tables.cards.find((card) => card.id === id);
    if (!row) throw new Error("WEB_CARD_NOT_FOUND");
    if (expectedUpdatedAt && String(row.updated_at ?? "") !== expectedUpdatedAt) throw new Error("WEB_NOTE_CONFLICT");
    row.note = note;
    row.updated_at = new Date().toISOString();
    return { result: { card: webCard(row) } };
  });
}

export async function webReviewQueue(request: Request) {
  const context = await cloudContext(request, "read");
  if (!context.backup) return { initial: [], review: [], readOnly: !context.membership.canWriteCloud };
  const allowed = activeCardIds(context.backup);
  const dueIds = new Set(context.backup.tables.review_state.filter((row) => String(row.due_at ?? "") <= new Date().toISOString()).map((row) => String(row.card_id)));
  const cards = context.backup.tables.cards.filter((row) => allowed.has(String(row.id)));
  return { initial: cards.filter((row) => row.status === "learning").map(webCard), review: cards.filter((row) => row.status === "review" && dueIds.has(String(row.id))).map(webCard), readOnly: !context.membership.canWriteCloud };
}

export async function completeWebInitialStudy(request: Request, cardId: string) {
  return replaceWithRetry(request, (backup) => {
    const card = backup.tables.cards.find((row) => row.id === cardId);
    if (!card) throw new Error("WEB_CARD_NOT_FOUND");
    const existing = backup.tables.initial_study_logs.find((row) => row.card_id === cardId);
    if (existing) return { result: { dueAt: backup.tables.review_state.find((row) => row.card_id === cardId)?.due_at ?? null } };
    const now = new Date();
    const due = new Date(now); due.setUTCDate(due.getUTCDate() + 1); due.setUTCHours(0, 0, 0, 0);
    const fsrsCard = createEmptyCard(now) as unknown as Row; fsrsCard.due = due;
    backup.tables.initial_study_logs.push({ card_id: cardId, completed_at: now.toISOString() });
    backup.tables.review_state.push({ card_id: cardId, fsrs_card: JSON.stringify(fsrsCard), due_at: due.toISOString(), updated_at: now.toISOString() });
    card.status = "review"; card.updated_at = now.toISOString();
    for (const task of backup.tables.daily_tasks) if (task.card_id === cardId && task.kind === "learn" && task.status !== "done") { task.status = "done"; task.completed_at = now.toISOString(); }
    return { result: { dueAt: due.toISOString() } };
  });
}

function schedule(previous: Row | undefined, rating: WebRating, now: Date) {
  try {
    const revived = previous ? { ...previous } : createEmptyCard(now) as unknown as Row;
    for (const key of ["due", "last_review"]) if (revived[key]) revived[key] = new Date(String(revived[key]));
    const outcomes = scheduler.repeat(revived as never, now) as unknown as Record<Rating, { card: Row }>;
    return outcomes[ratingMap[rating]].card;
  } catch {
    const days = { again: 0.007, hard: 1, good: 3, easy: 7 }[rating];
    return { ...(previous ?? {}), due: new Date(now.getTime() + days * 86_400_000), last_review: now };
  }
}

export async function confirmWebReview(request: Request, input: { evaluationId: string; operationId: string; answer: string; rating: WebRating }) {
  const auth = await requireServiceUser(request);
  const selected = await auth.supabase.from("study_desk_web_evaluations").select("id, payload_ciphertext, expires_at, consumed_at, confirmation_operation_id, confirmation_result").eq("id", input.evaluationId).eq("user_id", auth.user.id).maybeSingle();
  if (selected.data?.confirmation_operation_id === input.operationId && selected.data.confirmation_result) return selected.data.confirmation_result;
  if (selected.error || !selected.data || selected.data.consumed_at || Date.parse(selected.data.expires_at) <= Date.now()) throw new Error("WEB_EVALUATION_EXPIRED");
  const evaluation = decryptWebSecret<StoredWebEvaluation>(selected.data.payload_ciphertext);
  if (evaluation.answerHash !== hashWebAnswer(input.answer)) throw new Error("WEB_EVALUATION_INVALID");
  if (evaluation.scope.kind !== "self") throw new Error("WEB_EVALUATION_INVALID");
  const cardId = evaluation.scope.cardId;
  const result = await replaceWithRetry(request, (backup) => {
    const existing = backup.tables.review_logs.find((row) => row.id === input.operationId);
    if (existing) return { result: { dueAt: existing.next_due_at, idempotent: true } };
    const card = backup.tables.cards.find((row) => row.id === cardId);
    if (!card) throw new Error("WEB_CARD_NOT_FOUND");
    const now = new Date();
    let state = backup.tables.review_state.find((row) => row.card_id === cardId);
    const previous = state?.fsrs_card ? JSON.parse(String(state.fsrs_card)) as Row : undefined;
    const next = schedule(previous, input.rating, now);
    const dueAt = new Date(next.due as string | Date).toISOString();
    if (!state) { state = { card_id: cardId }; backup.tables.review_state.push(state); }
    Object.assign(state, { fsrs_card: JSON.stringify(next), due_at: dueAt, updated_at: now.toISOString() });
    backup.tables.review_logs.push({ id: input.operationId, card_id: cardId, response: input.answer, ai_score: evaluation.score ?? 0, suggested_rating: evaluation.suggestedRating ?? input.rating, confirmed_rating: input.rating, comparison_mode: evaluation.source, answer_comparison: null, presented_question: String(card.question ?? ""), feedback: evaluation.feedback, next_due_at: dueAt, is_initial: 0, evaluation_source: evaluation.source, created_at: now.toISOString() });
    card.status = "review"; card.updated_at = now.toISOString();
    for (const task of backup.tables.daily_tasks) if (task.card_id === cardId && task.kind === "review" && task.status !== "done") { task.status = "done"; task.completed_at = now.toISOString(); }
    return { result: { dueAt, idempotent: false } };
  });
  await auth.supabase.from("study_desk_web_evaluations").update({ consumed_at: new Date().toISOString(), confirmation_operation_id: input.operationId, confirmation_result: result }).eq("id", input.evaluationId).is("consumed_at", null);
  return result;
}

export function evaluationCardFromRow(row: Row) { const card = webCard(row); return { question: card.question, answerPoints: card.answerPoints, answer: card.answer, note: card.note }; }
export async function selfEvaluationContext(request: Request, cardId: string) {
  const context = await cloudContext(request, "write");
  const row = context.backup?.tables.cards.find((card) => card.id === cardId);
  if (!row) throw new Error("WEB_CARD_NOT_FOUND");
  return { user: context.user, member: true, card: evaluationCardFromRow(row) };
}
