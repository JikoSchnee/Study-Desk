import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { sqlite } from "@/lib/db";
import { getAppSettings } from "@/lib/settings";
import type { Card } from "@/lib/types";

const agentTerms = ["llm", "rag", "agent", "prompt", "tool", "memory", "evaluation", "embedding", "token", "transformer", "模型", "检索", "智能体", "提示", "工具", "评估"];

export type KnowledgeProposalStatus = "pending" | "confirmed" | "completed";
export interface KnowledgeProposal {
  id: string;
  cardId: string;
  question: string;
  targetPath: string;
  status: KnowledgeProposalStatus;
  summary: string[];
  block: string;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
}

type ProposalRow = {
  id: string;
  card_id: string;
  question: string;
  target_path: string;
  status: string;
  summary: string;
  block: string;
  created_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
};

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

function pickPath(card: Card) {
  const text = `${card.question} ${card.answer} ${card.tags.join(" ")}`.toLowerCase();
  if (/rag|retrieval|检索|embedding|向量/.test(text)) return "Agent Knowledge System → Foundations → LLM Application → Retrieval-Augmented Generation (RAG)";
  if (/prompt|提示词/.test(text)) return "Agent Knowledge System → Foundations → Prompt Engineering";
  if (/evaluation|评估|eval/.test(text)) return "Agent Knowledge System → Foundations → Evaluation Fundamentals";
  if (/tool|工具/.test(text)) return "Agent Knowledge System → Foundations → Tool Fundamentals";
  return "Agent Knowledge System → Foundations → Agent Fundamentals";
}

function isAgentCard(card: Card) { return agentTerms.some((term) => `${card.question} ${card.answer} ${card.tags.join(" ")}`.toLowerCase().includes(term)); }

function summarize(card: Card) {
  const answer = card.answer.replace(/\s+/g, " ").trim();
  const sentence = answer.split(/[。！？.!?]/).filter(Boolean).slice(0, 3);
  return sentence.length ? sentence.map((line) => line.trim()) : ["请补充定义、工作机制与适用场景。"];
}

function parseSummary(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch { return []; }
}

function normalizeStatus(status: string): KnowledgeProposalStatus {
  if (status === "confirmed" || status === "completed") return status;
  return "pending";
}

function mapRow(row: ProposalRow): KnowledgeProposal {
  return {
    id: row.id,
    cardId: row.card_id,
    question: row.question,
    targetPath: row.target_path,
    status: normalizeStatus(row.status),
    summary: parseSummary(row.summary),
    block: row.block,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    completedAt: row.completed_at,
  };
}

function latestRowsByCard() {
  const rows = sqlite.prepare("SELECT id, card_id, question, target_path, status, summary, block, created_at, confirmed_at, completed_at FROM knowledge_maintenance_proposals ORDER BY created_at DESC").all() as ProposalRow[];
  return new Map(rows.reverse().map((row) => [row.card_id, row]));
}

export function refreshKnowledgeProposals(cards: Card[]) {
  const knowledgeBasePath = getAppSettings().knowledgeBasePath.trim();
  if (!knowledgeBasePath) throw new Error("请先在设置中选择你的 Obsidian 知识库 Markdown 文件。");
  if (!existsSync(knowledgeBasePath)) throw new Error("已配置的知识库文件不存在或当前无法访问，请在设置中检查路径。");
  const content = readFileSync(knowledgeBasePath, "utf8");
  const fileHash = hash(content);
  const existing = latestRowsByCard();
  const now = new Date().toISOString();
  const update = sqlite.prepare("UPDATE knowledge_maintenance_proposals SET question = ?, target_path = ?, status = ?, summary = ?, block = ?, file_hash = ?, updated_at = ?, confirmed_at = ?, completed_at = ? WHERE id = ?");
  const insert = sqlite.prepare("INSERT INTO knowledge_maintenance_proposals (id, card_id, question, target_path, status, summary, block, file_hash, created_at, updated_at, confirmed_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

  const transaction = sqlite.transaction(() => {
    for (const card of cards.filter(isAgentCard)) {
      const marker = `mock-interview:card:${card.id}`;
      const row = existing.get(card.id);
      const status = row ? normalizeStatus(row.status) : null;

      // A marker means the user has already pasted this suggestion into Obsidian manually.
      if (content.includes(marker)) {
        if (row && status !== "completed") update.run(row.question, row.target_path, "completed", row.summary, row.block, fileHash, now, row.confirmed_at, now, row.id);
        continue;
      }

      const targetPath = pickPath(card);
      const summary = summarize(card);
      const block = `\n<!-- ${marker} -->\n> ### ${card.question}\n${summary.map((line) => `> - ${line}`).join("\n")}\n`;
      if (!row) {
        insert.run(randomUUID(), card.id, card.question, targetPath, "pending", JSON.stringify(summary), block, fileHash, now, now, null, null);
      } else if (status === "pending") {
        update.run(card.question, targetPath, "pending", JSON.stringify(summary), block, fileHash, now, null, null, row.id);
      }
    }
  });
  transaction();
  return listKnowledgeProposals();
}

export function listKnowledgeProposals() {
  const rows = sqlite.prepare("SELECT id, card_id, question, target_path, status, summary, block, created_at, confirmed_at, completed_at FROM knowledge_maintenance_proposals ORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END, updated_at DESC, created_at DESC").all() as ProposalRow[];
  return rows.map(mapRow);
}

export function confirmKnowledgeProposals(ids: string[]) {
  const now = new Date().toISOString();
  const statement = sqlite.prepare("UPDATE knowledge_maintenance_proposals SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'");
  const transaction = sqlite.transaction(() => ids.reduce((count, id) => count + statement.run(now, now, id).changes, 0));
  return { confirmed: transaction() };
}

export function completeKnowledgeProposal(id: string) {
  const now = new Date().toISOString();
  const result = sqlite.prepare("UPDATE knowledge_maintenance_proposals SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'confirmed'").run(now, now, id);
  if (!result.changes) throw new Error("这条建议尚未确认，或已完成手动处理。");
  return { completed: 1 };
}
