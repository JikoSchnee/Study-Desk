import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as domain from "@/mcp/domain";

const confirmationSchema = z.object({ confirmed: z.boolean(), summary: z.string().max(500) });
const answerPointSchema = z.object({ id: z.string().uuid(), content: z.string().trim().min(1).max(2_000), hint: z.string().max(500).default(""), note: z.string().max(2_000).default(""), role: z.enum(["opening", "key", "closing"]).default("key"), parentId: z.string().uuid().optional() });
const draftAnswerPointSchema = answerPointSchema.omit({ id: true });
const relationSchema = z.object({ cardId: z.string().uuid(), type: z.enum(["related", "parent", "child"]) });

function success(data: unknown) {
  const result = { ok: true, data, meta: { requestId: randomUUID(), serverVersion: "1.0.0" } };
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
}

function failure(error: unknown) {
  const known = error instanceof domain.McpDomainError ? error : new domain.McpDomainError("INTERNAL_ERROR", error instanceof Error ? error.message : "发生未知错误。", false);
  const result = { ok: false, error: { code: known.code, message: known.message, retryable: known.retryable, details: known.details }, meta: { requestId: randomUUID(), serverVersion: "1.0.0" } };
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result, isError: true };
}

function safe<T>(work: () => T | Promise<T>) { return Promise.resolve().then(work).then(success).catch(failure); }
function resource(uri: string, data: unknown) { return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }] }; }

export function createStudyDeskMcpServer() {
  const server = new McpServer({ name: "study-desk", version: "1.0.0" });

  server.registerResource("today-plan", "study-desk://dashboard/today", { title: "今日学习计划", mimeType: "application/json" }, async (uri) => resource(uri.href, domain.todayPlan()));
  server.registerResource("review-queue", "study-desk://review/queue", { title: "复习队列", mimeType: "application/json" }, async (uri) => resource(uri.href, domain.reviewQueue()));
  server.registerResource("capabilities", "study-desk://settings/capabilities", { title: "Study Desk 能力", mimeType: "application/json" }, async (uri) => resource(uri.href, domain.capabilities()));
  server.registerResource("agent-guide", "study-desk://guide", { title: "Agent 操作手册", mimeType: "text/markdown" }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(join(process.cwd(), "docs", "AGENT-MCP.md"), "utf8") }] }));
  server.registerResource("card", new ResourceTemplate("study-desk://cards/{cardId}", { list: undefined }), { title: "卡片详情", mimeType: "application/json" }, async (uri, variables) => resource(uri.href, domain.cardDetails(String(variables.cardId))));

  server.registerTool("search_cards", {
    title: "搜索卡片", description: "按关键词、知识库、标签或状态查询 Study Desk 卡片。只读，不改变学习数据。",
    inputSchema: { query: z.string().max(200).optional(), track: z.string().max(80).optional(), tags: z.array(z.string().max(80)).max(20).optional(), status: z.enum(["draft", "learning", "review", "archived"]).optional(), limit: z.number().int().min(1).max(50).default(20), cursor: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, (input) => safe(() => domain.searchCards(input)));

  server.registerTool("get_card", {
    title: "读取卡片", description: "读取一张卡片的完整内容、关联和学习历史。",
    inputSchema: { cardId: z.string().uuid() }, annotations: { readOnlyHint: true },
  }, (input) => safe(() => domain.cardDetails(input.cardId)));

  server.registerTool("get_today_plan", {
    title: "读取今日计划", description: "读取并确保生成今日学习计划。", annotations: { readOnlyHint: true },
  }, () => safe(() => domain.todayPlan()));

  server.registerTool("get_review_queue", {
    title: "读取复习队列", description: "读取首次学习、复习或薄弱项的下一张卡片，不改变队列。",
    inputSchema: { kind: z.enum(["initial", "review", "weak"]).optional() }, annotations: { readOnlyHint: true },
  }, (input) => safe(() => domain.reviewQueue(input.kind)));

  server.registerTool("create_card_draft", {
    title: "创建卡片草稿", description: "创建一张草稿卡片；草稿不会加入学习队列。",
    inputSchema: { question: z.string().trim().min(3).max(500), answerPoints: z.array(draftAnswerPointSchema).min(1).max(50), track: z.string().trim().min(1).max(80), tags: z.array(z.string().max(80)).max(20).default([]), relations: z.array(relationSchema).max(30).default([]), source: z.string().max(500).optional() },
    annotations: { destructiveHint: false },
  }, (input) => safe(() => domain.createCardDraft(input)));

  server.registerTool("update_card_draft", {
    title: "更新卡片草稿", description: "更新草稿卡片。必须带上读取时获得的 expectedUpdatedAt，以防覆盖其他修改。",
    inputSchema: { cardId: z.string().uuid(), expectedUpdatedAt: z.string().datetime(), patch: z.object({ question: z.string().trim().min(3).max(500), answerPoints: z.array(answerPointSchema).min(1).max(50), note: z.string().max(10_000), track: z.string().trim().min(1).max(80), tags: z.array(z.string().max(80)).max(20), relations: z.array(relationSchema).max(30), questionVariants: z.array(z.object({ id: z.string().uuid(), content: z.string(), source: z.enum(["manual", "ai"]) })).max(10), difficulty: z.number().int().min(1).max(5) }) },
  }, (input) => safe(() => domain.updateCardDraft(input)));

  server.registerTool("archive_card", {
    title: "归档卡片", description: "可恢复地归档卡片，绝不永久删除。", inputSchema: { cardId: z.string().uuid(), expectedUpdatedAt: z.string().datetime() }, annotations: { destructiveHint: true },
  }, (input) => safe(() => domain.archiveCard(input)));

  server.registerTool("publish_card", {
    title: "发布卡片", description: "将草稿加入学习队列。调用前必须已取得用户明确确认。",
    inputSchema: { cardId: z.string().uuid(), expectedUpdatedAt: z.string().datetime(), confirmation: confirmationSchema }, annotations: { destructiveHint: false },
  }, (input) => safe(() => domain.publishCard(input)));

  server.registerTool("evaluate_answer", {
    title: "评估复习答案", description: "评估答案覆盖度与建议评级，不会写入复习记录或改变 FSRS 排程。",
    inputSchema: { cardId: z.string().uuid(), presentedQuestion: z.string().min(3).max(500), answer: z.string().trim().min(1).max(10_000), comparisonMode: z.enum(["embedding", "llm"]).optional() }, annotations: { readOnlyHint: true },
  }, (input) => safe(() => domain.evaluateCardAnswer(input)));

  server.registerTool("submit_review", {
    title: "提交复习结果", description: "将用户已确认的记忆评级写入日志并更新 FSRS 排程。幂等键必须为每次用户提交唯一。",
    inputSchema: { cardId: z.string().uuid(), presentedQuestion: z.string().min(3).max(500), answer: z.string().trim().min(1).max(10_000), rating: z.enum(["again", "hard", "good", "easy"]), comparisonMode: z.enum(["embedding", "llm"]).optional(), idempotencyKey: z.string().uuid(), confirmation: confirmationSchema }, annotations: { destructiveHint: false },
  }, (input) => safe(() => domain.submitCardReview(input)));

  server.registerTool("start_interview", {
    title: "开始模拟面试", description: "创建新的模拟面试会话。调用前必须有用户明确确认。",
    inputSchema: { cardIds: z.array(z.string().uuid()).min(1).max(50).optional(), mode: z.enum(["real", "practice"]).default("real"), confirmation: confirmationSchema }, annotations: { destructiveHint: false },
  }, (input) => safe(() => { if (!input.confirmation.confirmed || !input.confirmation.summary.trim()) throw new domain.McpDomainError("CONFIRMATION_REQUIRED", "开始面试前需要用户确认。"); return domain.startInterview(input); }));

  server.registerTool("answer_interview_turn", {
    title: "提交面试回答", description: "记录当前面试轮次的回答并生成评估及下一题。", inputSchema: { sessionId: z.string().uuid(), turnId: z.string().uuid(), answer: z.string().trim().min(1).max(10_000), comparisonMode: z.enum(["embedding", "llm"]).optional(), idempotencyKey: z.string().uuid() },
  }, (input) => safe(() => domain.submitInterviewAnswer(input)));

  server.registerTool("get_interview_report", {
    title: "读取面试报告", description: "读取模拟面试会话的题目、作答和评分。", inputSchema: { sessionId: z.string().uuid() }, annotations: { readOnlyHint: true },
  }, (input) => safe(() => { const report = domain.getInterviewReport(input.sessionId); if (!report) throw new domain.McpDomainError("NOT_FOUND", "找不到面试会话。", false); return report; }));

  return server;
}

async function main() {
  const server = createStudyDeskMcpServer();
  await server.connect(new StdioServerTransport());
  console.error("Study Desk MCP server running on stdio");
}

if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) void main().catch((error) => { console.error(error); process.exitCode = 1; });
